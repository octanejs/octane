# Lexical React upstream

`@octanejs/lexical` ports the React-facing layer from
[`@lexical/react@0.51.0`](https://github.com/facebook/lexical/releases/tag/v0.51.0)
while reusing Lexical's framework-neutral editor packages.

## Immutable pin

- Package: `@lexical/react@0.51.0`
- Tag: `v0.51.0` (annotated tag object `3ab06eba0a36ab0b6dba91b1ff7d4b7dda15193a`)
- Commit: `4c61ded2134f68c8106198d504fd1fb1fff8497a`
- Repository: `https://github.com/facebook/lexical.git`
- Source root: `packages/lexical-react/src`
- Test root: `packages/lexical-react/src/__tests__`
- License: MIT
- npm archive SHA-256: `37af6defc5008ed23dd52323c5e5b2244f0ed3467c01a795c2660e792bddcf08`
- Supported upstream range: exactly `0.51.0`
- React oracle: `react@19.2.7` and `react-dom@19.2.7`

The npm archive contains compiled runtime, Flow declarations, metadata, and the
license, but not the repository test suite. The pinned repository has a runtime
suite but no separate executable type-test suite for `packages/lexical-react`;
published Flow declarations are artifacts, not tests. The runtime suite has not
been vendored, and only part of it is adapted (see below), so the parity manifest
remains `recorded-unverified`.

## Public entry-point crosswalk

Every entry below is published both extensionless and with a `.js` alias; each
alias has the same disposition as its extensionless entry.

| Upstream entry point | Octane disposition | Evidence or gap |
| --- | --- | --- |
| `LexicalAutoEmbedPlugin`, `LexicalAutoFocusPlugin`, `LexicalAutoLinkPlugin` | Ported | Local phase plugin tests; no exhaustive upstream adaptation. |
| `LexicalBlockWithAlignableContents`, `LexicalCharacterLimitPlugin`, `LexicalCheckListPlugin` | Ported | Local unit coverage; no exhaustive upstream adaptation. |
| `LexicalClearEditorPlugin`, `LexicalClickableLinkPlugin`, `LexicalCollaborationContext` | Ported | Local plugin and smoke coverage; no exhaustive upstream adaptation. |
| `LexicalComposer`, `LexicalComposerContext`, `LexicalContentEditable` | Ported | Composer, editor, content-editable, and differential coverage. |
| `LexicalDecoratorBlockNode`, `LexicalDraggableBlockPlugin`, `LexicalEditorRefPlugin` | Ported | Local unit coverage; no exhaustive upstream adaptation. |
| `LexicalErrorBoundary` | Ported Octane adaptation | Uses an Octane error boundary rather than React's class boundary; this surface is outside the current equality lane. |
| `LexicalHashtagPlugin`, `LexicalHistoryPlugin`, `LexicalHorizontalRuleNode`, `LexicalHorizontalRulePlugin` | Ported | Local plugin coverage; no exhaustive upstream adaptation. |
| `LexicalLinkPlugin`, `LexicalListPlugin`, `LexicalMarkdownShortcutPlugin` | Ported | The list differential covers `LexicalListPlugin`; remaining evidence is local only. |
| `LexicalNestedComposer`, `LexicalNodeContextMenuPlugin`, `LexicalNodeEventPlugin`, `LexicalNodeMenuPlugin` | Ported | Dedicated local menu and nested-composer tests. |
| `LexicalOnChangePlugin`, `LexicalPlainTextPlugin`, `LexicalRichTextPlugin` | Ported | Local unit coverage and the rich-text differential. |
| `LexicalSelectionAlwaysOnDisplay`, `LexicalTabIndentationPlugin`, `LexicalTableOfContentsPlugin`, `LexicalTablePlugin` | Ported | Local plugin coverage; no exhaustive upstream adaptation. |
| `LexicalTypeaheadMenuPlugin` | Ported | Dedicated local typeahead-menu tests. |
| `LexicalMenuOption`, `LexicalTypeaheadMenuPluginUtils`, `LexicalAutoEmbedPluginUtils`, `LexicalCollaborationContextUtils` | Ported | New in 0.51.0 as separate entry points; the plugin modules re-export them, so class and command identities are shared. |
| `useLexicalAriaLiveRegion`, `useLexicalFocusManagerRef`, `useLexicalFocusTrapRef`, `useLexicalRovingTabIndexRef` | Ported | New in 0.51.0; require an editor built from the matching `@lexical/a11y` extension. |
| `useLexicalEditable`, `useLexicalIsTextContentEmpty`, `useLexicalNodeSelection`, `useLexicalSlotRef`, `useLexicalSubscription`, `useLexicalTextEntity` | Ported | Local unit/fixture coverage; no exhaustive upstream adaptation. |
| `LexicalCollaborationPlugin` | Not ported | Requires a real two-peer Yjs collaboration harness. |
| `LexicalExtensionComposer`, `LexicalExtensionEditorComposer` | Not ported | Wrap the newer React-only extension subsystem. |
| `LexicalTreeView` | Not ported | Wraps the React component from `@lexical/devtools-core`. |
| `ExtensionComponent`, `ReactExtension`, `ReactPluginHostExtension`, `ReactProviderExtension`, `TreeViewExtension`, `useExtensionComponent`, `useExtensionSignalValue` | Not ported | React extension-system entry points; excluded from the bounded equality claim. |

The Octane package uses `@octanejs/floating-ui`, the Octane port of
`@floating-ui/react`, and accepts refs as ordinary props rather than through
`forwardRef`. Menu positioning also reads page offsets, the viewport and
scroll/resize events from the editor's owner window, where upstream 0.51.0 reads
the host window after creating the anchor in the owner document; this only
differs for an editor inside an iframe. Those are binding adaptations outside
the two registered differential cases; they are not claimed as verified
divergences by this manifest.

## Upstream suite disposition

| Pinned artifact | Current disposition |
| --- | --- |
| `src/__tests__/browser/LexicalExtensionComposer.test.tsx` | Not adapted; extension subsystem is not ported. |
| `src/__tests__/browser/useMenuAnchorRefPosition.test.tsx` | Adapted to jsdom with stubbed geometry in `tests/unit/use-menu-anchor-ref-position.test.ts`; real browser layout is not exercised. |
| `src/__tests__/unit/Collaboration.test.ts` | Not adapted; collaboration is not ported. |
| `src/__tests__/unit/CollaborationConcurrentReconcile.test.ts` | Not adapted; collaboration is not ported. |
| `src/__tests__/unit/CollaborationLocalEditAfterRemoteSync.test.ts` | Not adapted; collaboration is not ported. |
| `src/__tests__/unit/CollaborationSnapshot.test.ts` | Not adapted; collaboration is not ported. |
| `src/__tests__/unit/CollaborationUndoEcho.test.ts` | Not adapted; collaboration is not ported. |
| `src/__tests__/unit/CollaborationWithCollisions.test.ts` | Not adapted; collaboration is not ported. |
| `src/__tests__/unit/ExtensionComponent.test.tsx` | Not adapted; extension subsystem is not ported. |
| `src/__tests__/unit/LexicalAutoEmbedPlugin.test.tsx` | Adapted in `tests/unit/auto-embed-plugin.test.ts`. |
| `src/__tests__/unit/LexicalCharacterLimitPlugin.test.tsx` | Adapted in `tests/unit/character-limit-plugin.test.ts`. |
| `src/__tests__/unit/LexicalCollaborationPlugin.test.tsx` | Not adapted; collaboration plugin is not ported. |
| `src/__tests__/unit/LexicalComposer.test.tsx` | Not adapted one-for-one; bounded local composer coverage exists. |
| `src/__tests__/unit/LexicalContentEditableElement.test.tsx` | Adapted in `tests/unit/content-editable-element.test.ts` except the jest-axe checks. |
| `src/__tests__/unit/LexicalDraggableBlockPlugin.test.tsx` | Adapted in `tests/unit/draggable-block-plugin.test.ts`. |
| `src/__tests__/unit/LexicalExtensionComposer.test.tsx` | Not adapted; extension subsystem is not ported. |
| `src/__tests__/unit/LexicalExtensionEditorComposer.test.tsx` | Not adapted; extension subsystem is not ported. |
| `src/__tests__/unit/LexicalMenu.test.tsx` | Not adapted one-for-one; bounded local menu coverage exists. |
| `src/__tests__/unit/LexicalMenuEmptyOptions.test.tsx` | Adapted in `tests/unit/lexical-menu-empty-options.test.ts`. |
| `src/__tests__/unit/LexicalNestedComposer.test.tsx` | Adapted in `tests/unit/nested-composer.test.ts` except the jest-axe checks. |
| `src/__tests__/unit/LexicalNodeContextMenuPlugin.test.tsx` | Adapted in `tests/unit/node-context-menu-visibility.test.ts`. |
| `src/__tests__/unit/LexicalNodeMenuPlugin.test.tsx` | Not adapted one-for-one; bounded local coverage exists. |
| `src/__tests__/unit/LexicalTreeView.test.tsx` | Not adapted; the tree view is not ported. |
| `src/__tests__/unit/LexicalTypeaheadMenuPlugin.test.tsx` | Not adapted one-for-one; the 0.51 IME-composition cases are adapted in `tests/unit/typeahead-menu-composition.test.ts`. |
| `src/__tests__/unit/LexicalTypeaheadMenuPluginUtils.test.ts` | Adapted in `tests/unit/typeahead-menu-plugin-utils.test.ts`. |
| `src/__tests__/unit/PlainRichTextPlugin.test.tsx` | Not adapted one-for-one; bounded local and differential coverage exists. |
| `src/__tests__/unit/React19.test.tsx` | Not adapted; React-specific compatibility behavior is outside the Octane contract. |
| `src/__tests__/unit/ReactExtension.test.tsx` | Not adapted; extension subsystem is not ported. |
| `src/__tests__/unit/ReactPluginHostExtension.test.tsx` | Not adapted; extension subsystem is not ported. |
| `src/__tests__/unit/UseDecoratorsRootRemount.test.tsx` | First suite adapted in `tests/unit/decorators-root-remount.test.ts`; the `LexicalExtensionComposer` suite is not adapted. |
| `src/__tests__/unit/useExtensionSignalValue.test.tsx` | Not adapted; extension subsystem is not ported. |
| `src/__tests__/unit/useLexicalAriaLiveRegion.test.tsx` | Adapted in `tests/unit/use-aria-live-region.test.ts` with a builder-built editor in place of `LexicalExtensionComposer`. |
| `src/__tests__/unit/useLexicalCharacterLimit.test.ts` | Adapted in `tests/unit/use-character-limit.test.ts`. |
| `src/__tests__/unit/useLexicalFocusManagerRef.test.tsx` | Adapted in `tests/unit/use-focus-manager-ref.test.ts` with a builder-built editor. |
| `src/__tests__/unit/useLexicalFocusTrapRef.test.tsx` | Adapted in `tests/unit/use-focus-trap-ref.test.ts` with a builder-built editor. |
| `src/__tests__/unit/useLexicalIsTextContentEmpty.test.tsx` | Not adapted one-for-one; bounded local fixture coverage exists. |
| `src/__tests__/unit/useLexicalIsTextContentEmptyResync.test.tsx` | Adapted in `tests/unit/is-text-content-empty-resync.test.ts`. |
| `src/__tests__/unit/useLexicalNodeSelection.test.tsx` | Adapted in `tests/unit/use-lexical-node-selection.test.ts`. |
| `src/__tests__/unit/useLexicalRovingTabIndexRef.test.tsx` | Adapted in `tests/unit/use-roving-tab-index-ref.test.ts` with a builder-built editor. |
| `src/__tests__/unit/useMenuAnchorRef.shadow.test.tsx` | Not adapted one-for-one; bounded local shadow-root coverage exists. |
| `src/__tests__/unit/useMenuAnchorRef.test.tsx` | Not adapted one-for-one; bounded local coverage exists. |
| `src/__tests__/utils/index.tsx` | Upstream support helper, not an executable test artifact. |
| `src/__tests__/utils/vitest.d.ts` | Upstream type support file, not an executable test artifact. |

## Bounded evidence

The `lexical-runtime-differential` lane compiles the same rich-text and list
fixtures for React and Octane. It compares byte-identical DOM at mount and after
identical editor updates. Exact test identity selection is fail-closed. These
two declared cases do not establish exhaustive parity for the package surface.
