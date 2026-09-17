# ui/plugin_push.py
#
# Fans a common-pool refresh out to every host that should receive a plugin
# that just landed in the operator tier of the shared pool
# (data/shared-plugins/<runtime>/, see ui/plugin_pool.py). Each host gets the
# same RQ job "Check for Updates -> Update Selected" would enqueue with only
# the common-pool box ticked (ui/task_logic/ansible_plugin_update.py), so
# lock, failure handler and host-log behaviour are identical to that flow.
#
# Only ACTIVE hosts of a matching runtime are touched. Anything else is
# reported back as skipped with a reason so the UI can tell the operator
# which hosts still need a manual Check for Updates.

import logging
import uuid

from ui.database import get_hosts
from ui.models import HostStatus
from ui.runtime import host_runtime
from ui.task_lock import acquire_lock, release_lock
from ui.task_logic.job_failure_handlers import host_job_failure_handler
from ui.tasks import apply_plugin_updates_task, enqueue_task

log = logging.getLogger(__name__)

# Same TTL as apply_plugin_updates_api in ui/routes/host_routes.py.
PUSH_LOCK_TTL = 240


def push_pool_to_hosts(runtimes):
    """Enqueue a common-pool refresh on every ACTIVE host whose runtime is in
    `runtimes`. Returns {"queued": [{"id", "name"}],
    "skipped": [{"id", "name", "reason"}]}. Never raises for a single host's
    failure: that host is reported as skipped and the rest still go out."""
    result = {"queued": [], "skipped": []}
    runtimes = set(runtimes or ())
    if not runtimes:
        return result

    for host in get_hosts():
        if host_runtime(host) not in runtimes:
            continue
        if host.status != HostStatus.ACTIVE:
            result["skipped"].append({"id": host.id, "name": host.name, "reason": f"status: {host.status.name}"})
            continue

        token = str(uuid.uuid4())
        if not acquire_lock('host', host.id, token, ttl=PUSH_LOCK_TTL):
            result["skipped"].append({"id": host.id, "name": host.name, "reason": "busy"})
            continue
        try:
            enqueue_task(
                apply_plugin_updates_task, host.id, True, {}, [],
                lock_token=token, on_failure=host_job_failure_handler,
            )
        except Exception:
            release_lock('host', host.id, token)
            log.exception(f"push_pool_to_hosts: could not enqueue common pool refresh for host {host.name}")
            result["skipped"].append({"id": host.id, "name": host.name, "reason": "enqueue failed"})
            continue
        log.info(f"push_pool_to_hosts: queued common pool refresh for host {host.name}")
        result["queued"].append({"id": host.id, "name": host.name})

    return result
