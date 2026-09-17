import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import FileTree from '../FileTree';
import { PLUGIN_CAPS } from '../capabilities';

function rowTexts(tree) {
  return within(tree).getAllByRole('button')
    .map(b => b.textContent.trim())
    .filter(t => t.length > 0);
}

function FolderHarness({ files, ...props }) {
  const [expanded, setExpanded] = useState(new Set());
  return (
    <FileTree
      files={files}
      onSelectFile={vi.fn()}
      expandedFolders={expanded}
      onToggleFolder={(path) => setExpanded(prev => {
        const next = new Set(prev);
        next.has(path) ? next.delete(path) : next.add(path);
        return next;
      })}
      {...props}
    />
  );
}

describe('FileTree', () => {
  it('renders folders collapsed by default', () => {
    render(
      <FolderHarness
        files={[
          {
            name: 'extras',
            path: 'extras',
            type: 'folder',
            children: [
              { name: 'discord.py', path: 'extras/discord.py', type: 'file' },
            ],
          },
        ]}
        foldersEnabled
      />,
    );

    expect(screen.getByRole('button', { name: /extras/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /discord\.py/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /extras/i }));

    expect(screen.getByRole('button', { name: /discord\.py/i })).toBeInTheDocument();
  });

  it('sorts checked files first, then unchecked files alphabetically', () => {
    render(
      <FileTree
        files={[
          { name: 'zeta.py', path: 'zeta.py', type: 'file' },
          { name: 'bravo.py', path: 'bravo.py', type: 'file' },
          { name: 'alpha.py', path: 'alpha.py', type: 'file' },
          { name: 'charlie.py', path: 'charlie.py', type: 'file' },
        ]}
        onSelectFile={vi.fn()}
        checkable
        checkedFiles={new Set(['bravo.py', 'alpha.py'])}
      />,
    );

    const tree = screen.getByPlaceholderText(/search files/i).closest('.flex-col');
    expect(rowTexts(tree)).toEqual(['alpha.py', 'bravo.py', 'charlie.py', 'zeta.py']);
  });

  it('keeps folders before checked and unchecked files in plugin trees', () => {
    render(
      <FolderHarness
        files={[
          { name: 'zeta.py', path: 'zeta.py', type: 'file' },
          { name: 'extras', path: 'extras', type: 'folder', children: [] },
          { name: 'alpha.py', path: 'alpha.py', type: 'file' },
          { name: 'bravo.py', path: 'bravo.py', type: 'file' },
        ]}
        checkable
        checkedFiles={new Set(['bravo.py', 'alpha.py'])}
        foldersEnabled
      />,
    );

    const tree = screen.getByPlaceholderText(/search files/i).closest('.flex-col');
    expect(rowTexts(tree)).toEqual(['extras', 'alpha.py', 'bravo.py', 'zeta.py']);
  });

  it('does not move a file when the user checks it mid-session', () => {
    function TreeHarness() {
      const [checkedFiles, setCheckedFiles] = useState(new Set(['alpha.py']));
      const handleCheck = (path, checked) => {
        setCheckedFiles(prev => {
          const next = new Set(prev);
          if (checked) next.add(path);
          else next.delete(path);
          return next;
        });
      };

      return (
        <FileTree
          files={[
            { name: 'alpha.py', path: 'alpha.py', type: 'file' },
            { name: 'bravo.py', path: 'bravo.py', type: 'file' },
            { name: 'zeta.py', path: 'zeta.py', type: 'file' },
          ]}
          onSelectFile={vi.fn()}
          checkable
          checkedFiles={checkedFiles}
          onCheck={handleCheck}
        />
      );
    }

    render(<TreeHarness />);

    const tree = screen.getByPlaceholderText(/search files/i).closest('.flex-col');
    expect(rowTexts(tree)).toEqual(['alpha.py', 'bravo.py', 'zeta.py']);

    fireEvent.click(within(tree).getAllByRole('checkbox')[2]);

    expect(rowTexts(tree)).toEqual(['alpha.py', 'bravo.py', 'zeta.py']);
  });

  describe('rootOnlyCheckable', () => {
    const pluginFiles = [
      {
        name: 'discord_extensions',
        path: 'discord_extensions',
        type: 'folder',
        children: [
          { name: 'admin.py', path: 'discord_extensions/admin.py', type: 'file' },
        ],
      },
      { name: 'essentials.py', path: 'essentials.py', type: 'file' },
      { name: '__init__.py', path: '__init__.py', type: 'file' },
    ];

    function renderPluginTree() {
      return render(
        <FolderHarness
          files={pluginFiles}
          foldersEnabled
          checkable
          checkedFiles={new Set()}
          onCheck={vi.fn()}
          capabilities={PLUGIN_CAPS}
        />,
      );
    }

    it('keeps the checkbox on a root-level plugin', () => {
      renderPluginTree();
      expect(screen.getAllByRole('checkbox')).toHaveLength(1);
      expect(screen.queryByTestId('plugin-hint-essentials.py')).not.toBeInTheDocument();
    });

    it('marks a shared plugin row and keeps it enableable', () => {
      render(
        <FolderHarness
          files={[{ name: 'hello_qlsm.py', path: 'hello_qlsm.py', type: 'file', shared: true }]}
          foldersEnabled
          checkable
          checkedFiles={new Set()}
          onCheck={vi.fn()}
          capabilities={PLUGIN_CAPS}
        />,
      );

      expect(screen.getByTestId('plugin-shared-hello_qlsm.py')).toHaveTextContent(/shared/i);
      expect(screen.getAllByRole('checkbox')).toHaveLength(1);
    });

    it('marks a shared plugin the host does not have yet and wires the push', () => {
      const onPushToHost = vi.fn();
      render(
        <FolderHarness
          files={[{ name: 'afkplus.py', path: 'afkplus.py', type: 'file', shared: true }]}
          foldersEnabled
          checkable
          checkedFiles={new Set()}
          onCheck={vi.fn()}
          capabilities={PLUGIN_CAPS}
          missingOnHost={new Set(['afkplus.py'])}
          onPushToHost={onPushToHost}
        />,
      );
      expect(screen.getByTestId('plugin-missing-afkplus.py')).toHaveTextContent(/not on host/i);
      fireEvent.click(screen.getByTestId('plugin-push-afkplus.py'));
      expect(onPushToHost).toHaveBeenCalled();
    });

    it('shows a note when host pool status is unavailable', () => {
      render(
        <FolderHarness
          files={[{ name: 'afkplus.py', path: 'afkplus.py', type: 'file', shared: true }]}
          foldersEnabled
          capabilities={PLUGIN_CAPS}
          hostPoolUnavailable
        />,
      );
      expect(screen.getByText(/host pool status unavailable/i)).toBeInTheDocument();
    });

    it('disables rename and delete on a shared plugin row', async () => {
      render(
        <FolderHarness
          files={[{ name: 'hello_qlsm.py', path: 'hello_qlsm.py', type: 'file', shared: true }]}
          foldersEnabled
          checkable
          checkedFiles={new Set()}
          onCheck={vi.fn()}
          capabilities={PLUGIN_CAPS}
        />,
      );

      await userEvent.click(screen.getByRole('button', { name: /file actions/i }));

      const rename = await screen.findByRole('menuitem', { name: /rename/i });
      expect(rename).toHaveAttribute('aria-disabled', 'true');
      expect(screen.getByRole('menuitem', { name: /delete/i })).toHaveAttribute('aria-disabled', 'true');
    });

    it('replaces the checkbox with a hint on __init__.py', () => {
      renderPluginTree();
      expect(screen.getByTestId('plugin-hint-__init__.py')).toBeInTheDocument();
    });

    it('hides the folder hint while the folder is collapsed', () => {
      renderPluginTree();
      expect(screen.queryByTestId('plugin-hint-discord_extensions')).not.toBeInTheDocument();
    });

    it('shows one hint on the folder, not on its children, once expanded', () => {
      renderPluginTree();
      fireEvent.click(screen.getByRole('button', { name: /discord_extensions/i }));

      expect(screen.getByTestId('plugin-hint-discord_extensions')).toBeInTheDocument();
      expect(screen.queryByTestId('plugin-hint-discord_extensions/admin.py')).not.toBeInTheDocument();
      expect(screen.getAllByRole('checkbox')).toHaveLength(1);
    });

    it('hides the folder hint again when the folder is collapsed', () => {
      renderPluginTree();
      const folder = screen.getByRole('button', { name: /discord_extensions/i });
      fireEvent.click(folder);
      fireEvent.click(folder);

      expect(screen.queryByTestId('plugin-hint-discord_extensions')).not.toBeInTheDocument();
    });

    it('shows the subfolder explanation on folder hover', () => {
      renderPluginTree();
      fireEvent.click(screen.getByRole('button', { name: /discord_extensions/i }));
      fireEvent.mouseEnter(screen.getByTestId('plugin-hint-discord_extensions'));

      expect(screen.getByRole('tooltip')).toHaveTextContent(
        /Plugins in subfolders can't be enabled directly/,
      );
    });

    it('leaves a hint off a folder that holds no plugin files', () => {
      render(
        <FolderHarness
          files={[{
            name: 'assets',
            path: 'assets',
            type: 'folder',
            children: [{ name: 'notes.txt', path: 'assets/notes.txt', type: 'file' }],
          }]}
          foldersEnabled
          checkable
          checkedFiles={new Set()}
          onCheck={vi.fn()}
          capabilities={PLUGIN_CAPS}
        />,
      );
      fireEvent.click(screen.getByRole('button', { name: /assets/i }));

      expect(screen.queryByTestId('plugin-hint-assets')).not.toBeInTheDocument();
    });

    it('shows the package-marker explanation on __init__.py hover', () => {
      renderPluginTree();
      fireEvent.mouseEnter(screen.getByTestId('plugin-hint-__init__.py'));

      expect(screen.getByRole('tooltip')).toHaveTextContent(/marks a package/);
    });

    it('shows a cvars settings button when the manifest declares cvars and onEditCvars is passed', () => {
      render(
        <FolderHarness
          files={[
            {
              name: 'essentials.py',
              path: 'essentials.py',
              type: 'file',
              plugin_manifest: { cvars: [{ cvar: 'qlx_foo', type: 'bool' }] },
            },
            { name: '__init__.py', path: '__init__.py', type: 'file' },
          ]}
          foldersEnabled
          checkable
          checkedFiles={new Set()}
          onCheck={vi.fn()}
          capabilities={PLUGIN_CAPS}
          onEditCvars={vi.fn()}
        />,
      );
      expect(screen.getByTestId('plugin-cvars-essentials.py')).toBeInTheDocument();
    });

    it('lists a plugin by filename and puts the manifest label in its tooltip', () => {
      render(
        <FolderHarness
          files={[{
            name: 'afk.py',
            path: 'afk.py',
            type: 'file',
            plugin_manifest: { label: 'AFK Plus', description: 'Kicks idle players.' },
          }]}
          checkable
          checkedFiles={new Set()}
          onCheck={vi.fn()}
          capabilities={PLUGIN_CAPS}
        />,
      );
      expect(screen.getByText('afk.py')).toBeInTheDocument();
      expect(screen.queryByText('AFK Plus')).not.toBeInTheDocument();
      fireEvent.mouseEnter(screen.getByTestId('plugin-manifest-afk.py'));
      expect(screen.getByRole('tooltip')).toHaveTextContent('AFK Plus — Kicks idle players.');
    });

    it('still shows the label tooltip when the manifest has only a label', () => {
      render(
        <FolderHarness
          files={[{ name: 'afk.py', path: 'afk.py', type: 'file', plugin_manifest: { label: 'AFK Plus' } }]}
          checkable
          checkedFiles={new Set()}
          onCheck={vi.fn()}
          capabilities={PLUGIN_CAPS}
        />,
      );
      fireEvent.mouseEnter(screen.getByTestId('plugin-manifest-afk.py'));
      expect(screen.getByRole('tooltip')).toHaveTextContent('AFK Plus');
    });

    it('omits the cvars settings button when the manifest has no cvars', () => {
      renderPluginTree();
      expect(screen.queryByTestId('plugin-cvars-essentials.py')).not.toBeInTheDocument();
    });

    // The trailing controls are a fixed order — badge, cvars gear, row menu —
    // and the gear keeps its slot when a row has no cvars, so the badge lands
    // at the same offset on every row instead of sliding right.
    it('orders the trailing controls badge, gear, then row menu', () => {
      render(
        <FolderHarness
          files={[
            {
              name: 'essentials.py',
              path: 'essentials.py',
              type: 'file',
              shared: true,
              plugin_manifest: { cvars: [{ cvar: 'qlx_foo', type: 'bool' }] },
            },
          ]}
          foldersEnabled
          checkable
          checkedFiles={new Set()}
          onCheck={vi.fn()}
          capabilities={PLUGIN_CAPS}
          onEditCvars={vi.fn()}
        />,
      );

      const badge = screen.getByTestId('plugin-shared-essentials.py');
      const gear = screen.getByTestId('plugin-cvars-essentials.py');
      const menu = screen.getByRole('button', { name: /file actions/i });

      expect(badge.compareDocumentPosition(gear) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(gear.compareDocumentPosition(menu) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      // The badge must sit outside the name button, or the name's width moves it.
      expect(badge.closest('button')).toBeNull();
    });

    it('keeps an empty gear slot on a plugin row with no cvars', () => {
      const { container } = render(
        <FolderHarness
          files={[{ name: 'essentials.py', path: 'essentials.py', type: 'file', shared: true }]}
          foldersEnabled
          checkable
          checkedFiles={new Set()}
          onCheck={vi.fn()}
          capabilities={PLUGIN_CAPS}
          onEditCvars={vi.fn()}
        />,
      );

      expect(screen.queryByTestId('plugin-cvars-essentials.py')).not.toBeInTheDocument();
      const slot = container.querySelector('.w-\\[13px\\]');
      expect(slot).toBeInTheDocument();
      expect(slot).toBeEmptyDOMElement();
    });

    it('reserves no gear slot outside the Plugins tab', () => {
      const { container } = render(
        <FolderHarness
          files={[{ name: 'server.cfg', path: 'server.cfg', type: 'file' }]}
          foldersEnabled
          capabilities={{}}
        />,
      );

      expect(container.querySelector('.w-\\[13px\\]')).toBeNull();
    });

    it('omits the cvars settings button when onEditCvars is not passed', () => {
      render(
        <FolderHarness
          files={[{
            name: 'essentials.py',
            path: 'essentials.py',
            type: 'file',
            plugin_manifest: { cvars: [{ cvar: 'qlx_foo', type: 'bool' }] },
          }]}
          foldersEnabled
          checkable
          checkedFiles={new Set()}
          onCheck={vi.fn()}
          capabilities={PLUGIN_CAPS}
        />,
      );
      expect(screen.queryByTestId('plugin-cvars-essentials.py')).not.toBeInTheDocument();
    });

    it('calls onEditCvars with the item and normalized cvars on click, without toggling the checkbox', () => {
      const onEditCvars = vi.fn();
      const onCheck = vi.fn();
      render(
        <FolderHarness
          files={[{
            name: 'essentials.py',
            path: 'essentials.py',
            type: 'file',
            plugin_manifest: { cvars: [{ cvar: 'qlx_foo', type: 'bool', default: true }] },
          }]}
          foldersEnabled
          checkable
          checkedFiles={new Set()}
          onCheck={onCheck}
          capabilities={PLUGIN_CAPS}
          onEditCvars={onEditCvars}
        />,
      );

      fireEvent.click(screen.getByTestId('plugin-cvars-essentials.py'));

      expect(onCheck).not.toHaveBeenCalled();
      expect(onEditCvars).toHaveBeenCalledTimes(1);
      const [item, cvars] = onEditCvars.mock.calls[0];
      expect(item.path).toBe('essentials.py');
      expect(cvars).toEqual([{ cvar: 'qlx_foo', label: 'qlx_foo', description: null, type: 'bool', default: true, min: null, max: null }]);
    });

    it('leaves factories checkable when the flag is absent', () => {
      render(
        <FileTree
          files={[{ name: 'ffa.factories', path: 'ffa.factories', type: 'file' }]}
          onSelectFile={vi.fn()}
          checkable
          checkedFiles={new Set()}
          onCheck={vi.fn()}
          capabilities={{}}
        />,
      );
      expect(screen.getAllByRole('checkbox')).toHaveLength(1);
    });
  });
});
