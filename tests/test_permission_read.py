import json
import shlex
import subprocess
from types import SimpleNamespace

from ui.task_logic import permission_read as mod


def _host():
    return SimpleNamespace(id=1, name="germany-1", provider="standalone", ip_address="91.99.3.72",
                           ssh_key_path="/keys/germany.pem", ssh_port=22, ssh_user="root")


def _instance(host=None):
    return SimpleNamespace(id=99, port=27965, redis_db=2, host=host)


def _stub_run(monkeypatch, returncode=0, stdout="", stderr=""):
    monkeypatch.setattr(mod.subprocess, "run",
                        lambda *a, **k: SimpleNamespace(returncode=returncode, stdout=stdout, stderr=stderr))


def test_build_read_command_targets_the_host_over_ssh():
    command = mod.build_read_command(_host(), 2)
    assert command[0] == "ssh"
    assert command[-2] == "91.99.3.72"
    assert "scan_iter" in shlex.split(command[-1])[2]


def test_returns_admins_sorted_and_drops_level_zero_and_junk_keys(monkeypatch):
    _stub_run(monkeypatch, stdout=json.dumps({"levels": {
        "76561198087654321": 5, "76561198012345678": 3,
        "76561198000000001": 0, "bot-17": 5, "76561198000000002": 9,
    }}))
    admins, names, error = mod.read_live_admins(_instance(host=_host()))
    assert admins == [
        {"steam_id64": "76561198012345678", "level": 3},
        {"steam_id64": "76561198087654321", "level": 5},
    ]
    assert names == {}
    assert error is None


def test_returns_names_only_for_listed_admins(monkeypatch):
    _stub_run(monkeypatch, stdout=json.dumps({
        "levels": {"76561198087654321": 5, "76561198012345678": 3, "76561198000000001": 0},
        "names": {
            "76561198087654321": "^1ST01C",
            "76561198012345678": "",
            "76561198000000001": "revoked",
            "bot-17": "junk",
        },
    }))
    admins, names, error = mod.read_live_admins(_instance(host=_host()))
    assert names == {"76561198087654321": "^1ST01C"}
    assert error is None


def test_long_or_non_string_names_are_capped_or_dropped(monkeypatch):
    _stub_run(monkeypatch, stdout=json.dumps({
        "levels": {"76561198087654321": 5, "76561198012345678": 3},
        "names": {"76561198087654321": "x" * 200, "76561198012345678": 42},
    }))
    _, names, _ = mod.read_live_admins(_instance(host=_host()))
    assert names == {"76561198087654321": "x" * 64}


def test_unparseable_names_do_not_fail_the_read(monkeypatch):
    _stub_run(monkeypatch, stdout=json.dumps({
        "levels": {"76561198087654321": 5}, "names": ["not", "a", "dict"],
    }))
    admins, names, error = mod.read_live_admins(_instance(host=_host()))
    assert admins == [{"steam_id64": "76561198087654321", "level": 5}]
    assert names == {}
    assert error is None


def test_read_script_fetches_current_name_with_list_fallback():
    script = shlex.split(mod.build_read_command(_host(), 2)[-1])[2]
    assert ":current_name" in script
    assert "lindex" in script
    compile(script, "<remote>", "exec")  # remote script must be valid python


def test_ssh_failure_and_timeout_report_unreachable(monkeypatch):
    _stub_run(monkeypatch, returncode=255, stderr="No route to host")
    admins, names, error = mod.read_live_admins(_instance(host=_host()))
    assert admins is None and names is None and "unreachable" in error.lower()

    def boom(*args, **kwargs):
        raise subprocess.TimeoutExpired(cmd="ssh", timeout=10)

    monkeypatch.setattr(mod.subprocess, "run", boom)
    admins, names, error = mod.read_live_admins(_instance(host=_host()))
    assert admins is None and names is None and error


def test_no_host_is_not_an_error():
    assert mod.read_live_admins(_instance(host=None)) == (None, None, None)
