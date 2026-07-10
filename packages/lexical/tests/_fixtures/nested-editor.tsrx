import { LexicalComposer } from '@octanejs/lexical/LexicalComposer';
import { useLexicalComposerContext } from '@octanejs/lexical/LexicalComposerContext';
import { RichTextPlugin } from '@octanejs/lexical/LexicalRichTextPlugin';
import { ContentEditable } from '@octanejs/lexical/LexicalContentEditable';
import { LexicalErrorBoundary } from '@octanejs/lexical/LexicalErrorBoundary';
import { LexicalNestedComposer } from '@octanejs/lexical/LexicalNestedComposer';
import {
	$applyNodeReplacement,
	$createParagraphNode,
	$createTextNode,
	$getEditor,
	$getRoot,
	DecoratorNode,
} from 'lexical';
import { useEffect } from 'octane';

// Octane analogue of the upstream test's ReactDecoratorNode — a decorator whose
// decorate() defers to a configurable callback set via setDecorate().
export class OctaneDecoratorNode extends DecoratorNode {
	$config() {
		return this.config('octane-decorator', { extends: DecoratorNode });
	}
	createDOM(_config, editor) {
		return (editor._window || window).document.createElement(this.__inline ? 'span' : 'div');
	}
	updateDOM(prevNode, _dom, _config) {
		return !!prevNode.__inline !== this.__inline;
	}
	afterCloneFrom(prevNode) {
		super.afterCloneFrom(prevNode);
		this.__decorate = prevNode.__decorate;
	}
	setDecorate(decorate) {
		const self = this.getWritable();
		self.__decorate = decorate;
		return self;
	}
	setInline(inline) {
		const self = this.getWritable();
		self.__inline = inline;
		return self;
	}
	isInline() {
		return !!this.__inline;
	}
	decorate() {
		return this.__decorate ? this.__decorate(this) : null;
	}
}

export function $createOctaneDecoratorNode() {
	return $applyNodeReplacement(new OctaneDecoratorNode());
}

// Command-delegation test plugin — the test supplies the register callback
// (which returns its own unregister) so command/priority wiring stays in the
// test file, mirroring the upstream DelegateListenerPlugin.
export function DelegateListenerPlugin(props) {
	const [currentEditor] = useLexicalComposerContext();
	useEffect(() => {
		return props.register(currentEditor);
	}, [currentEditor, props.register]);
	return null;
}

function NestedContent(props) @{
	<LexicalNestedComposer
		initialEditor={props.nestedEditor}
		initialNodes={props.initialNodes}
		skipEditableListener={props.skipEditableListener}
	>
		<RichTextPlugin
			contentEditable={<ContentEditable aria-label={props.ariaLabel} />}
			placeholder={<></>}
			ErrorBoundary={LexicalErrorBoundary}
		/>
		{props.register ? <DelegateListenerPlugin register={props.register} /> : null}
	</LexicalNestedComposer>
}

// The upstream test's App, parameterized: the test supplies how the nested
// editor is created (createNested), the NestedComposer props, and receives both
// editors via onEditors from inside the editorState updater.
export function NestedEditor(props) @{
	<LexicalComposer
		initialConfig={{
			editorState: () => {
				const editor = $getEditor();
				const nestedEditor = props.createNested(editor);
				nestedEditor.update(() => {
					$getRoot().clear().append($createParagraphNode().append($createTextNode('nested')));
				});
				props.onEditors(editor, nestedEditor);
				$getRoot().clear().append(
					$createParagraphNode().append($createTextNode('parent')),
					$createOctaneDecoratorNode().setInline(false).setDecorate(() => {
						return <NestedContent
							nestedEditor={nestedEditor}
							initialNodes={props.initialNodes}
							skipEditableListener={props.skipEditableListener}
							ariaLabel={props.nestedAriaLabel}
							register={props.register}
						/>;
					}),
				);
			},
			namespace: 'parent',
			nodes: props.parentNodes ?? [OctaneDecoratorNode],
			onError: (err) => {
				throw err;
			},
		}}
	>
		<RichTextPlugin
			contentEditable={<ContentEditable aria-label={props.parentAriaLabel} />}
			placeholder={<></>}
			ErrorBoundary={LexicalErrorBoundary}
		/>
		{props.register ? <DelegateListenerPlugin register={props.register} /> : null}
	</LexicalComposer>
}
