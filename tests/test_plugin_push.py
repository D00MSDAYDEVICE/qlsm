from unittest.mock import patch

from ui import db
from ui.models import Host, HostStatus
import ui.plugin_push as plugin_push


def _host(name, runtime, status):
    host = Host(name=name, provider='standalone', ip_address='10.0.0.1', runtime=runtime, status=status)
    db.session.add(host)
    db.session.commit()
    return host


@patch('ui.plugin_push.enqueue_task')
@patch('ui.plugin_push.acquire_lock', return_value=True)
def test_queues_only_active_hosts_of_the_given_runtime(mock_lock, mock_enqueue, app):
    with app.app_context():
        active = _host('active-minqlx', 'minqlx', HostStatus.ACTIVE)
        _host('other-runtime', 'minqlxtended', HostStatus.ACTIVE)
        configuring = _host('busy-status', 'minqlx', HostStatus.CONFIGURING)

        result = plugin_push.push_pool_to_hosts({'minqlx'})

        assert [h['name'] for h in result['queued']] == ['active-minqlx']
        assert result['skipped'] == [{'id': configuring.id, 'name': 'busy-status', 'reason': 'status: CONFIGURING'}]
        assert mock_enqueue.call_count == 1
        args, kwargs = mock_enqueue.call_args
        assert args[0] is plugin_push.apply_plugin_updates_task
        assert args[1:] == (active.id, True, {}, [])
        assert kwargs['on_failure'] is plugin_push.host_job_failure_handler
        assert isinstance(kwargs['lock_token'], str) and kwargs['lock_token']
        mock_lock.assert_called_once_with('host', active.id, kwargs['lock_token'], ttl=240)


@patch('ui.plugin_push.enqueue_task')
@patch('ui.plugin_push.acquire_lock', return_value=False)
def test_skips_a_locked_host_without_enqueueing(mock_lock, mock_enqueue, app):
    with app.app_context():
        host = _host('locked', 'minqlx', HostStatus.ACTIVE)

        result = plugin_push.push_pool_to_hosts({'minqlx'})

        assert result['queued'] == []
        assert result['skipped'] == [{'id': host.id, 'name': 'locked', 'reason': 'busy'}]
        mock_enqueue.assert_not_called()


@patch('ui.plugin_push.release_lock')
@patch('ui.plugin_push.enqueue_task', side_effect=RuntimeError('redis down'))
@patch('ui.plugin_push.acquire_lock', return_value=True)
def test_releases_the_lock_when_enqueue_fails(mock_lock, mock_enqueue, mock_release, app):
    with app.app_context():
        host = _host('flaky', 'minqlx', HostStatus.ACTIVE)

        result = plugin_push.push_pool_to_hosts({'minqlx'})

        assert result['queued'] == []
        assert result['skipped'] == [{'id': host.id, 'name': 'flaky', 'reason': 'enqueue failed'}]
        token = mock_lock.call_args.args[2]
        mock_release.assert_called_once_with('host', host.id, token)


@patch('ui.plugin_push.enqueue_task')
@patch('ui.plugin_push.acquire_lock', return_value=True)
def test_both_runtimes_when_both_were_downloaded(mock_lock, mock_enqueue, app):
    with app.app_context():
        _host('a', 'minqlx', HostStatus.ACTIVE)
        _host('b', 'minqlxtended', HostStatus.ACTIVE)

        result = plugin_push.push_pool_to_hosts({'minqlx', 'minqlxtended'})

        assert sorted(h['name'] for h in result['queued']) == ['a', 'b']
        assert result['skipped'] == []


def test_empty_runtimes_touches_nothing(app):
    with app.app_context():
        _host('a', 'minqlx', HostStatus.ACTIVE)
        assert plugin_push.push_pool_to_hosts(set()) == {'queued': [], 'skipped': []}
