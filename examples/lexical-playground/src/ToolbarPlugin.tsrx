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

	const formatText = (format) => editor.dispatchCommand(FORMAT_TEXT_COMMAND, format);
	const setParagraph = () => editor.update(() => {
		const s = $getSelection();
		if ($isRangeSelection(s)) $setBlocksType(s, () => $createParagraphNode());
	});
	const setHeading = (tag) => editor.update(() => {
		const s = $getSelection();
		if ($isRangeSelection(s)) $setBlocksType(s, () => $createHeadingNode(tag));
	});
	const setQuote = () => editor.update(() => {
		const s = $getSelection();
		if ($isRangeSelection(s)) $setBlocksType(s, () => $createQuoteNode());
	});
	const toggleList = (type, command) => editor.dispatchCommand(
		blockType === type ? REMOVE_LIST_COMMAND : command,
		undefined,
	);
	const insertLink = () => editor.dispatchCommand(TOGGLE_LINK_COMMAND, 'https://lexical.dev/');

	const cls = (active) => (active ? 'toolbar-item active' : 'toolbar-item');

	return <div class="toolbar">
		<button
			class="toolbar-item"
			disabled={!canUndo}
			onClick={() => editor.dispatchCommand(UNDO_COMMAND, undefined)}
			title="Undo"
		>{'↶'}</button>
		<button
			class="toolbar-item"
			disabled={!canRedo}
			onClick={() => editor.dispatchCommand(REDO_COMMAND, undefined)}
			title="Redo"
		>{'↷'}</button>
		<span class="divider" />
		<button
			class={cls(blockType === 'paragraph')}
			onClick={setParagraph}
			title="Normal"
		>{'¶'}</button>
		<button
			class={cls(blockType === 'h1')}
			onClick={() => setHeading('h1')}
			title="Heading 1"
		>{'H1'}</button>
		<button
			class={cls(blockType === 'h2')}
			onClick={() => setHeading('h2')}
			title="Heading 2"
		>{'H2'}</button>
		<button
			class={cls(blockType === 'h3')}
			onClick={() => setHeading('h3')}
			title="Heading 3"
		>{'H3'}</button>
		<button class={cls(blockType === 'quote')} onClick={setQuote} title="Quote">{'❝'}</button>
		<span class="divider" />
		<button class={cls(isBold)} onClick={() => formatText('bold')} title="Bold">
			<b>{'B'}</b>
		</button>
		<button class={cls(isItalic)} onClick={() => formatText('italic')} title="Italic">
			<i>{'I'}</i>
		</button>
		<button class={cls(isUnderline)} onClick={() => formatText('underline')} title="Underline">
			<u>{'U'}</u>
		</button>
		<button
			class={cls(isStrikethrough)}
			onClick={() => formatText('strikethrough')}
			title="Strikethrough"
		>
			<s>{'S'}</s>
		</button>
		<button class={cls(isCode)} onClick={() => formatText('code')} title="Code">{'</>'}</button>
		<span class="divider" />
		<button
			class={cls(blockType === 'bullet')}
			onClick={() => toggleList('bullet', INSERT_UNORDERED_LIST_COMMAND)}
			title="Bulleted List"
		>{'•'}</button>
		<button
			class={cls(blockType === 'number')}
			onClick={() => toggleList('number', INSERT_ORDERED_LIST_COMMAND)}
			title="Numbered List"
		>{'1.'}</button>
		<button
			class={cls(blockType === 'check')}
			onClick={() => toggleList('check', INSERT_CHECK_LIST_COMMAND)}
			title="Check List"
		>{'☑'}</button>
		<span class="divider" />
		<button class="toolbar-item" onClick={insertLink} title="Insert Link">{'🔗'}</button>
		<button
			class="toolbar-item"
			onClick={() => editor.dispatchCommand(INSERT_HORIZONTAL_RULE_COMMAND, undefined)}
			title="Horizontal Rule"
		>{'―'}</button>
	</div>;
}
