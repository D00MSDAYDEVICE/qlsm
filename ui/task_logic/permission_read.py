"""Read the live minqlx admin levels out of an instance's Redis database.

The mirror image of access_permission_sync's write path: one bounded SSH
command running a small python script on the host. SCAN, not KEYS, so a large
database cannot block Redis. Only levels above 0 come back -- a key set to 0 is
a revoked admin, not an admin. Also reads each admin's last known in-game name
(`minqlx:players:<steamid>:current_name`, falling back to the newest entry of
the `minqlx:players:<steamid>` name-history list).
"""

import base64
import json
import logging
import subprocess

from ui.admin_permissions import STEAMID64_RE
from ui.constants import resolve_redis_db
from ui.task_logic.access_permission_sync import (
    SSH_CONNECT_TIMEOUT,
    build_ssh_python_command,
    redis_password_for_host,
)

logger = logging.getLogger(__name__)

READ_TIMEOUT = SSH_CONNECT_TIMEOUT + 5
UNREACHABLE_MESSAGE = "The server is unreachable, so admin levels could not be read."
NAME_MAX_LENGTH = 64


def _remote_read_script(db, redis_password):
    password_b64 = (
        base64.b64encode(redis_password.encode()).decode() if redis_password is not None else None
    )
    return f'''import base64
import json
import redis

password_b64 = {password_b64!r}
password = base64.b64decode(password_b64).decode() if password_b64 is not None else None
client = redis.Redis(db={db}, password=password, socket_connect_timeout=3, socket_timeout=3)

levels = {{}}
for key in client.scan_iter(match="minqlx:players:*:permission", count=500):
    key_text = key.decode() if isinstance(key, bytes) else key
    parts = key_text.split(":")
    if len(parts) != 4:
        continue
    raw = client.get(key_text)
    if raw is None:
        continue
    raw_text = raw.decode() if isinstance(raw, bytes) else raw
    try:
        levels[parts[2]] = int(raw_text)
    except (TypeError, ValueError):
        continue

names = {{}}
try:
    admin_ids = [sid for sid, level in levels.items() if level > 0]
    if admin_ids:
        current = client.mget(["minqlx:players:%s:current_name" % sid for sid in admin_ids])
        missing = []
        for sid, raw_name in zip(admin_ids, current):
            if raw_name:
                names[sid] = raw_name.decode("utf-8", "replace") if isinstance(raw_name, bytes) else raw_name
            else:
                missing.append(sid)
        if missing:
            pipe = client.pipeline()
            for sid in missing:
                pipe.lindex("minqlx:players:%s" % sid, 0)
            for sid, raw_name in zip(missing, pipe.execute()):
                if raw_name:
                    names[sid] = raw_name.decode("utf-8", "replace") if isinstance(raw_name, bytes) else raw_name
except Exception:
    names = {{}}

print(json.dumps({{"levels": levels, "names": names}}))
'''


def build_read_command(host, db, redis_password=None):
    return build_ssh_python_command(host, _remote_read_script(db, redis_password))


def _names_for(admins, raw_names):
    """Only non-empty string names of SteamIDs in `admins`, capped in length."""
    if not isinstance(raw_names, dict):
        return {}
    admin_ids = {a["steam_id64"] for a in admins}
    return {
        steam_id: name[:NAME_MAX_LENGTH]
        for steam_id, name in raw_names.items()
        if steam_id in admin_ids and isinstance(name, str) and name
    }


def read_live_admins(instance):
    """(admins, names, error). admins is [{'steam_id64', 'level'}] sorted by
    SteamID, levels 1-5 only; names maps those SteamIDs to their last in-game
    name where minqlx recorded one. (None, None, message) when the server could
    not be read and (None, None, None) when the instance has no host."""
    host = getattr(instance, "host", None)
    if host is None:
        return None, None, None

    command = build_read_command(
        host, resolve_redis_db(instance), redis_password=redis_password_for_host(host)
    )
    instance_id = getattr(instance, "id", "?")
    try:
        result = subprocess.run(command, capture_output=True, text=True, timeout=READ_TIMEOUT)
    except subprocess.TimeoutExpired:
        logger.warning("Timed out reading admin levels for instance %s", instance_id)
        return None, None, UNREACHABLE_MESSAGE
    except Exception:
        logger.exception("Failed to read admin levels for instance %s", instance_id)
        return None, None, UNREACHABLE_MESSAGE

    if result.returncode != 0:
        logger.warning("Admin level read failed for instance %s: %s",
                       instance_id, (result.stderr or "")[:200])
        return None, None, UNREACHABLE_MESSAGE

    try:
        payload = json.loads(result.stdout)
        levels = payload.get("levels") or {}
        # A key that is not a SteamID must never reach the client: it would
        # then fail validation and block the whole config save.
        admins = [
            {"steam_id64": str(steam_id), "level": int(level)}
            for steam_id, level in levels.items()
            if STEAMID64_RE.match(str(steam_id)) and 0 < int(level) <= 5
        ]
    except (AttributeError, json.JSONDecodeError, TypeError, ValueError):
        logger.warning("Admin level read returned unparseable output for instance %s", instance_id)
        return None, None, UNREACHABLE_MESSAGE

    admins = sorted(admins, key=lambda a: a["steam_id64"])
    return admins, _names_for(admins, payload.get("names")), None
