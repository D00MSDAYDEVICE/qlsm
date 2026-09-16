"""External plugin repositories: fetch a `qlsm-plugins.json` manifest over
plain HTTP from an operator-supplied repo URL, and download individual plugin
files from it into the operator tier of the local pool
(data/shared-plugins/<runtime>/, see ui/plugin_pool.py).

This is deliberately separate from `.ql-plugin.json` (plugin_manifest.py,
per-plugin display/edit metadata for a file already in the pool) and from the
qlsm control-plane addon system (docs/superpowers/specs/...-qlsm-addon-system-
design.md, extensions to qlsm itself) -- a repository is just a remote source
list for THIS manifest format's files.

Repo manifest shape, all fields but `filename` optional:
    {"plugins": [
        {"filename": "some_plugin.py", "label": "...", "description": "...",
         "runtime": "minqlx" | "minqlxtended" | "minqlxtended-patched",
         "requires_qlsm_version": "1.30.0",
         "cvars": [...], "commands": [...]},
        ...
    ]}
`filename` must be a bare, root-level, importable module name ending in
.py -- same constraint the pool itself enforces (see plugin_manifest.py /
pluginSelection.js isEnableablePluginPath). `requires_qlsm_version` is the
plugin author's own claim, compared against this qlsm's own VERSION file by
version_risk() below -- see that function's docstring for what "risk" does
and does not mean here (operator decision, 2026-09-14).
`cvars`/`commands` use the `.ql-plugin.json` shape; on download they (with
label/description) become the plugin's pool sidecar unless the repo also
ships a separate `<plugin>.ql-plugin.json`, which wins.
"""
import json
import logging
import os
import re

import requests

from ui.plugin_manifest import PLUGIN_MANIFEST_MAX_SIZE
from ui.plugin_pool import operator_pool_dir, resolve_pool_file
from ui.runtime import is_valid_runtime

logger = logging.getLogger(__name__)

MANIFEST_FILENAME = 'qlsm-plugins.json'
MANIFEST_MAX_SIZE = 256 * 1024
PLUGIN_FILE_MAX_SIZE = 512 * 1024
FETCH_TIMEOUT_SECONDS = 10

# A plugin file is a Python module loaded by bare name -- no dots, no path
# separators, nothing but what a valid module name and this pool allow.
_FILENAME_RE = re.compile(r'^[A-Za-z0-9_\-]+\.py$')


def is_safe_plugin_filename(filename):
    """A bare `<name>.py` -- no path separators, no dots besides the
    extension. Anything else never reaches a pool path."""
    return isinstance(filename, str) and bool(_FILENAME_RE.match(filename))

# The part of a repo manifest entry that becomes the plugin's pool sidecar
# (<plugin>.ql-plugin.json). Everything else on an entry (filename, runtime,
# requires_qlsm_version) only matters for listing/downloading.
_SIDECAR_FIELDS = ('label', 'description', 'cvars', 'commands')
_INLINE_LIST_FIELDS = ('cvars', 'commands')


class PluginRepositoryError(Exception):
    """Any fetch/parse/download failure. The message is written to be shown
    to the operator verbatim -- it never carries raw exception internals.
    `code` is set only for failures the caller (the route, then the UI) needs
    to branch on rather than just display -- currently just 'exists', so a
    download-blocked-by-an-existing-file can offer an overwrite confirmation
    instead of a dead-end error."""

    def __init__(self, message, code=None):
        super().__init__(message)
        self.code = code


def _fetch(url, max_size):
    try:
        response = requests.get(url, timeout=FETCH_TIMEOUT_SECONDS)
    except requests.RequestException as e:
        raise PluginRepositoryError(f"Could not reach {url}: {e}") from e
    if response.status_code != 200:
        raise PluginRepositoryError(f"{url} returned HTTP {response.status_code}")
    content = response.content
    if len(content) > max_size:
        raise PluginRepositoryError(f"{url} is larger than the {max_size} byte limit")
    return content


def _normalize_eol(data):
    """CRLF/CR -> LF, so two copies of a plugin that differ only in line
    endings compare equal (CodeMirror shows them as identical too)."""
    return data.replace(b'\r\n', b'\n').replace(b'\r', b'\n')


def fetch_plugin_source(base_url, filename):
    """The raw bytes of <base_url>/<filename>, under the plugin size cap.
    Shared by download and diff so both read exactly the same URL."""
    return _fetch(base_url.rstrip('/') + '/' + filename, PLUGIN_FILE_MAX_SIZE)


# GitHub's repository page serves HTML, not files, so a pasted repo URL has to
# become a raw.githubusercontent.com base before anything can be fetched from
# it. The branch is rarely in the URL, so both common defaults are tried in
# turn (cheaper and more reliable than the rate-limited GitHub API).
GITHUB_BRANCH_CANDIDATES = ('main', 'master')
_GITHUB_REPO_RE = re.compile(
    r'^https?://(?:www\.)?github\.com/(?P<owner>[^/]+)/(?P<repo>[^/]+?)(?:\.git)?'
    r'(?:/tree/(?P<branch>[^/]+)(?P<subdir>/.*)?)?/?$'
)
_GITHUB_RAW_BASE = 'https://raw.githubusercontent.com'


def github_raw_bases(url):
    """Raw base URLs to try for a github.com repository URL, best first.

    Returns [] for anything else (including a raw URL already), which the
    caller treats as "use this URL as given". A URL naming its own branch
    (/tree/<branch>, optionally with a subfolder) yields exactly one
    candidate; otherwise one per GITHUB_BRANCH_CANDIDATES.
    """
    match = _GITHUB_REPO_RE.match((url or '').strip())
    if not match:
        return []
    owner, repo = match.group('owner'), match.group('repo')
    subdir = (match.group('subdir') or '').strip('/')
    tail = f'/{subdir}' if subdir else ''
    branches = [match.group('branch')] if match.group('branch') else list(GITHUB_BRANCH_CANDIDATES)
    return [f'{_GITHUB_RAW_BASE}/{owner}/{repo}/{branch}{tail}/' for branch in branches]


def resolve_manifest_source(url, fetch=None):
    """(fetch_url, plugins) for a repository URL the operator typed.

    A github.com URL is rewritten to its raw form and each branch candidate
    tried until one serves a manifest; every other URL is fetched as given.
    Raises PluginRepositoryError when nothing works -- naming the branches
    tried, since "not valid JSON" would not tell the operator what to fix.
    `fetch` is the manifest fetcher to use, so the caller can pass the name
    its own module exports (which is what tests patch).
    """
    fetch = fetch or fetch_manifest
    candidates = github_raw_bases(url)
    if not candidates:
        return url, fetch(url)

    last_error = None
    for candidate in candidates:
        try:
            return candidate, fetch(candidate)
        except PluginRepositoryError as e:
            last_error = e
    if len(candidates) > 1:
        raise PluginRepositoryError(
            f"No {MANIFEST_FILENAME} found in that repository on "
            f"{' or '.join(GITHUB_BRANCH_CANDIDATES)}."
        )
    raise last_error


def _manifest_url(base_url):
    return base_url.rstrip('/') + '/' + MANIFEST_FILENAME


def fetch_manifest(base_url):
    """Fetch and validate <base_url>/qlsm-plugins.json.

    Returns the normalized plugin list (a list of dicts, always present even
    if empty). A malformed individual entry is dropped rather than failing
    the whole fetch -- same "never throws on one bad entry" rule
    plugin_manifest.py already applies to `.ql-plugin.json`. Raises
    PluginRepositoryError for anything wrong with the fetch itself or the
    manifest's outer shape.
    """
    content = _fetch(_manifest_url(base_url), MANIFEST_MAX_SIZE)
    try:
        data = json.loads(content)
    except ValueError as e:
        raise PluginRepositoryError(f"{_manifest_url(base_url)} is not valid JSON: {e}") from e
    if not isinstance(data, dict) or not isinstance(data.get('plugins'), list):
        raise PluginRepositoryError(
            f"{_manifest_url(base_url)} must be a JSON object with a \"plugins\" array"
        )

    plugins = []
    for entry in data['plugins']:
        if not isinstance(entry, dict):
            continue
        filename = entry.get('filename')
        if not isinstance(filename, str) or not _FILENAME_RE.match(filename):
            continue
        plugin = {
            'filename': filename,
            'label': entry['label'] if isinstance(entry.get('label'), str) and entry['label'].strip() else None,
            'description': (
                entry['description'] if isinstance(entry.get('description'), str) and entry['description'].strip()
                else None
            ),
            'runtime': entry.get('runtime') if is_valid_runtime(entry.get('runtime')) else None,
            'requires_qlsm_version': (
                entry['requires_qlsm_version']
                if isinstance(entry.get('requires_qlsm_version'), str) and entry['requires_qlsm_version'].strip()
                else None
            ),
        }
        # Inline sidecar metadata: kept only when well-formed, and only added
        # when present so plain entries keep their existing shape.
        for field in _INLINE_LIST_FIELDS:
            if isinstance(entry.get(field), list):
                plugin[field] = entry[field]
        plugins.append(plugin)
    return plugins


def build_inline_manifest(entry):
    """The pool sidecar dict for a repo manifest entry, or None when the entry
    carries no metadata (a bare {"filename": ...}, or only empty values) or
    the result is bigger than plugin_manifest.py would read anyway. The size
    is measured on compact json.dumps() output, which is exactly what
    download_plugin() writes."""
    if not entry:
        return None
    # Falsy means absent: None, '' and [] all count as "no metadata here".
    manifest = {field: entry[field] for field in _SIDECAR_FIELDS if entry.get(field)}
    if not manifest:
        return None
    if len(json.dumps(manifest).encode('utf-8')) > PLUGIN_MANIFEST_MAX_SIZE:
        logger.warning(f"Inline manifest for {entry.get('filename')} exceeds {PLUGIN_MANIFEST_MAX_SIZE} bytes, skipping")
        return None
    return manifest


def _read_app_version():
    """This qlsm install's own VERSION file. Mirrors
    ui/task_logic/backup_export.py's _read_app_version() -- kept as its own
    copy rather than a shared import since it's five lines and the two
    modules have no other reason to depend on each other."""
    try:
        with open('VERSION', 'r', encoding='utf-8') as f:
            return f.read().strip()
    except OSError:
        return None


def _parse_dotted_version(value):
    if not isinstance(value, str):
        return None
    parts = value.strip().split('.')
    if not parts:
        return None
    try:
        return tuple(int(p) for p in parts)
    except ValueError:
        return None


def version_risk(requires_qlsm_version, current_qlsm_version=None):
    """Whether a plugin's declared `requires_qlsm_version` is a known problem
    for this install.

    We cannot confirm a plugin works at all -- not below its stated
    requirement, and not above it either, since "requires >= X" says nothing
    about whether a much newer qlsm broke something the plugin relies on.
    The one thing we CAN state with certainty is the opposite case: this
    install is older than what the plugin declares it needs, so a feature it
    depends on (e.g. a `.ql-plugin.json` field a later qlsm release added)
    may simply not exist yet. That -- and only that -- gets a hard warning;
    everything else returns None (no verdict, shown as plain info in the UI).
    """
    if current_qlsm_version is None:
        current_qlsm_version = _read_app_version()
    required = _parse_dotted_version(requires_qlsm_version)
    current = _parse_dotted_version(current_qlsm_version)
    if required is None or current is None or required <= current:
        return None
    return {
        'level': 'hard',
        'message': f"Needs qlsm >= {requires_qlsm_version}; this install runs {current_qlsm_version}.",
    }


def download_plugin(base_url, filename, runtime, overwrite=False, inline_manifest=None):
    """Fetch <base_url>/<filename> over HTTP and write it into the local pool
    for `runtime`, together with its `.ql-plugin.json` sidecar: the repo's own
    separate sidecar file when it ships a parseable one, else
    `inline_manifest` (the entry's metadata from qlsm-plugins.json, see
    build_inline_manifest), else none -- and any stale pool sidecar is
    removed. The separate-sidecar fetch is always attempted, even when
    `inline_manifest` is given, because the separate file wins by design;
    for a single-file repo that is one expected 404 per plugin. Raises
    PluginRepositoryError if the plugin source itself can't be fetched; a
    missing, malformed or non-object separate sidecar is not an error.

    Writes always land in the operator tier (data/shared-plugins/<runtime>/);
    the built-in tier inside the image is never modified. Refuses to shadow a
    file already in the merged pool -- an earlier download, or a bundled
    plugin such as balance.py -- unless `overwrite` is set (a copy that
    matches apart from line endings is left alone instead): the operator copy
    then wins over the bundled one on every host and breaks the manifest.json
    sha256 baseline, so it has to be a deliberate choice. The caller (the
    route) is the one that turns this into an operator-facing
    confirm-and-retry. Sidecar handling is scoped to the operator tier: a
    bundled plugin's own sidecar stays where it is, and read_plugin_manifest()
    still falls back to it when the download brings none of its own.
    """
    if not is_safe_plugin_filename(filename):
        raise PluginRepositoryError(f"Refusing to download unsafe filename: {filename!r}")

    pool_dir = operator_pool_dir(runtime)
    os.makedirs(pool_dir, exist_ok=True)
    dest_path = os.path.join(pool_dir, filename)

    source = fetch_plugin_source(base_url, filename)
    existing_path = resolve_pool_file(runtime, filename)
    if existing_path and not overwrite:
        # Same code already in the pool (ignoring CRLF/LF) is "up to date",
        # not a collision: keep the local copy as is and only sync the
        # sidecar below. Otherwise the operator decides via the prompt.
        with open(existing_path, 'rb') as f:
            existing = f.read()
        if _normalize_eol(existing) != _normalize_eol(source):
            raise PluginRepositoryError(
                f"{filename} already exists in the local pool.", code='exists',
            )
    else:
        with open(dest_path, 'wb') as f:
            f.write(source)

    manifest_filename = filename[:-len('.py')] + '.ql-plugin.json'
    manifest_path = os.path.join(pool_dir, manifest_filename)
    try:
        manifest_content = _fetch(base_url.rstrip('/') + '/' + manifest_filename, MANIFEST_MAX_SIZE)
        # Validate before writing -- same trust boundary as the .py source.
        # Must be a JSON object: load_manifest_file() rejects anything else,
        # so a repo shipping `[]` here should fall through to inline instead.
        if not isinstance(json.loads(manifest_content), dict):
            raise ValueError('sidecar is not a JSON object')
    except (PluginRepositoryError, ValueError):
        # Compact JSON on purpose: build_inline_manifest() measured the
        # compact form against PLUGIN_MANIFEST_MAX_SIZE, and the pool reader
        # checks the on-disk size against the same cap.
        manifest_content = json.dumps(inline_manifest).encode('utf-8') if inline_manifest else None
    if manifest_content is None:
        # No usable sidecar this time around -- a stale one from a previous
        # download of this same filename must not linger and describe the
        # new .py incorrectly.
        if os.path.exists(manifest_path):
            os.remove(manifest_path)
        return
    with open(manifest_path, 'wb') as f:
        f.write(manifest_content)
