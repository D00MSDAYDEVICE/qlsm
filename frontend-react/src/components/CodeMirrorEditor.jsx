import React, { useEffect, useRef } from 'react';
import { EditorState, StateEffect, Prec } from '@codemirror/state';
import { search, searchKeymap, highlightSelectionMatches } from '@codemirror/search';
import {
  EditorView,
  keymap,
  lineNumbers,
  highlightActiveLineGutter,
  highlightSpecialChars,
  drawSelection,
  dropCursor,
  rectangularSelection,
  crosshairCursor,
  highlightActiveLine,
} from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { linter, lintGutter } from '@codemirror/lint';
import { bracketMatching, indentOnInput } from '@codemirror/language';
import { useTheme } from '../context/ThemeContext';
import { completionKeymap } from '@codemirror/autocomplete';
import {
  qlaccessLanguage,
  qlAccessCompletion,
} from '../codemirror-lang-qlaccess';
import { qlcfgLanguage, qlCfgCompletion } from '../codemirror-lang-qlcfg';
import { qlFactoriesLanguage, qlFactoriesCompletion } from '../codemirror-lang-qlfactories';

import { chatLogLanguage, chatDarkHighlighting, chatLightHighlighting } from '../utils/chatLogLanguage';
import { minqlxLogLanguage, minqlxDarkHighlighting, minqlxLightHighlighting } from '../utils/minqlxLogLanguage';
import { themeExtensions } from '../utils/codemirrorSetup';

// Helper function to build extensions
const getExtensions = (currentLanguage, currentLinterSource, onChangeCallback, isReadOnly = false, isDark = true) => {
  const baseExtensions = [
    lineNumbers(),
    lintGutter(),
    highlightActiveLineGutter(),
    highlightSpecialChars(),
    history(),
    drawSelection(),
    dropCursor(),
    indentOnInput(),
    ...themeExtensions(isDark),
    bracketMatching(),
    rectangularSelection(),
    crosshairCursor(),
    highlightActiveLine(),
    highlightSelectionMatches(),
    search(),
    Prec.highest(keymap.of([
      ...completionKeymap,
      ...searchKeymap,
      ...defaultKeymap,
      ...historyKeymap,
    ])),
    EditorView.updateListener.of((update) => {
      const isProgrammaticValueSync = update.transactions.some(transaction =>
        transaction.isUserEvent('setValue')
      );
      if (update.docChanged && !isReadOnly && !isProgrammaticValueSync) {
        onChangeCallback(update.state.doc.toString());
      }
    }),
  ];

  // Add readOnly extension if needed
  if (isReadOnly) {
    baseExtensions.push(EditorState.readOnly.of(true));
  }
  if (currentLanguage) {
    baseExtensions.push(currentLanguage);

    // Add dedicated chat log highlighting (non-fallback, so custom tags are styled)
    if (currentLanguage === chatLogLanguage) {
      baseExtensions.push(isDark ? chatDarkHighlighting : chatLightHighlighting);
    }

    // Add dedicated minqlx log highlighting (non-fallback, so custom tags are styled)
    if (currentLanguage === minqlxLogLanguage) {
      baseExtensions.push(isDark ? minqlxDarkHighlighting : minqlxLightHighlighting);
    }

    // Suggest known operators (Settings -> Operators) while typing a SteamID in access.txt
    if (currentLanguage === qlaccessLanguage) {
      baseExtensions.push(qlAccessCompletion);
    }

    // Suggest engine/plugin cvar names (with descriptions) after `set `, and
    // console commands at the start of a line, in server.cfg-like files
    if (currentLanguage === qlcfgLanguage) {
      baseExtensions.push(qlCfgCompletion);
    }

    // Same, for .factories files: keys, base gametype, and cvar names inside
    // the "cvars" block
    if (currentLanguage === qlFactoriesLanguage) {
      baseExtensions.push(qlFactoriesCompletion);
    }


    // Determine the linter function to use
    // Determine the linter function to use
    let activeLinter = null;
    if (currentLinterSource) {
      // Check if the provided linterSource is one of the direct linters
      // or if it's a factory function that needs to be called.
      if (typeof currentLinterSource === 'function') {
        // Distinguish between a linter function (takes 'view') and a factory (takes 0 args)
        if (currentLinterSource.length > 0) {
          activeLinter = currentLinterSource;
        } else {
          activeLinter = currentLinterSource();
        }
      }
    } else {
      // Static linters fallback removed as we want to be explicit via props
      // If needed, they can be re-added but reliance on equality check was the issue.
      // Since EditInstanceConfigModal passes them explicitly now, this fallback block is likely redundant or risky if imports match.
      // We will leave the fallback empty or strictly safe.

    }

    // The gutter is always present so text alignment is stable across file types.
    if (activeLinter) {
      baseExtensions.push(linter(activeLinter));
    }
  }
  return baseExtensions;
};


// Pass linterSource as a prop - this should be a function that returns a linter function or null
const CodeMirrorEditor = ({ value, onChange, language, isActiveTab, linterSource = null, height = '220px', readOnly = false }) => {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const editorRef = useRef(null);
  const viewRef = useRef(null);
  const onChangeRef = useRef(onChange);
  const languageRef = useRef(language);
  const linterSourceRef = useRef(linterSource);
  const isDarkRef = useRef(isDark);

  // Keep refs updated
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);
  useEffect(() => { languageRef.current = language; }, [language]);
  useEffect(() => { linterSourceRef.current = linterSource; }, [linterSource]);
  useEffect(() => { isDarkRef.current = isDark; }, [isDark]);


  // Effect for Initialization and Cleanup (runs only once)
  useEffect(() => {
    if (editorRef.current && !viewRef.current) {
      const extensions = getExtensions(languageRef.current, linterSourceRef.current, (newValue) => onChangeRef.current(newValue), readOnly, isDarkRef.current);
      const startState = EditorState.create({
        doc: value || '',
        extensions: extensions,
      });
      const view = new EditorView({
        state: startState,
        parent: editorRef.current,
      });
      viewRef.current = view;
    }

    // Cleanup
    return () => {
      if (viewRef.current) {
        viewRef.current.destroy();
        viewRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty dependency array ensures this runs only once


  // Effect for handling external value changes
  useEffect(() => {
    if (viewRef.current) {
      const currentValueInEditor = viewRef.current.state.doc.toString();
      if (value !== currentValueInEditor) {
        const newContent = value || ''; // Ensure newContent is never null/undefined
        const newDocLength = newContent.length;

        // Get current selection BEFORE dispatching the change
        const currentSelection = viewRef.current.state.selection.main; // Get the main selection range

        // Clamp the selection anchor and head to be within the new document's bounds
        const newAnchor = Math.min(currentSelection.anchor, newDocLength);
        const newHead = Math.min(currentSelection.head, newDocLength);

        viewRef.current.dispatch({
          changes: { from: 0, to: currentValueInEditor.length, insert: newContent },
          // Use the clamped selection
          selection: { anchor: newAnchor, head: newHead },
          userEvent: 'setValue'
        });
      }
    }
  }, [value]); // Only depend on the external value prop


  // Effect for handling language/linter/theme changes
  useEffect(() => {
    if (viewRef.current) {
      const newExtensions = getExtensions(language, linterSource, (newValue) => onChangeRef.current(newValue), readOnly, isDark);
      viewRef.current.dispatch({
        effects: StateEffect.reconfigure.of(newExtensions)
      });
    }
  }, [language, linterSource, readOnly, isDark]);


  // Effect to refresh editor when tab becomes active (remains the same)
  useEffect(() => {
    if (isActiveTab && viewRef.current) {
      const timer = setTimeout(() => {
        if (viewRef.current) {
          viewRef.current.requestMeasure();
        }
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [isActiveTab]);


  return (
    <div
      ref={editorRef}
      className="codemirror-editor-container [&_.cm-editor]:h-full" // Ensures .cm-editor inside fills this container
      style={
        height === '100%'
          ? { height: '100%', minHeight: '100px', overflow: 'hidden' } // For full height scenarios (like the modal)
          : { // Default style for tabbed view
            height: height, // Use passed height or default '220px'
            minHeight: '100px',
            maxHeight: '75vh',
            resize: 'vertical',
            overflow: 'auto',
          }
      }
    />
  );
};

// Memoize the component
const MemoizedCodeMirrorEditor = React.memo(CodeMirrorEditor);
export default MemoizedCodeMirrorEditor;
