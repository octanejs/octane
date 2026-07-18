// A formatting toolbar, mirroring the core of lexical-playground's ToolbarPlugin:
// it tracks the current selection's text formats + block type via an update
// listener and dispatches Lexical core commands. (The full playground toolbar also
// has font/color/alignment dropdowns + insert menus — those build on P4.)
import { useLexicalComposerContext } from '@octanejs/lexical/LexicalComposerContext';
import { INSERT_HORIZONTAL_RULE_COMMAND } from '@octanejs/lexical';
import { $setBlocksType } from '@lexical/selection';
import { $createHeadingNode, $createQuoteNode, $isHeadingNode } from '@lexical/rich-text';
import {
	$isListNode,
	INSERT_CHECK_LIST_COMMAND,
	INSERT_ORDERED_LIST_COMMAND,
	INSERT_UNORDERED_LIST_COMMAND,
	REMOVE_LIST_COMMAND,
} from '@lexical/list';
import { TOGGLE_LINK_COMMAND } from '@lexical/link';
import {
	$createParagraphNode,
	$getSelection,
	$isRangeSelection,
	CAN_REDO_COMMAND,
	CAN_UNDO_COMMAND,
	COMMAND_PRIORITY_LOW,
	FORMAT_TEXT_COMMAND,
	mergeRegister,
	REDO_COMMAND,
	UNDO_COMMAND,
} from 'lexical';
import type { LexicalCommand, TextFormatType } from 'lexical';
import type { HeadingTagType } from '@lexical/rich-text';
import { useEffect, useState } from 'octane';

export function ToolbarPlugin() {
	const [editor] = useLexicalComposerContext();
	const [canUndo, setCanUndo] = useState(false);
	const [canRedo, setCanRedo] = useState(false);
	const [blockType, setBlockType] = useState('paragraph');
	const [isBold, setIsBold] = useState(false);
	const [isItalic, setIsItalic] = useState(false);
	const [isUnderline, setIsUnderline] = useState(false);
	const [isStrikethrough, setIsStrikethrough] = useState(false);
	const [isCode, setIsCode] = useState(false);

	const $updateToolbar = () => {
		const selection = $getSelection();
		if ($isRangeSelection(selection)) {
			setIsBold(selection.hasFormat('bold'));
			setIsItalic(selection.hasFormat('italic'));
			setIsUnderline(selection.hasFormat('underline'));
			setIsStrikethrough(selection.hasFormat('strikethrough'));
			setIsCode(selection.hasFormat('code'));
			const anchorNode = selection.anchor.getNode();
			const element =
				anchorNode.getKey() === 'root' ? anchorNode : anchorNode.getTopLevelElementOrThrow();
			if ($isListNode(element)) {
				setBlockType(element.getListType());
			} else if ($isHeadingNode(element)) {
				setBlockType(element.getTag());
			} else {
				setBlockType(element.getType());
			}
		}
	};

	useEffect(() => {
		editor.getEditorState().read($updateToolbar);
		return mergeRegister(
			editor.registerUpdateListener(({ editorState }) => {
				editorState.read($updateToolbar);
			}),
			editor.registerCommand(
				CAN_UNDO_COMMAND,
				(payload) => {
					setCanUndo(payload);
					return false;
				},
				COMMAND_PRIORITY_LOW,
			),
			editor.registerCommand(
				CAN_REDO_COMMAND,
				(payload) => {
					setCanRedo(payload);
					return false;
				},
				COMMAND_PRIORITY_LOW,
			),
		);
	}, [editor]);

	const formatText = (format: TextFormatType) => editor.dispatchCommand(
		FORMAT_TEXT_COMMAND,
		format,
	);
	const setParagraph = () => editor.update(() => {
		const s = $getSelection();
		if ($isRangeSelection(s)) $setBlocksType(s, () => $createParagraphNode());
	});
	const setHeading = (tag: HeadingTagType) => editor.update(() => {
		const s = $getSelection();
		if ($isRangeSelection(s)) $setBlocksType(s, () => $createHeadingNode(tag));
	});
	const setQuote = () => editor.update(() => {
		const s = $getSelection();
		if ($isRangeSelection(s)) $setBlocksType(s, () => $createQuoteNode());
	});
	const toggleList = (type: string, command: LexicalCommand<void>) => editor.dispatchCommand(
		blockType === type ? REMOVE_LIST_COMMAND : command,
		undefined,
	);
	const insertLink = () => editor.dispatchCommand(TOGGLE_LINK_COMMAND, 'https://lexical.dev/');

	const cls = (active: boolean) => (active ? 'toolbar-item active' : 'toolbar-item');

	return <div class="toolbar" role="toolbar" aria-label="Editor formatting">
		<button
			class="toolbar-item"
			disabled={!canUndo}
			onClick={() => editor.dispatchCommand(UNDO_COMMAND, undefined)}
			aria-label="Undo"
			title="Undo"
		>{'↶'}</button>
		<button
			class="toolbar-item"
			disabled={!canRedo}
			onClick={() => editor.dispatchCommand(REDO_COMMAND, undefined)}
			aria-label="Redo"
			title="Redo"
		>{'↷'}</button>
		<span class="divider" />
		<button
			class={cls(blockType === 'paragraph')}
			onClick={setParagraph}
			aria-label="Normal paragraph"
			aria-pressed={blockType === 'paragraph' ? 'true' : 'false'}
			title="Normal"
		>{'¶'}</button>
		<button
			class={cls(blockType === 'h1')}
			onClick={() => setHeading('h1')}
			aria-label="Heading 1"
			aria-pressed={blockType === 'h1' ? 'true' : 'false'}
			title="Heading 1"
		>{'H1'}</button>
		<button
			class={cls(blockType === 'h2')}
			onClick={() => setHeading('h2')}
			aria-label="Heading 2"
			aria-pressed={blockType === 'h2' ? 'true' : 'false'}
			title="Heading 2"
		>{'H2'}</button>
		<button
			class={cls(blockType === 'h3')}
			onClick={() => setHeading('h3')}
			aria-label="Heading 3"
			aria-pressed={blockType === 'h3' ? 'true' : 'false'}
			title="Heading 3"
		>{'H3'}</button>
		<button
			class={cls(blockType === 'quote')}
			onClick={setQuote}
			aria-label="Quote"
			aria-pressed={blockType === 'quote' ? 'true' : 'false'}
			title="Quote"
		>{'❝'}</button>
		<span class="divider" />
		<button
			class={cls(isBold)}
			onClick={() => formatText('bold')}
			aria-label="Bold"
			aria-pressed={isBold ? 'true' : 'false'}
			title="Bold"
		>
			<b>{'B'}</b>
		</button>
		<button
			class={cls(isItalic)}
			onClick={() => formatText('italic')}
			aria-label="Italic"
			aria-pressed={isItalic ? 'true' : 'false'}
			title="Italic"
		>
			<i>{'I'}</i>
		</button>
		<button
			class={cls(isUnderline)}
			onClick={() => formatText('underline')}
			aria-label="Underline"
			aria-pressed={isUnderline ? 'true' : 'false'}
			title="Underline"
		>
			<u>{'U'}</u>
		</button>
		<button
			class={cls(isStrikethrough)}
			onClick={() => formatText('strikethrough')}
			aria-label="Strikethrough"
			aria-pressed={isStrikethrough ? 'true' : 'false'}
			title="Strikethrough"
		>
			<s>{'S'}</s>
		</button>
		<button
			class={cls(isCode)}
			onClick={() => formatText('code')}
			aria-label="Code"
			aria-pressed={isCode ? 'true' : 'false'}
			title="Code"
		>{'</>'}</button>
		<span class="divider" />
		<button
			class={cls(blockType === 'bullet')}
			onClick={() => toggleList('bullet', INSERT_UNORDERED_LIST_COMMAND)}
			aria-label="Bulleted list"
			aria-pressed={blockType === 'bullet' ? 'true' : 'false'}
			title="Bulleted List"
		>{'•'}</button>
		<button
			class={cls(blockType === 'number')}
			onClick={() => toggleList('number', INSERT_ORDERED_LIST_COMMAND)}
			aria-label="Numbered list"
			aria-pressed={blockType === 'number' ? 'true' : 'false'}
			title="Numbered List"
		>{'1.'}</button>
		<button
			class={cls(blockType === 'check')}
			onClick={() => toggleList('check', INSERT_CHECK_LIST_COMMAND)}
			aria-label="Check list"
			aria-pressed={blockType === 'check' ? 'true' : 'false'}
			title="Check List"
		>{'☑'}</button>
		<span class="divider" />
		<button
			class="toolbar-item"
			onClick={insertLink}
			aria-label="Insert link"
			title="Insert Link"
		>{'🔗'}</button>
		<button
			class="toolbar-item"
			onClick={() => editor.dispatchCommand(INSERT_HORIZONTAL_RULE_COMMAND, undefined)}
			aria-label="Insert horizontal rule"
			title="Horizontal Rule"
		>{'―'}</button>
	</div>;
}
