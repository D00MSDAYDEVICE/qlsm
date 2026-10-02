"""Installed addons must live inside the data volume every deployment mounts.

A dedicated ./addon-packages bind mount only exists in compose files newer
than a59f023; an install on an older (or hand-copied) compose lost its addon
files on every container recreate while the DB row still said "installed".
"""
import os
import re
import subprocess
from pathlib import Path

from ui.task_logic.backup_files import backup_file_trees

ENTRYPOINT = Path(__file__).resolve().parent.parent / 'entrypoint.sh'


def test_default_install_dir_is_inside_the_data_volume(monkeypatch):
    monkeypatch.delenv('ADDON_PACKAGES_DIR', raising=False)
    import importlib
    import ui.config
    importlib.reload(ui.config)
    try:
        assert os.path.normpath(ui.config.Config.ADDON_PACKAGES_DIR) == os.path.join('data', 'addon-packages')
    finally:
        importlib.reload(ui.config)


def test_backup_captures_the_install_dir_under_its_old_archive_prefix():
    trees = {prefix: fs_dir for prefix, fs_dir, _skip in backup_file_trees()}
    assert os.path.normpath(trees['addon-packages']) == os.path.join('data', 'addon-packages')


def _migrate(tmp_path, env_extra=None):
    """Run entrypoint.sh's migrate_legacy_addon_packages against tmp dirs."""
    text = ENTRYPOINT.read_text()
    func = re.search(r'migrate_legacy_addon_packages\(\) \{.*?\n\}\n', text, re.S).group(0)
    func = func.replace('/app/addon-packages', str(tmp_path / 'old')).replace(
        '/app/data/addon-packages', str(tmp_path / 'new'))
    env = {'PATH': os.environ['PATH'], 'RUN_MIGRATIONS': 'true', **(env_extra or {})}
    return subprocess.run(['sh', '-c', func + '\nmigrate_legacy_addon_packages'],
                          env=env, capture_output=True, text=True)


def _legacy_addon(tmp_path):
    (tmp_path / 'old' / 'player-ranks').mkdir(parents=True)
    (tmp_path / 'old' / 'player-ranks' / 'qlsm-addon.json').write_text('{}')


def test_legacy_addons_are_copied_once_and_the_old_copy_is_kept(tmp_path):
    _legacy_addon(tmp_path)
    result = _migrate(tmp_path)
    assert result.returncode == 0, result.stderr
    assert (tmp_path / 'new' / 'player-ranks' / 'qlsm-addon.json').is_file()
    assert (tmp_path / 'old' / 'player-ranks' / 'qlsm-addon.json').is_file()


def test_existing_new_dir_is_never_overwritten(tmp_path):
    _legacy_addon(tmp_path)
    (tmp_path / 'new' / 'other').mkdir(parents=True)
    _migrate(tmp_path)
    assert not (tmp_path / 'new' / 'player-ranks').exists()


def test_non_web_services_and_explicit_overrides_skip_the_copy(tmp_path):
    _legacy_addon(tmp_path)
    _migrate(tmp_path, {'RUN_MIGRATIONS': 'false'})
    _migrate(tmp_path, {'ADDON_PACKAGES_DIR': '/somewhere/else'})
    assert not (tmp_path / 'new').exists()


def test_no_legacy_mount_is_a_clean_noop(tmp_path):
    result = _migrate(tmp_path)
    assert result.returncode == 0
    assert not (tmp_path / 'new').exists()
