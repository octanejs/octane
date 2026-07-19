// Ported from @lexical/react/src/LexicalNestedComposer.tsx. Provides a nested
// LexicalEditor (e.g. the editor backing an image caption or table cell) to its
// children via context, inheriting the parent's theme/nodes/namespace/editable
// state by default. The nested editor is created ahead of time and passed in.
import { createLexicalComposerContext, LexicalComposerContext } from './LexicalComposerContext';
import type { LexicalComposerContextWithEditor } from './LexicalComposerContext';
import { CollaborationContext } from './LexicalCollaborationContext';
import invariant from '@lexical/internal/invariant';
import warnOnlyOnce from '@lexical/internal/warnOnlyOnce';
import type {
	EditorThemeClasses,
	Klass,
	LexicalEditor,
	LexicalNode,
	LexicalNodeReplacement,
} from 'lexical';
import { createSharedNodeState, getRegisteredNode, getTransformSetFromKlass } from 'lexical';
import type { OctaneNode } from 'octane';
import { useContext, useEffect, useMemo, useRef } from 'octane';

const initialNodesWarning = warnOnlyOnce(
	`LexicalNestedComposer initialNodes is deprecated and will be removed in v0.32.0, it has never worked correctly.\nYou can configure your editor's nodes with createEditor({nodes: [], parentEditor: $getEditor()})`,
);
const explicitNamespaceWarning = warnOnlyOnce(
	`LexicalNestedComposer initialEditor should explicitly initialize its namespace when the node configuration differs from the parentEditor. For backwards compatibility, the namespace will be initialized from parentEditor until v0.32.0, but this has always had incorrect copy/paste behavior when the configuration differed.\nYou can configure your editor's namespace with createEditor({namespace: 'nested-editor-namespace', nodes: [], parentEditor: $getEditor()}).`,
);

export interface LexicalNestedComposerProps {
	children?: OctaneNode;
	initialEditor: LexicalEditor;
	initialTheme?: EditorThemeClasses;
	initialNodes?: readonly (Klass<LexicalNode> | LexicalNodeReplacement)[];
	skipCollabChecks?: undefined | true;
	skipEditableListener?: undefined | true;
}

export function LexicalNestedComposer(props: LexicalNestedComposerProps) {
	const initialEditor = props.initialEditor;
	const initialNodes = props.initialNodes;
	const initialTheme = props.initialTheme;
	const skipCollabChecks = props.skipCollabChecks;
	const skipEditableListener = props.skipEditableListener;

	const wasCollabPreviouslyReadyRef = useRef(false);
	const parentContext = useContext(LexicalComposerContext);

	if (parentContext == null) {
		invariant(false, 'Unexpected parent context null on a nested composer');
	}

	const [parentEditor, { getTheme: getParentTheme }] = parentContext;

	const composerContext = useMemo<LexicalComposerContextWithEditor>(() => {
		const composerTheme = initialTheme || getParentTheme() || undefined;
		const context = createLexicalComposerContext(parentContext, composerTheme);

		if (composerTheme !== undefined) {
			initialEditor._config.theme = composerTheme;
		}

		initialEditor._parentEditor = initialEditor._parentEditor || parentEditor;
		const createEditorArgs = initialEditor._createEditorArgs;
		const explicitNamespace = createEditorArgs && createEditorArgs.namespace;

		if (!initialNodes) {
			if (!(createEditorArgs && createEditorArgs.nodes)) {
				const parentNodes = initialEditor._nodes = new Map(parentEditor._nodes);
				if (!explicitNamespace) {
					initialEditor._config.namespace = parentEditor._config.namespace;
				}
				for (const [type, entry] of parentNodes) {
					initialEditor._nodes.set(type, {
						exportDOM: entry.exportDOM,
						klass: entry.klass,
						replace: entry.replace,
						replaceWithKlass: entry.replaceWithKlass,
						sharedNodeState: createSharedNodeState(entry.klass),
						transforms: getTransformSetFromKlass(entry.klass),
					});
				}
			} else if (!explicitNamespace) {
				explicitNamespaceWarning();
				initialEditor._config.namespace = parentEditor._config.namespace;
			}
		} else {
			initialNodesWarning();
			if (!explicitNamespace) {
				explicitNamespaceWarning();
				initialEditor._config.namespace = parentEditor._config.namespace;
			}
			for (let klass of initialNodes) {
				let replace = null;
				let replaceWithKlass = null;

				if (typeof klass !== 'function') {
					const options = klass;
					klass = options.replace;
					replace = options.with;
					replaceWithKlass = options.withKlass || null;
				}
				const registeredKlass = getRegisteredNode(initialEditor, klass.getType());

				initialEditor._nodes.set(klass.getType(), {
					exportDOM: registeredKlass ? registeredKlass.exportDOM : undefined,
					klass,
					replace,
					replaceWithKlass,
					sharedNodeState: createSharedNodeState(klass),
					transforms: getTransformSetFromKlass(klass),
				});
			}
		}

		return [initialEditor, context];
	}, []);

	const collabContext = useContext(CollaborationContext);
	const isCollabActive = collabContext ? collabContext.isCollabActive : undefined;
	const yjsDocMap = collabContext ? collabContext.yjsDocMap : undefined;

	const isCollabReady =
		skipCollabChecks || wasCollabPreviouslyReadyRef.current ||
			yjsDocMap && yjsDocMap.has(initialEditor.getKey());

	useEffect(() => {
		if (isCollabReady) {
			wasCollabPreviouslyReadyRef.current = true;
		}
	}, [isCollabReady]);

	useEffect(() => {
		if (!skipEditableListener) {
			const editableListener = (editable: boolean) => initialEditor.setEditable(editable);
			editableListener(parentEditor.isEditable());
			return parentEditor.registerEditableListener(editableListener);
		}
	}, [initialEditor, parentEditor, skipEditableListener]);

	return <LexicalComposerContext.Provider value={composerContext}>
		{!isCollabActive || isCollabReady ? props.children : null}
	</LexicalComposerContext.Provider>;
}
