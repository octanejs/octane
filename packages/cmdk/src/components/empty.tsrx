// Command.Empty. Renders only when the filter matched nothing.
import { useSyncExternalStore } from 'octane';
import { useStore } from '../context.tsrx';
import type { EmptyProps } from '../types';

export function Empty(props: EmptyProps) @{
	const store = useStore()!;

	// Force-mounted items never enter `filtered.count`, so consult both: "no
	// results" must not render while any item is visible.
	const snapshot = () => {
		const state = store.snapshot();
		return state.filtered.count === 0 && state.forceMountedCount === 0;
	};

	// The server snapshot is `false`. Items register in layout effects, which do
	// not run on the server, so the count is unavoidably 0 there — rendering on
	// that would ship "No results found." above a fully-populated list on every
	// SSR page and leave it there for readers without JavaScript. This subscribes
	// directly rather than through `useCmdk` because a server snapshot passed to
	// a base hook from inside a custom .tsrx hook does not reach the SSR runtime.
	const render = useSyncExternalStore(store.subscribe, snapshot, () => false);

	if (!render) return null;

	const { ref: _ref, children, ...etc } = props;
	<div ref={props.ref} {...etc} cmdk-empty="" role="presentation">{children}</div>
}
