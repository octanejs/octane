// Ported from @lexical/react/src/shared/useDecorators.tsx (the LegacyDecorators
// path used by Rich/PlainTextPlugin). React's `useDecorators` hook is realized as
// a `Decorators` COMPONENT here: each <Decorators/> usage is its own octane scope,
// so its useState/useEffect/useMemo get per-instance identity automatically.
//
// Each decorator node renders into the DOM element Lexical created for it, via a
// portal. octane's createPortal lowers to portal() only as a DIRECT child of a host
// element (a createPortal VALUE is inert), so each portal lives inside its own
// `DecoratorPortal` (a display:contents wrapper — the content escapes into the
// node's element).
import type { LexicalEditor } from 'lexical';
import type { OctaneNode } from 'octane';
import {
	useState,
	useEffect,
	useLayoutEffect,
	useMemo,
	flushSync,
	createElement,
	createPortal,
	Suspense,
} from 'octane';

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

	const [decorators, setDecorators] = useState(() => editor.getDecorators());

	// Subscribe to decorator changes.
	useLayoutEffect(() => {
		return editor.registerDecoratorListener((nextDecorators: Record<string, OctaneNode>) => {
			flushSync(() => {
				setDecorators(nextDecorators);
			});
		});
	}, [editor]);

	useEffect(() => {
		// If the content editable mounts before the subscription is added, nothing
		// renders on the initial pass — re-read on mount to cover that.
		setDecorators(editor.getDecorators());
	}, [editor]);

	// Resolve each decorator node's DOM element + its decorator content.
	const entries = useMemo(() => {
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
	}, [decorators, editor]);

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
