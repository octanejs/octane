// Ported from @lexical/react/src/shared/useDecorators.tsx (the LegacyDecorators
// path used by Rich/PlainTextPlugin). React's `useDecorators` hook is realized as
// a `Decorators` COMPONENT here: each <Decorators/> usage is its own octane scope,
// so its useState/useEffect/useMemo get per-instance identity automatically (no
// sub-slot forwarding needed, unlike the plain-`.ts` hooks).
//
// Each decorator node is rendered into the DOM element Lexical created for it, via
// a portal. octane's createPortal takes (body, target, props) — a ComponentBody +
// props — so the ErrorBoundary/Suspense wrapper is `DecoratorPortalBody`, built
// with createElement (no JSX-as-value needed for the dynamic ErrorBoundary tag).
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

function DecoratorPortalBody(props) {
	return createElement(props.ErrorBoundary, {
		onError: props.onError,
		children: createElement(Suspense, { fallback: null, children: props.decorator }),
	});
}

export function Decorators(props) {
	const editor = props.editor;
	const ErrorBoundary = props.ErrorBoundary;

	const [decorators, setDecorators] = useState(() => editor.getDecorators());

	// Subscribe to decorator changes.
	useLayoutEffect(() => {
		return editor.registerDecoratorListener((nextDecorators) => {
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

	// Decorators as octane portals.
	const portals = useMemo(() => {
		const out = [];
		const decoratorKeys = Object.keys(decorators);
		for (let i = 0; i < decoratorKeys.length; i++) {
			const nodeKey = decoratorKeys[i];
			const element = editor.getElementByKey(nodeKey);
			if (element !== null) {
				out.push(
					createPortal(DecoratorPortalBody, element, {
						ErrorBoundary,
						onError: (e) => editor._onError(e),
						decorator: decorators[nodeKey],
					}),
				);
			}
		}
		return out;
	}, [ErrorBoundary, decorators, editor]);

	return portals;
}
