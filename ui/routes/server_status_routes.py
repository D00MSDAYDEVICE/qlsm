import json
import logging
import re

import requests

from flask import Blueprint, jsonify, current_app
from flask_jwt_extended import jwt_required
from ui import limiter

logger = logging.getLogger(__name__)

server_status_bp = Blueprint('server_status', __name__)

STATUS_KEY_PATTERN = 'server:status:*'
WORKSHOP_PREVIEW_CACHE_KEY_PREFIX = 'steam:workshop:preview'
WORKSHOP_PREVIEW_CACHE_TTL = 86400  # 24 hours
WORKSHOP_PREVIEW_NEGATIVE_TTL = 1800  # 30 minutes
WORKSHOP_PREVIEW_NONE_SENTINEL = '__none__'
STEAM_PUBLISHED_FILE_DETAILS_URL = (
    'https://api.steampowered.com/ISteamRemoteStorage/GetPublishedFileDetails/v1/'
)
WORKSHOP_PREVIEW_RATE_LIMIT = '30 per minute'
WORKSHOP_DESCRIPTION_MAX_CHARS = 300
_BBCODE_TAG_RE = re.compile(r'\[/?[a-zA-Z0-9*]+(?:=[^\]]*)?\]')
_WHITESPACE_RE = re.compile(r'\s+')


def _clean_text(value):
    if not isinstance(value, str):
        return None
    value = value.strip()
    return value or None


def _clean_description(raw):
    """Steam descriptions are BBCode; reduce to a short plain-text snippet."""
    if not isinstance(raw, str):
        return None
    text = _WHITESPACE_RE.sub(' ', _BBCODE_TAG_RE.sub(' ', raw)).strip()
    if not text:
        return None
    if len(text) > WORKSHOP_DESCRIPTION_MAX_CHARS:
        text = text[:WORKSHOP_DESCRIPTION_MAX_CHARS].rstrip() + '…'
    return text


def _read_workshop_preview_cache(redis_client, cache_key):
    """Return (found, details_or_none) for the workshop preview cache.

    Values written before titles were cached are bare URL strings; they are
    treated as a miss so the item is fetched again with its title.
    """
    if redis_client is None:
        return False, None

    try:
        raw = redis_client.get(cache_key)
        if raw is None:
            return False, None
        if raw == WORKSHOP_PREVIEW_NONE_SENTINEL:
            return True, None
        details = json.loads(raw)
        if not isinstance(details, dict):
            return False, None
        return True, {
            'preview_url': details.get('preview_url'),
            'title': details.get('title'),
            'description': details.get('description'),
        }
    except (TypeError, ValueError):
        return False, None
    except Exception as e:
        logger.warning(f"Error reading workshop preview cache key {cache_key}: {e}")
        return False, None


def _write_workshop_preview_cache(redis_client, cache_key, details):
    """Write workshop preview cache. Caches misses with shorter TTL."""
    if redis_client is None:
        return

    try:
        if details:
            redis_client.setex(cache_key, WORKSHOP_PREVIEW_CACHE_TTL, json.dumps(details))
        else:
            redis_client.setex(
                cache_key,
                WORKSHOP_PREVIEW_NEGATIVE_TTL,
                WORKSHOP_PREVIEW_NONE_SENTINEL,
            )
    except Exception as e:
        logger.warning(f"Error writing workshop preview cache key {cache_key}: {e}")


def _fetch_workshop_details_from_steam(workshop_id):
    """Fetch preview_url/title/description for a workshop item.

    Returns None when the item does not exist or on any failure.
    """
    try:
        response = requests.post(
            STEAM_PUBLISHED_FILE_DETAILS_URL,
            data={
                'itemcount': '1',
                'publishedfileids[0]': str(workshop_id),
            },
            timeout=(5, 5),
        )
        response.raise_for_status()

        payload = response.json() or {}
        items = payload.get('response', {}).get('publishedfiledetails', [])
        if not items:
            return None

        item = items[0]
        # Steam reports result 9 (and no title) for unknown ids
        if item.get('result', 1) != 1:
            return None
        details = {
            'preview_url': _clean_text(item.get('preview_url')),
            'title': _clean_text(item.get('title')),
            'description': _clean_description(item.get('description')),
        }
        if not details['preview_url'] and not details['title']:
            return None
        return details
    except Exception as e:
        logger.warning(f"Error fetching workshop preview for {workshop_id}: {e}")
        return None


def _workshop_preview_response(workshop_id, details, source):
    details = details or {}
    return jsonify({
        "data": {
            "workshop_id": workshop_id,
            "found": bool(details),
            "preview_url": details.get('preview_url'),
            "title": details.get('title'),
            "description": details.get('description'),
            "source": source,
        }
    })


@server_status_bp.route('', methods=['GET'])
@jwt_required()
def get_server_status():
    """
    Returns live status for all instances from the management Redis cache.

    Response: {"data": {"<instance_id>": <status_data_or_null>}}
    Keys are instance IDs as strings. Null means data unavailable/stale.
    """
    redis_client = current_app.extensions.get('redis')
    if redis_client is None:
        return jsonify({"data": {}})

    try:
        keys = redis_client.keys(STATUS_KEY_PATTERN)
        result = {}
        for key in keys:
            # Key format: server:status:<host_id>:<instance_id>
            instance_id = key.split(':')[-1]
            raw = redis_client.get(key)
            result[instance_id] = json.loads(raw) if raw else None
        return jsonify({"data": result})
    except Exception as e:
        logger.error(f"Error reading server status from Redis: {e}", exc_info=True)
        return jsonify({"data": {}})


@server_status_bp.route('/workshop-preview/<workshop_id>', methods=['GET'])
@limiter.limit(WORKSHOP_PREVIEW_RATE_LIMIT)
@jwt_required()
def get_workshop_preview(workshop_id):
    """Return preview URL, title and description for a workshop item (Redis cached)."""
    workshop_id = str(workshop_id).strip()
    if not re.fullmatch(r'\d+', workshop_id):
        return jsonify({"error": {"message": "workshop_id must be numeric"}}), 400

    redis_client = current_app.extensions.get('redis')
    cache_key = f'{WORKSHOP_PREVIEW_CACHE_KEY_PREFIX}:{workshop_id}'

    found, details = _read_workshop_preview_cache(redis_client, cache_key)
    if found:
        return _workshop_preview_response(workshop_id, details, 'cache')

    details = _fetch_workshop_details_from_steam(workshop_id)
    _write_workshop_preview_cache(redis_client, cache_key, details)
    return _workshop_preview_response(workshop_id, details, 'steam')
