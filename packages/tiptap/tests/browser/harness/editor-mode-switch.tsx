/** @jsxImportSource octane */
import { EditorContent, type Editor } from '@octanejs/tiptap';
import { Suspense, lazy, useState } from 'octane';

const SourceEditor = lazy(() => import('./source-editor.tsx'));

export function EditorModeSwitch(props: { editor: Editor }) {
	const [source, setSource] = useState(false);

	return (
		<section data-editor-switch="true" data-editor-mode={source ? 'source' : 'rich'}>
			<button
				type="button"
				aria-label="Toggle source editor"
				onClick={() => setSource((previous) => !previous)}
			>
				{source ? 'Show rich editor' : 'Show source editor'}
			</button>
			<div data-editor-mode-content="true">
				{source ? (
					<Suspense fallback={null}>
						<SourceEditor />
					</Suspense>
				) : (
					<EditorContent editor={props.editor} data-branch-rich-editor="true" />
				)}
			</div>
		</section>
	);
}
