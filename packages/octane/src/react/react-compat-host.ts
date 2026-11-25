import * as React from 'react';
import type { BindingHandle, BindingSource, CompiledBindings } from '../dom-bindings.js';

type DivProps = React.ComponentPropsWithRef<'div'> & {
	[key: `data-${string}`]: string | number | bigint | boolean | null | undefined;
};
type Presentation = 'className' | 'style' | `aria-${string}` | `data-${string}`;
type HostView = CompiledBindings<DivProps> & {
	adopt(
		node: Element,
		view: CompiledBindings<DivProps>,
		source: BindingSource<DivProps>,
	): BindingHandle;
};

const stamp = 'data-octane-bindings';
const noop = () => {};

/**
 * Stream a single Strong DOM-binding div in the surrounding React tree.
 * The compiler replaces the local template with its stamp on the server
 * and its binding plan on the client. React always owns the children.
 */
export function createReactCompatHost<P>(
	view: (props: P) => unknown,
): (props: DivProps & Pick<P, Extract<keyof P, Presentation>>) => React.ReactElement;
export function createReactCompatHost(view: string | HostView | ((props: never) => unknown)) {
	if (typeof view === 'function') {
		throw new TypeError('createReactCompatHost requires a compiled Strong DOM-binding template.');
	}
	if (typeof view === 'string') {
		return (props: DivProps) => React.createElement('div', { ...props, [stamp]: view });
	}

	const keys = view.bindings.map(
		([, kind, name]) => (kind === 'class' ? 'className' : name) as Presentation & keyof DivProps,
	);
	return function ReactCompatHost(props: DivProps) {
		const { ref } = props;
		// Until attachment (including an initially hidden Activity), React owns all props.
		// A stale stream stays React-owned for the lifetime of this host.
		const [owned, setOwned] = React.useState<DivProps | null>();
		const [binding] = React.useState(() => ({
			props,
			handle: undefined as BindingHandle | null | undefined,
		}));
		// Hidden trees detach refs. Retain the binding until deletion and publish
		// only committed props, before descendants measure the host on reveal.
		React.useInsertionEffect(() => () => binding.handle?.dispose(), [binding]);
		React.useInsertionEffect(() => {
			const previous = binding.props;
			binding.props = props;
			if (binding.handle && keys.some((key) => previous[key] !== props[key])) {
				binding.handle.refresh();
			}
		}, [binding, props]);
		const attach = React.useCallback(
			(node: HTMLDivElement | null) => {
				if (node && binding.handle === undefined) {
					if (node.getAttribute(stamp) === view.id) {
						binding.handle = view.adopt(node, view, {
							getSnapshot: () => binding.props,
							subscribe: () => noop,
						});
						setOwned(Object.fromEntries(keys.map((key) => [key, binding.props[key]])) as DivProps);
					} else {
						binding.handle = null;
						setOwned(null);
					}
				}
				if (typeof ref === 'function') return ref(node);
				if (ref) ref.current = node;
			},
			[binding, ref],
		);

		const host = { ...props, ...owned, [stamp]: owned === null ? undefined : view.id, ref: attach };
		// React restores display from its own props when it unhides an Activity.
		if (host.style?.display !== props.style?.display) {
			host.style = { ...host.style, display: props.style?.display };
		}
		return React.createElement('div', host);
	};
}
