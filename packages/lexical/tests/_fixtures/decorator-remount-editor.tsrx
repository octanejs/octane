import { LexicalComposer } from '@octanejs/lexical/LexicalComposer';
import { RichTextPlugin } from '@octanejs/lexical/LexicalRichTextPlugin';
import { ContentEditable } from '@octanejs/lexical/LexicalContentEditable';
import { LexicalErrorBoundary } from '@octanejs/lexical/LexicalErrorBoundary';
import {
	$create,
	$createParagraphNode,
	$getDocument,
	$getEditor,
	$getRoot,
	$getState,
	$setState,
	createState,
	DecoratorNode,
} from 'lexical';

// Octane analogue of the upstream UseDecoratorsRootRemount test's
// ReactDecoratorNode: a decorator whose label lives in NodeState, so setting the
// same label marks the node dirty (refreshing the decorator map) without
// changing what it renders.
const labelState = createState('label', {
	parse: (v) => (v ? String(v) : 'hello'),
});

export class LabelDecoratorNode extends DecoratorNode {
	$config() {
		return this.config('octane-decorator-portal-rev', { extends: DecoratorNode });
	}
	createDOM() {
		return $getDocument().createElement('div');
	}
	updateDOM() {
		return false;
	}
	setLabel(label) {
		return $setState(this, labelState, label);
	}
	getLabel(version) {
		return $getState(this, labelState, version);
	}
	decorate() {
		// Read the label here, while Lexical has an active editor state. Octane
		// defers a compiled element's child body until the renderer resolves it
		// (React evaluates JSX children eagerly), and by then no editor state is
		// active, so `{this.getLabel()}` inline would throw in $getState.
		const label = this.getLabel();
		return <span data-testid="decorator-portal">{label as string}</span>;
	}
}

export function $isLabelDecoratorNode(node) {
	return node instanceof LabelDecoratorNode;
}

// Octane-only variant: decorate() returns the SAME element for the same label,
// so Lexical's reconcileDecorator sees an identical decorator on a full
// reconcile and leaves the decorator map (and its listeners) untouched. After a
// root detach/attach only the root-element subscription can re-derive portals.
const stableElements = new Map();

export class StableLabelDecoratorNode extends LabelDecoratorNode {
	$config() {
		return this.config('octane-stable-decorator-portal', { extends: LabelDecoratorNode });
	}
	decorate() {
		const label = this.getLabel();
		let element = stableElements.get(label);
		if (element === undefined) {
			element = <span data-testid="decorator-portal">{label as string}</span>;
			stableElements.set(label, element);
		}
		return element;
	}
}

// The upstream App: a LexicalComposer + RichTextPlugin (the legacy Decorators
// path) whose initial state is an empty paragraph followed by one decorator.
// onInit receives the editor and the decorator's key from inside the updater;
// `stable` swaps in StableLabelDecoratorNode.
export function DecoratorRemountEditor(props) @{
	<LexicalComposer
		initialConfig={{
			editorState: () => {
				const decorator = $create(
					props.stable ? StableLabelDecoratorNode : LabelDecoratorNode,
				).setLabel('hello');
				props.onInit($getEditor(), decorator.getKey());
				$getRoot().append($createParagraphNode(), decorator);
			},
			namespace: '',
			nodes: [LabelDecoratorNode, StableLabelDecoratorNode],
			onError: (err) => {
				throw err;
			},
			theme: {},
		}}
	>
		<RichTextPlugin
			contentEditable={<ContentEditable />}
			placeholder={null}
			ErrorBoundary={LexicalErrorBoundary}
		/>
	</LexicalComposer>
}
