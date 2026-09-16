import { EditorView } from '@codemirror/view';
import { oneDark } from '@codemirror/theme-one-dark';
import { syntaxHighlighting, HighlightStyle } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';
import { modTag, adminTag, banTag } from '../codemirror-lang-qlaccess';

// Shared CodeMirror look: the syntax colors and editor chrome used by
// CodeMirrorEditor, and by any other view (e.g. the plugin diff) that
// should match it in both themes.

// Dark highlight style
export const darkHighlightStyle = HighlightStyle.define([
  { tag: t.lineComment, class: 'custom-line-comment' },
  { tag: modTag, color: '#42a5f5' },
  { tag: adminTag, color: 'yellow' },
  { tag: banTag, color: 'red' },
  { tag: t.number, color: '#569CD6' },
  { tag: t.operator, color: '#D4D4D4' },
  { tag: t.invalid, color: '#ff6b6b', fontWeight: 'bold' },
  { tag: t.keyword, color: '#ffa500' },
  { tag: t.string, color: '#98c379' },
  { tag: t.comment, color: '#6A9955' },
  { tag: t.meta, color: '#c678dd' },
  { tag: t.attributeName, color: '#61afef' },
  { tag: t.typeName, color: '#e5c07b' },
]);

// Light highlight style — high contrast for light backgrounds
export const lightHighlightStyle = HighlightStyle.define([
  { tag: t.lineComment, color: '#6e7781' },
  { tag: modTag, color: '#0550ae' },
  { tag: adminTag, color: '#953800' },
  { tag: banTag, color: '#cf222e' },
  { tag: t.number, color: '#0550ae' },
  { tag: t.operator, color: '#24292f' },
  { tag: t.invalid, color: '#cf222e', fontWeight: 'bold' },
  { tag: t.keyword, color: '#8250df', fontWeight: 'bold' },
  { tag: t.string, color: '#0a3069' },
  { tag: t.comment, color: '#6e7781' },
  { tag: t.meta, color: '#8250df' },
  { tag: t.variableName, color: '#cf222e' },
  { tag: t.attributeName, color: '#116329' },
  { tag: t.typeName, color: '#953800' },
]);

// Dark editor chrome theme
export const darkEditorTheme = EditorView.theme({
  // Completion tooltip: description first, then where the description came
  // from, so a guess read off the cvar name never looks like a fact.
  '& .cm-cvar-info': { maxWidth: '380px', lineHeight: '1.4' },
  '& .cm-cvar-info-meta': { marginTop: '4px', fontSize: '11px', opacity: '0.85' },
  '& .cm-cvar-info-bits': { marginTop: '4px', fontSize: '11px', opacity: '0.85', columnWidth: '150px' },
  '& .cm-cvar-info-source': { marginTop: '6px', fontSize: '11px', fontStyle: 'italic', opacity: '0.7' },
  '& .custom-line-comment': { color: '#6A9955 !important' },
  '&': { height: '100%', backgroundColor: 'transparent !important' },
  '& .cm-scroller': { backgroundColor: 'transparent !important', scrollbarColor: 'var(--surface-border-strong) var(--surface-elevated)' },
  '& .cm-content': { backgroundColor: 'transparent !important' },
  '& .cm-gutters': { backgroundColor: 'var(--surface-base) !important', borderRight: '1px solid var(--surface-border)', color: 'var(--text-muted) !important' },
  '& .cm-gutter': { backgroundColor: 'var(--surface-base) !important' },
  '& .cm-lineNumbers .cm-gutterElement': { color: 'var(--text-muted) !important', opacity: '1 !important' },
  '& .cm-activeLineGutter': { backgroundColor: 'rgba(255, 255, 255, 0.05) !important' },
  '& .cm-activeLine': { backgroundColor: 'rgba(255, 255, 255, 0.03) !important' },
  '& .cm-selectionMatch': { backgroundColor: 'rgba(255, 200, 0, 0.35) !important', outline: '1px solid rgba(255, 200, 0, 0.6)' },
  '& .cm-scroller::-webkit-scrollbar': { width: '14px', height: '14px' },
  '& .cm-scroller::-webkit-scrollbar-track': { background: 'var(--surface-elevated)', borderRadius: '4px' },
  '& .cm-scroller::-webkit-scrollbar-thumb': { background: 'var(--surface-border-strong)', borderRadius: '4px', border: '3px solid var(--surface-elevated)' },
  '& .cm-scroller::-webkit-scrollbar-thumb:hover': { background: 'var(--text-muted)' },
  '& .cm-panels': { backgroundColor: '#1e1e1e', zIndex: '100' },
  '& .cm-panels-top': { borderBottom: '1px solid #444' },
  '& .cm-search': { padding: '4px 8px' },
  '& .cm-search input': { backgroundColor: '#333', color: '#fff', border: '1px solid #555', borderRadius: '3px', padding: '2px 6px' },
  '& .cm-search button': { backgroundColor: '#444', color: '#fff', border: '1px solid #555', borderRadius: '3px', padding: '2px 8px', marginLeft: '4px' },
  '& .cm-lint-marker-info': { content: '"" !important', color: '#60a5fa', fontSize: '14px', fontWeight: 'bold', fontFamily: 'serif', fontStyle: 'italic', width: '1em', textAlign: 'center' },
  '& .cm-lint-marker-info::before': { content: '"i"' },
});

// Light editor chrome theme
export const lightEditorTheme = EditorView.theme({
  // Completion tooltip: description first, then where the description came
  // from, so a guess read off the cvar name never looks like a fact.
  '& .cm-cvar-info': { maxWidth: '380px', lineHeight: '1.4' },
  '& .cm-cvar-info-meta': { marginTop: '4px', fontSize: '11px', opacity: '0.85' },
  '& .cm-cvar-info-bits': { marginTop: '4px', fontSize: '11px', opacity: '0.85', columnWidth: '150px' },
  '& .cm-cvar-info-source': { marginTop: '6px', fontSize: '11px', fontStyle: 'italic', opacity: '0.7' },
  '&': { height: '100%', backgroundColor: '#f6f8fa !important' },
  '& .cm-scroller': { backgroundColor: '#f6f8fa !important', scrollbarColor: 'var(--surface-border-strong) var(--surface-elevated)' },
  '& .cm-content': { backgroundColor: 'transparent !important', color: '#24292f' },
  '& .cm-gutters': { backgroundColor: '#eef1f5 !important', borderRight: '1px solid #d0d7de !important', color: '#636c76 !important' },
  '& .cm-gutter': { backgroundColor: '#eef1f5 !important' },
  '& .cm-lineNumbers .cm-gutterElement': { color: '#636c76 !important', opacity: '1 !important' },
  '& .cm-activeLineGutter': { backgroundColor: 'rgba(0, 0, 0, 0.06) !important', color: '#24292f !important' },
  '& .cm-activeLine': { backgroundColor: 'rgba(0, 0, 0, 0.04) !important' },
  '& .cm-selectionMatch': { backgroundColor: 'rgba(255, 180, 0, 0.3) !important', outline: '1px solid rgba(200, 140, 0, 0.7)' },
  '& .cm-cursor': { borderLeftColor: '#24292f !important' },
  '& .cm-selectionBackground': { backgroundColor: 'rgba(59, 130, 246, 0.2) !important' },
  '& .cm-matchingBracket': { backgroundColor: 'rgba(5, 80, 174, 0.15) !important', color: '#0550ae !important' },
  '& .cm-scroller::-webkit-scrollbar': { width: '14px', height: '14px' },
  '& .cm-scroller::-webkit-scrollbar-track': { background: 'var(--surface-elevated)', borderRadius: '4px' },
  '& .cm-scroller::-webkit-scrollbar-thumb': { background: 'var(--surface-border-strong)', borderRadius: '4px', border: '3px solid var(--surface-elevated)' },
  '& .cm-scroller::-webkit-scrollbar-thumb:hover': { background: 'var(--text-muted)' },
  '& .cm-panels': { backgroundColor: '#eef1f5', zIndex: '100', color: '#24292f' },
  '& .cm-panels-top': { borderBottom: '1px solid #d0d7de' },
  '& .cm-search': { padding: '4px 8px' },
  '& .cm-search input': { backgroundColor: '#fff', color: '#24292f', border: '1px solid #d0d7de', borderRadius: '3px', padding: '2px 6px' },
  '& .cm-search button': { backgroundColor: '#e8ecf1', color: '#24292f', border: '1px solid #d0d7de', borderRadius: '3px', padding: '2px 8px', marginLeft: '4px' },
  '& .cm-lint-marker-info': { content: '"" !important', color: '#2563eb', fontSize: '14px', fontWeight: 'bold', fontFamily: 'serif', fontStyle: 'italic', width: '1em', textAlign: 'center' },
  '& .cm-lint-marker-info::before': { content: '"i"' },
});

export function themeExtensions(isDark) {
  return [
    syntaxHighlighting(isDark ? darkHighlightStyle : lightHighlightStyle, { fallback: true }),
    ...(isDark ? [oneDark, darkEditorTheme] : [lightEditorTheme]),
  ];
}

// Diff colors for @codemirror/merge. Red = what the server has that the
// repository copy doesn't (left pane, .cm-merge-a); green = what the
// repository copy adds (right pane, .cm-merge-b). Tints come from the
// --accent-danger (#DC2626 / #FF3366) and --accent-primary
// (#0D9668 / #00FF9D) tokens in docs/design-system.md.
const mergeColors = {
  dark: {
    removedLine: 'rgba(255, 51, 102, 0.12)',
    removedText: 'rgba(255, 51, 102, 0.35)',
    addedLine: 'rgba(0, 255, 157, 0.10)',
    addedText: 'rgba(0, 255, 157, 0.30)',
    gutterRemoved: '#FF3366',
    gutterAdded: '#00FF9D',
    collapsed: 'var(--surface-elevated)',
  },
  light: {
    removedLine: 'rgba(220, 38, 38, 0.10)',
    removedText: 'rgba(220, 38, 38, 0.28)',
    addedLine: 'rgba(13, 150, 104, 0.10)',
    addedText: 'rgba(13, 150, 104, 0.28)',
    gutterRemoved: '#DC2626',
    gutterAdded: '#0D9668',
    collapsed: '#eef1f5',
  },
};

const mergeTheme = (c, dark) => EditorView.theme({
  // Inside a MergeView the outer .cm-mergeView scrolls, so each editor
  // grows to its content instead of filling its parent.
  '&': { height: 'auto' },
  '&.cm-merge-a .cm-changedLine': { backgroundColor: `${c.removedLine} !important` },
  '&.cm-merge-a .cm-changedText': { backgroundColor: c.removedText, textDecoration: 'none' },
  '&.cm-merge-b .cm-changedLine': { backgroundColor: `${c.addedLine} !important` },
  '&.cm-merge-b .cm-changedText': { backgroundColor: c.addedText, textDecoration: 'none' },
  '&.cm-merge-a .cm-changedLineGutter': { backgroundColor: c.gutterRemoved },
  '&.cm-merge-b .cm-changedLineGutter': { backgroundColor: c.gutterAdded },
  // The panes have no scroller of their own here (see the height rule above),
  // so a search panel would sit at the top of a document-tall editor and
  // scroll away. Pin it to the top of the visible diff instead.
  '& .cm-panels-top': {
    position: 'sticky',
    top: '0',
    zIndex: '30',
  },
  '& .cm-collapsedLines': {
    backgroundColor: c.collapsed,
    color: 'var(--text-muted)',
    backgroundImage: 'none',
  },
}, { dark });

const darkMergeTheme = mergeTheme(mergeColors.dark, true);
const lightMergeTheme = mergeTheme(mergeColors.light, false);

export function mergeThemeExtensions(isDark) {
  return [isDark ? darkMergeTheme : lightMergeTheme];
}
