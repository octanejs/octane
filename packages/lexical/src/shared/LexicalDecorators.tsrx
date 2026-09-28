// Ported from @lexical/react/src/shared/useReactDecorators.tsx (the LegacyDecorators
// path used by Rich/PlainTextPlugin). React's hook is realized as a `Decorators`
// COMPONENT here: each <Decorators/> usage is its own octane scope, so its hooks
// get per-instance identity automatically.
//
// Each decorator node renders into the DOM element Lexical created for it, via a
// `DecoratorPortal` component that returns a createPortal value.
import type { LexicalEditor } from 'lexical';
import type { OctaneNode } from 'octane';
import { createElement, createPortal, Suspense, useMemo, useSyncExternalStore } from 'octane';

type ErrorBoundaryType =
	(props: {
		children: OctaneNode;
		onError: (error: Error) => void;
	}) => OctaneNode;

type DecoratorPortalBodyProps = {
	ErrorBoundary: ErrorBoundaryType;
	onError: (error: Error) => void;
	decorator: OctaneNode;
};

function DecoratorPortalBody(props: DecoratorPortalBodyProps) {
	return createElement(props.ErrorBoundary, {
		onError: props.onError,
		children: createElement(Suspense, { fallback: null, children: props.decorator }),
	});
}

type DecoratorPortalProps = {
	element: HTMLElement;
	bodyProps: DecoratorPortalBodyProps;
};

function DecoratorPortal(props: DecoratorPortalProps) {
	return createPortal(DecoratorPortalBody, props.element, props.bodyProps);
}

type DecoratorsProps = {
	editor: LexicalEditor;
	ErrorBoundary: ErrorBoundaryType;
};

export function Decorators(props: DecoratorsProps) {
	const editor = props.editor;
	const ErrorBoundary = props.ErrorBoundary;

	const [subscribe, getSnapshot] = useMemo(
		() => [
			(cb: () => void) => editor.registerDecoratorListener(cb),
			() => editor.getDecorators<OctaneNode>(),
		] as const,
		[editor],
	);
	const decorators = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
	// A root remount recreates every decorator's DOM element without changing the
	// decorator map, so the portals are re-derived when the root element changes.
	const [subscribeRoot, getRootSnapshot] = useMemo(
		() => [editor.registerRootListener.bind(editor), editor.getRootElement.bind(editor)] as const,
		[editor],
	);
	const rootElement = useSyncExternalStore(subscribeRoot, getRootSnapshot, getRootSnapshot);

	// Resolve each decorator node's DOM element + its decorator content.
	const entries = useMemo(() => {
		void rootElement;
		const out = [];
		const decoratorKeys = Object.keys(decorators);
		for (let i = 0; i < decoratorKeys.length; i++) {
			const nodeKey = decoratorKeys[i];
			const element = editor.getElementByKey(nodeKey);
			if (element !== null) {
				out.push({ nodeKey, element, decorator: decorators[nodeKey] });
			}
		}
		return out;
	}, [decorators, editor, rootElement]);

	// Render nothing when there are no decorators (matches @lexical/react). Each
	// decorator is a portal into its node's element — a keyed list of DecoratorPortal
	// components, each returning a createPortal VALUE (octane renders portals at any
	// position, so no wrapper element is needed).
	if (entries.length === 0) {
		return null;
	}
	return <>
		{entries.map(
			(entry) => <DecoratorPortal
				key={entry.nodeKey}
				element={entry.element}
				bodyProps={{
					ErrorBoundary,
					onError: (e: Error) => editor._onError(e),
					decorator: entry.decorator,
				}}
			/>,
		)}
	</>;
}
