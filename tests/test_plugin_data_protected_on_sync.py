"""Plugin data files in the instance plugins dir must survive --delete syncs.

Plugins such as autokick keep logs and pattern lists next to their .py file.
The scripts sync mirrors configs/<host>/<id>/scripts/ with delete: yes, so
without protect rules every config sync silently wiped that data.
"""
import shlex
import shutil
import subprocess

import pytest
import yaml

SYNC_KEY = "ansible.builtin.synchronize"
PLAYBOOKS = [
    "ansible/playbooks/sync_instance_configs_and_restart.yml",
    "ansible/playbooks/add_qlds_instance.yml",
]
PROTECTED = ["*.log", "*.txt", "*.json", "*.db"]


def _scripts_sync(playbook):
    with open(playbook) as f:
        tasks = yaml.safe_load(f)[0]["tasks"]
    return next(
        t[SYNC_KEY] for t in tasks
        if SYNC_KEY in t and t[SYNC_KEY].get("src", "").endswith("/scripts/")
    )


@pytest.mark.parametrize("playbook", PLAYBOOKS)
def test_scripts_sync_protects_plugin_data(playbook):
    sync = _scripts_sync(playbook)
    assert sync["delete"] is True
    assert sync["dest"] == "{{ qlds_dir }}/{{ runtime_plugins_dirname }}/"
    for pattern in PROTECTED:
        assert f"--filter=P_{pattern}" in sync["rsync_opts"]


@pytest.mark.parametrize("playbook", PLAYBOOKS)
def test_filter_rules_contain_no_spaces(playbook):
    # synchronize joins rsync_opts with spaces and shlex-splits the result,
    # so a "P *.log" rule would be broken into two arguments.
    for opt in _scripts_sync(playbook)["rsync_opts"]:
        assert " " not in opt


@pytest.mark.skipif(shutil.which("rsync") is None, reason="rsync not installed")
def test_rsync_keeps_protected_files_and_deletes_stale_plugins(tmp_path):
    src, dst = tmp_path / "src", tmp_path / "dst"
    src.mkdir()
    dst.mkdir()
    (src / "autokick.py").write_text("new")
    (src / "autokick_patterns.txt").write_text("from qlsm")
    (dst / "removed_plugin.py").write_text("stale")
    (dst / "autokick.log").write_text("log")
    (dst / "state.json").write_text("{}")

    opts = " ".join(_scripts_sync(PLAYBOOKS[0])["rsync_opts"])
    cmd = f"rsync -a --delete-after {opts} {src}/ {dst}/"
    subprocess.run(shlex.split(cmd), check=True)

    assert not (dst / "removed_plugin.py").exists()
    assert (dst / "autokick.log").read_text() == "log"
    assert (dst / "state.json").exists()
    # Protected files are still pushed when QLSM has them.
    assert (dst / "autokick_patterns.txt").read_text() == "from qlsm"
