import { buildEditorFromExtensions } from '@lexical/extension';
import {
	createLexicalComposerContext,
	LexicalComposerContext,
	useLexicalComposerContext,
} from '@octanejs/lexical/LexicalComposerContext';
import type { LexicalComposerContextWithEditor } from '@octanejs/lexical/LexicalComposerContext';
import { useLexicalAriaLiveRegion } from '@octanejs/lexical/useLexicalAriaLiveRegion';
import { useLexicalFocusManagerRef } from '@octanejs/lexical/useLexicalFocusManagerRef';
import { useLexicalFocusTrapRef } from '@octanejs/lexical/useLexicalFocusTrapRef';
import { useLexicalRovingTabIndexRef } from '@octanejs/lexical/useLexicalRovingTabIndexRef';
import type { LexicalEditor } from 'lexical';
import { use, useEffect, useImperativeHandle, useMemo, useRef } from 'octane';

// Fixtures for porting @lexical/react's useLexicalAriaLiveRegion /
// useLexicalFocusManagerRef / useLexicalFocusTrapRef / useLexicalRovingTabIndexRef
// tests. Upstream wraps each harness in LexicalExtensionComposer, which
// @octanejs/lexical does not port; WithExtension is the stand-in: it builds the
// editor from the (stable) extension argument, provides it through
// LexicalComposerContext, and disposes it on unmount.
function WithExtension(props) @{
	const editor = useMemo(() => buildEditorFromExtensions(props.extension), [props.extension]);
	useEffect(() => () => editor.dispose(), [editor]);
	const context = useMemo<LexicalComposerContextWithEditor>(
		() => [editor, createLexicalComposerContext(null, undefined)],
		[editor],
	);
	useEffect(() => {
		props.onEditor?.(editor);
	}, [editor]);

	<LexicalComposerContext value={context}>{props.children}</LexicalComposerContext>
}

// Binds the composer's editor to a plain contentEditable, as upstream's
// harnesses do (there is no ContentEditable/plugin in these tests).
function useEditorRoot(editor: LexicalEditor) {
	const editorRootRef = useRef<HTMLDivElement | null>(null);
	useEffect(() => {
		const root = editorRootRef.current;
		if (root === null) {
			return;
		}
		editor.setRootElement(root);
		return () => editor.setRootElement(null);
	}, [editor]);
	return editorRootRef;
}

function AriaHarness(props) @{
	const [editor] = useLexicalComposerContext();
	const editorRootRef = useEditorRoot(editor);
	const announce = useLexicalAriaLiveRegion();
	useImperativeHandle(props.ref, () => ({ announce }), [announce]);

	<div
		ref={editorRootRef}
		contenteditable="true"
		data-testid="editor-root"
		role="textbox"
		tabIndex={0}
	/>
}

export function AriaLiveRegionFixture(props) @{
	<WithExtension extension={props.extension}>
		<AriaHarness ref={props.handle} />
	</WithExtension>
}

function FocusManagerHarness(props) @{
	const [editor] = useLexicalComposerContext();
	const editorRootRef = useEditorRoot(editor);
	const toolbarRef = useLexicalFocusManagerRef(props.options);

	<>
		@if (props.showToolbar !== false) {
			<div ref={toolbarRef} data-testid="toolbar">
				<button data-testid="btn-0">First</button>
				<button data-testid="btn-1">Second</button>
				<span data-item="true" data-testid="item" tabIndex={-1}>
					Item
				</span>
			</div>
		}
		<div
			ref={editorRootRef}
			contenteditable="true"
			data-testid="editor-root"
			role="textbox"
			tabIndex={0}
		/>
	</>
}

export function FocusManagerFixture(props) @{
	<WithExtension extension={props.extension} onEditor={props.onEditor}>
		<FocusManagerHarness options={props.options} showToolbar={props.showToolbar} />
	</WithExtension>
}

function Trap(props) @{
	const ref = useLexicalFocusTrapRef(
		props.isActive,
		props.initialFocus ?? 'firstFocusable',
		props.allowOutside,
	);
	const indices = Array.from({ length: props.buttons ?? 3 }, (_, i) => i);

	<div ref={ref} tabIndex={-1} data-testid="trap">
		@for (const i of indices; key i) {
			<button data-testid={'btn-' + i}>{'Button ' + i}</button>
		}
	</div>
}

export function FocusTrapFixture(props) @{
	<>
		@if (props.mounted !== false) {
			<WithExtension extension={props.extension}>
				<Trap
					isActive={props.isActive}
					buttons={props.buttons}
					initialFocus={props.initialFocus}
					allowOutside={props.allowOutside}
				/>
			</WithExtension>
		}
	</>
}

function Suspender(props) {
	if (props.promise != null) {
		use(props.promise);
	}
	return null;
}

// The trap re-renders with a new `allowOutside` in the same pass as a sibling
// that suspends, so a transition to these props is held (never committed).
export function TransitionTrapFixture(props) @{
	<WithExtension extension={props.extension}>
		@try {
			<>
				<Trap isActive={true} buttons={2} allowOutside={props.allowOutside} />
				<Suspender promise={props.promise} />
			</>
		} @pending {
			<div data-testid="pending">{'loading'}</div>
		}
	</WithExtension>
}

function Group(props) @{
	const ref = useLexicalRovingTabIndexRef(
		props.orientation ? { orientation: props.orientation } : undefined,
	);
	const indices = Array.from({ length: props.count ?? 3 }, (_, i) => i);

	<div ref={ref} data-testid="group">
		@for (const i of indices; key i) {
			<button data-testid={'btn-' + i}>{String(i)}</button>
		}
	</div>
}

export function RovingTabIndexFixture(props) @{
	<WithExtension extension={props.extension}>
		@if (props.showGroup !== false) {
			<Group count={props.count} orientation={props.orientation} />
		}
	</WithExtension>
}
