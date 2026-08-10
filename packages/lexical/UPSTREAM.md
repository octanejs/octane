# Lexical React upstream

`@octanejs/lexical` ports the React-facing layer from
[`@lexical/react@0.46.0`](https://github.com/facebook/lexical/releases/tag/v0.46.0)
while reusing Lexical's framework-neutral editor packages.

## Immutable pin

- Package: `@lexical/react@0.46.0`
- Tag: `v0.46.0` (annotated tag object `189d515bed5104f9c0f0d2def94f17e7321684ae`)
- Commit: `ad93fe6b9917ff54d9f84e965c8dd785f5b021e2`
- Repository: `https://github.com/facebook/lexical.git`
- Source root: `packages/lexical-react/src`
- Test root: `packages/lexical-react/src/__tests__`
- License: MIT
- npm archive SHA-256: `a7f56b39ebc7fe1cb101d63b829947cd8ee21a28af44eadaed65453b83293060`
- Supported upstream range: exactly `0.46.0`
- React oracle: `react@19.2.7` and `react-dom@19.2.7`

The npm archive contains compiled runtime, Flow declarations, metadata, and the
license, but not the repository test suite. The pinned repository has a runtime
suite but no separate executable type-test suite for `packages/lexical-react`;
published Flow declarations are artifacts, not tests. The runtime suite has not
been vendored or adapted one-for-one, so the parity manifest remains
`recorded-unverified`.

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
| `useLexicalEditable`, `useLexicalIsTextContentEmpty`, `useLexicalNodeSelection`, `useLexicalSlotRef`, `useLexicalSubscription`, `useLexicalTextEntity` | Ported | Local unit/fixture coverage; no exhaustive upstream adaptation. |
| `LexicalCollaborationPlugin` | Not ported | Requires a real two-peer Yjs collaboration harness. |
| `LexicalExtensionComposer`, `LexicalExtensionEditorComposer` | Not ported | Wrap the newer React-only extension subsystem. |
| `LexicalTreeView` | Not ported | Wraps the React component from `@lexical/devtools-core`. |
| `ExtensionComponent`, `ReactExtension`, `ReactPluginHostExtension`, `ReactProviderExtension`, `TreeViewExtension`, `useExtensionComponent`, `useExtensionSignalValue` | Not ported | New React extension-system entry points in 0.46.0; excluded from the bounded equality claim. |

The Octane package uses `@floating-ui/dom` directly rather than
`@floating-ui/react`, and accepts refs as ordinary props rather than through
`forwardRef`. Those are binding adaptations outside the two registered
differential cases; they are not claimed as verified divergences by this
manifest.

## Upstream suite disposition

| Pinned artifact | Current disposition |
| --- | --- |
| `src/__tests__/browser/LexicalExtensionComposer.test.tsx` | Not adapted; extension subsystem is not ported. |
| `src/__tests__/unit/Collaboration.test.ts` | Not adapted; collaboration is not ported. |
| `src/__tests__/unit/CollaborationConcurrentReconcile.test.ts` | Not adapted; collaboration is not ported. |
| `src/__tests__/unit/CollaborationLocalEditAfterRemoteSync.test.ts` | Not adapted; collaboration is not ported. |
| `src/__tests__/unit/CollaborationSnapshot.test.ts` | Not adapted; collaboration is not ported. |
| `src/__tests__/unit/CollaborationUndoEcho.test.ts` | Not adapted; collaboration is not ported. |
| `src/__tests__/unit/CollaborationWithCollisions.test.ts` | Not adapted; collaboration is not ported. |
| `src/__tests__/unit/ExtensionComponent.test.tsx` | Not adapted; extension subsystem is not ported. |
| `src/__tests__/unit/LexicalCollaborationPlugin.test.tsx` | Not adapted; collaboration plugin is not ported. |
| `src/__tests__/unit/LexicalComposer.test.tsx` | Not adapted one-for-one; bounded local composer coverage exists. |
| `src/__tests__/unit/LexicalContentEditableElement.test.tsx` | Not adapted one-for-one; bounded local coverage exists. |
| `src/__tests__/unit/LexicalExtensionComposer.test.tsx` | Not adapted; extension subsystem is not ported. |
| `src/__tests__/unit/LexicalExtensionEditorComposer.test.tsx` | Not adapted; extension subsystem is not ported. |
| `src/__tests__/unit/LexicalMenu.test.tsx` | Not adapted one-for-one; bounded local menu coverage exists. |
| `src/__tests__/unit/LexicalNestedComposer.test.tsx` | Not adapted one-for-one; bounded local coverage exists. |
| `src/__tests__/unit/LexicalNodeMenuPlugin.test.tsx` | Not adapted one-for-one; bounded local coverage exists. |
| `src/__tests__/unit/LexicalTypeaheadMenuPlugin.test.tsx` | Not adapted one-for-one; bounded local coverage exists. |
| `src/__tests__/unit/PlainRichTextPlugin.test.tsx` | Not adapted one-for-one; bounded local and differential coverage exists. |
| `src/__tests__/unit/React19.test.tsx` | Not adapted; React-specific compatibility behavior is outside the Octane contract. |
| `src/__tests__/unit/ReactExtension.test.tsx` | Not adapted; extension subsystem is not ported. |
| `src/__tests__/unit/ReactPluginHostExtension.test.tsx` | Not adapted; extension subsystem is not ported. |
| `src/__tests__/unit/useExtensionSignalValue.test.tsx` | Not adapted; extension subsystem is not ported. |
| `src/__tests__/unit/useLexicalCharacterLimit.test.ts` | Not adapted one-for-one; bounded local coverage exists. |
| `src/__tests__/unit/useLexicalIsTextContentEmpty.test.tsx` | Not adapted one-for-one; bounded local fixture coverage exists. |
| `src/__tests__/unit/useMenuAnchorRef.shadow.test.tsx` | Not adapted one-for-one; bounded local shadow-root coverage exists. |
| `src/__tests__/unit/useMenuAnchorRef.test.tsx` | Not adapted one-for-one; bounded local coverage exists. |
| `src/__tests__/utils/index.tsx` | Upstream support helper, not an executable test artifact. |

## Bounded evidence

The `lexical-runtime-differential` lane compiles the same rich-text and list
fixtures for React and Octane. It compares byte-identical DOM at mount and after
identical editor updates. Exact test identity selection is fail-closed. These
two declared cases do not establish exhaustive parity for the package surface.
