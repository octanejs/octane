// @octanejs/lexical — Octane bindings for Lexical, a port of @lexical/react.
//
// @lexical/react has NO root barrel — it ships per-subpath modules. This package
// mirrors that layout (import from `@octanejs/lexical/LexicalComposer`, etc.), and
// ALSO provides this convenience barrel that re-exports everything.
//
// Components/nodes live in `.tsrx` files (the octane compiler handles them; tsgo
// treats them as `any` via the `*.tsrx` ambient module). Genuinely-typed surface —
// config types and the framework-agnostic helpers — is re-exported from real `.ts`
// sources / the `@lexical/*` packages so consumers keep those types.

// --- Core editor ---
export {
	LexicalComposerContext,
	createLexicalComposerContext,
	useLexicalComposerContext,
} from './LexicalComposerContext';
export type {
	LexicalComposerContextType,
	LexicalComposerContextWithEditor,
} from './LexicalComposerContext';
export type { InitialConfigType, InitialEditorStateType } from './types';

export { LexicalComposer } from './LexicalComposer.tsrx';
export { ContentEditable, ContentEditableElement } from './LexicalContentEditable.tsrx';
export { RichTextPlugin } from './LexicalRichTextPlugin.tsrx';
export { PlainTextPlugin } from './LexicalPlainTextPlugin.tsrx';
export { LexicalErrorBoundary } from './LexicalErrorBoundary.tsrx';

export { useLexicalEditable } from './useLexicalEditable';
export { useLexicalSubscription, type LexicalSubscription } from './useLexicalSubscription';

// --- Phase 2 plugins ---
export { HistoryPlugin } from './LexicalHistoryPlugin.tsrx';
export { createEmptyHistoryState } from '@lexical/history';
export type { HistoryState } from '@lexical/history';
export { OnChangePlugin } from './LexicalOnChangePlugin.tsrx';
export { AutoFocusPlugin } from './LexicalAutoFocusPlugin.tsrx';
export { ClearEditorPlugin } from './LexicalClearEditorPlugin.tsrx';

// --- Phase 3 plugins ---
export { ListPlugin } from './LexicalListPlugin.tsrx';
export { CheckListPlugin } from './LexicalCheckListPlugin.tsrx';
export { LinkPlugin } from './LexicalLinkPlugin.tsrx';
export { AutoLinkPlugin } from './LexicalAutoLinkPlugin.tsrx';
export { createLinkMatcherWithRegExp } from '@lexical/link';
export { HashtagPlugin } from './LexicalHashtagPlugin.tsrx';
export { TabIndentationPlugin } from './LexicalTabIndentationPlugin.tsrx';
export { registerTabIndentation } from '@lexical/extension';
export { MarkdownShortcutPlugin, DEFAULT_TRANSFORMERS } from './LexicalMarkdownShortcutPlugin.tsrx';
export { TablePlugin } from './LexicalTablePlugin.tsrx';
export { NodeEventPlugin } from './LexicalNodeEventPlugin.tsrx';
export { EditorRefPlugin } from './LexicalEditorRefPlugin.tsrx';
export { HorizontalRulePlugin } from './LexicalHorizontalRulePlugin.tsrx';
export { HorizontalRuleNode, $createHorizontalRuleNode } from './LexicalHorizontalRuleNode.tsrx';
export { $isHorizontalRuleNode, INSERT_HORIZONTAL_RULE_COMMAND } from '@lexical/extension';

// --- Phase 3 hooks ---
export { useLexicalNodeSelection } from './useLexicalNodeSelection';
export { useLexicalTextEntity } from './useLexicalTextEntity';
export { useLexicalIsTextContentEmpty } from './useLexicalIsTextContentEmpty';

// --- Phase 4: menus + utilities ---
export { LexicalTypeaheadMenuPlugin } from './LexicalTypeaheadMenuPlugin.tsrx';
export { LexicalNodeMenuPlugin } from './LexicalNodeMenuPlugin.tsrx';
export { useBasicTypeaheadTriggerMatch, PUNCTUATION } from './typeaheadShared';
export { MenuOption, SCROLL_TYPEAHEAD_OPTION_INTO_VIEW_COMMAND } from './shared/menuShared';
export type {
	MenuRef,
	MenuRenderFn,
	MenuResolution,
	MenuTextMatch,
	TriggerFn,
} from './shared/menuShared';
export { useDynamicPositioning } from './shared/useDynamicPositioning';
export { useMenuAnchorRef } from './shared/useMenuAnchorRef';
export { ClickableLinkPlugin } from './LexicalClickableLinkPlugin.tsrx';
export { SelectionAlwaysOnDisplay } from './LexicalSelectionAlwaysOnDisplay.tsrx';
export { useLexicalSlotRef } from './useLexicalSlotRef';
