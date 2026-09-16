import datetime
import json

from flask import Blueprint, request, jsonify, current_app
from flask_jwt_extended import jwt_required

from ui import db
from ui.models import PluginRepository
from ui.plugin_repositories import (
    PluginRepositoryError,
    build_inline_manifest,
    download_plugin,
    fetch_manifest,
    github_raw_bases,
    resolve_manifest_source,
    version_risk,
)
from ui.runtime import is_valid_runtime, normalize_runtime

plugin_repository_api_bp = Blueprint('plugin_repository_routes', __name__)


def _validate_name(name):
    if not isinstance(name, str):
        return None, 'Name is required.'
    name = name.strip()
    if not name:
        return None, 'Name is required.'
    if len(name) > 100:
        return None, 'Name must be at most 100 characters.'
    return name, None


def _validate_url(url):
    if not isinstance(url, str):
        return None, 'URL is required.'
    url = url.strip()
    if not url:
        return None, 'URL must start with http:// or https://.'
    if len(url) > 500:
        return None, 'URL must be at most 500 characters.'
    if not (url.startswith('http://') or url.startswith('https://')):
        return None, 'URL must start with http:// or https://.'
    return url, None


def _repo_urls(repo):
    """Both addresses a repository answers to: what qlsm fetches, and what
    the operator typed if that was rewritten."""
    return {u.rstrip('/') for u in (repo.url, repo.display_url) if u}


def _sync(repo, resolve=False):
    """Fetch the manifest, annotate each entry with its version risk, and
    persist the result. Returns (ok, error_message).

    `resolve` is for the first sync of a newly added repository: the operator
    may have typed a github.com repo URL, which has to be resolved to a raw
    base (and a branch found) before anything can be fetched. Later syncs go
    straight to the resolved `repo.url`.
    """
    try:
        if resolve:
            repo.url, plugins = resolve_manifest_source(repo.url, fetch_manifest)
        else:
            plugins = fetch_manifest(repo.url)
    except PluginRepositoryError as e:
        repo.last_sync_error = str(e)
        return False, str(e)

    for entry in plugins:
        entry['version_risk'] = version_risk(entry.get('requires_qlsm_version'))

    repo.manifest_json = json.dumps(plugins)
    repo.last_synced_at = datetime.datetime.utcnow()
    repo.last_sync_error = None
    return True, None


@plugin_repository_api_bp.route('/', methods=['GET'])
@jwt_required()
def list_plugin_repositories():
    repos = PluginRepository.query.order_by(PluginRepository.name).all()
    return jsonify({'data': [r.to_dict() for r in repos]}), 200


@plugin_repository_api_bp.route('/', methods=['POST'])
@jwt_required()
def create_plugin_repository():
    """Add a repository and sync it immediately, so the operator sees its
    plugin list (or the reason it failed) without a second action."""
    data = request.get_json()
    if not data:
        return jsonify({'error': {'message': 'Request body must be JSON.'}}), 400

    name, name_error = _validate_name(data.get('name', ''))
    if name_error:
        return jsonify({'error': {'message': name_error}}), 400

    url, url_error = _validate_url(data.get('url', ''))
    if url_error:
        return jsonify({'error': {'message': url_error}}), 400

    # Names compare case-insensitively and URLs ignore a trailing slash, so
    # 'Test' vs 'test' or '.../repo' vs '.../repo/' don't add a second card
    # for the same repository.
    existing = PluginRepository.query.all()
    if any(r.name.lower() == name.lower() for r in existing):
        return jsonify({'error': {'message': f"Repository '{name}' already exists."}}), 409
    same_url = next((r for r in existing if url.rstrip('/') in _repo_urls(r)), None)
    if same_url:
        return jsonify({'error': {'message': f"This URL is already added as '{same_url.name}'."}}), 409

    repo = PluginRepository(name=name, url=url)
    _sync(repo, resolve=True)
    # Only worth keeping when resolution actually rewrote it (a github.com
    # URL -> its raw base); otherwise the card would repeat the same string.
    repo.display_url = url if repo.url != url else None

    try:
        db.session.add(repo)
        db.session.commit()
        current_app.logger.info(f"Plugin repository '{name}' ({url}) added.")
        return jsonify({'data': repo.to_dict()}), 201
    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"Error creating plugin repository '{name}': {e}")
        return jsonify({'error': {'message': 'Failed to create repository.'}}), 500


@plugin_repository_api_bp.route('/<int:repo_id>/sync', methods=['POST'])
@jwt_required()
def sync_plugin_repository(repo_id):
    """Re-fetch the manifest for an existing repository."""
    repo = db.session.get(PluginRepository, repo_id)
    if not repo:
        return jsonify({'error': {'message': 'Repository not found.'}}), 404

    # A repository whose very first sync failed still holds the github.com URL
    # the operator typed -- resolution happens inside _sync(resolve=True) and
    # never ran. Syncing that URL fetches GitHub's HTML 404 forever, so retry
    # the resolution here instead of leaving the repo permanently unsyncable.
    original_url = repo.url
    needs_resolve = bool(github_raw_bases(repo.url))
    ok, error = _sync(repo, resolve=needs_resolve)
    if needs_resolve and ok and repo.url != original_url:
        repo.display_url = original_url
    try:
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"Error saving sync result for repository {repo_id}: {e}")
        return jsonify({'error': {'message': 'Failed to save sync result.'}}), 500

    if not ok:
        return jsonify({'error': {'message': error}, 'data': repo.to_dict()}), 502
    return jsonify({'data': repo.to_dict()}), 200


@plugin_repository_api_bp.route('/<int:repo_id>', methods=['DELETE'])
@jwt_required()
def delete_plugin_repository(repo_id):
    repo = db.session.get(PluginRepository, repo_id)
    if not repo:
        return jsonify({'error': {'message': 'Repository not found.'}}), 404

    try:
        name = repo.name
        db.session.delete(repo)
        db.session.commit()
        current_app.logger.info(f"Plugin repository '{name}' deleted.")
        return jsonify({'message': f"Repository '{name}' deleted."}), 200
    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"Error deleting plugin repository {repo_id}: {e}")
        return jsonify({'error': {'message': 'Failed to delete repository.'}}), 500


@plugin_repository_api_bp.route('/<int:repo_id>/download', methods=['POST'])
@jwt_required()
def download_plugin_repository_plugins(repo_id):
    """Download the operator's selected filenames from this repo into the
    local pool. Each entry in `filenames` needs a `runtime` to resolve which
    pool it lands in -- the manifest's own declared runtime (looked up from
    the last synced list) when it has one, else the operator's pick for that
    file in `runtimes` ({filename: runtime}), since a repo entry may leave
    `runtime` unset. A pick never overrides a declared runtime.

    The repo manifest is re-fetched once per request so each plugin's inline
    metadata (label/description/cvars/commands) matches the file downloaded;
    that fresh list feeds metadata only, and a plugin missing from it (or a
    failed fetch) falls back to the last-synced entry.

    `overwrite: true` in the body is required to replace a pool file that
    already exists -- see download_plugin()."""
    repo = db.session.get(PluginRepository, repo_id)
    if not repo:
        return jsonify({'error': {'message': 'Repository not found.'}}), 404

    data = request.get_json()
    if not data or not isinstance(data.get('filenames'), list) or not data['filenames']:
        return jsonify({'error': {'message': 'filenames must be a non-empty list of strings.'}}), 400

    picked_runtimes = data.get('runtimes') or {}
    if not isinstance(picked_runtimes, dict):
        return jsonify({'error': {'message': 'runtimes must be an object of filename -> runtime.'}}), 400
    for picked in picked_runtimes.values():
        if not is_valid_runtime(picked):
            return jsonify({'error': {'message': f"Unknown runtime: {picked!r}"}}), 400

    overwrite = bool(data.get('overwrite'))

    known_by_filename = {}
    for entry in repo.to_dict()['plugins']:
        known_by_filename[entry['filename']] = entry

    # Re-read the repo manifest so the cvars written next to each .py match
    # the .py being downloaded right now, not whatever the last sync saw.
    # Metadata only: runtime resolution stays on the stored entry above (the
    # list the UI showed and the operator acted on). Not persisted -- _sync()
    # stays the one writer of manifest_json.
    try:
        fresh_by_filename = {fresh['filename']: fresh for fresh in fetch_manifest(repo.url)}
    except PluginRepositoryError:
        fresh_by_filename = {}

    downloaded, errors = [], []
    for filename in data['filenames']:
        if not isinstance(filename, str):
            errors.append({'filename': filename, 'error': 'Not a string.'})
            continue
        entry = known_by_filename.get(filename)
        declared_runtime = (entry or {}).get('runtime')
        runtime = declared_runtime if is_valid_runtime(declared_runtime) else picked_runtimes.get(filename)
        if not is_valid_runtime(runtime):
            errors.append({
                'filename': filename,
                'error': 'No runtime declared for this plugin. Pick one for it before downloading.',
            })
            continue
        try:
            download_plugin(
                repo.url, filename, normalize_runtime(runtime), overwrite=overwrite,
                inline_manifest=build_inline_manifest(fresh_by_filename.get(filename) or entry),
            )
            downloaded.append(filename)
        except PluginRepositoryError as e:
            errors.append({'filename': filename, 'error': str(e), 'code': e.code})

    # This is the one route that writes remote executable Python into the pool,
    # which ansible then ships to every host -- so record what landed, from
    # where, and whether it replaced a file that was already there.
    if downloaded:
        current_app.logger.info(
            f"Downloaded {len(downloaded)} plugin(s) from repository '{repo.name}' ({repo.url}) "
            f"into the local pool (overwrite={overwrite}): {', '.join(downloaded)}"
        )

    status = 200 if downloaded and not errors else (207 if downloaded else 502)
    return jsonify({'downloaded': downloaded, 'errors': errors}), status
