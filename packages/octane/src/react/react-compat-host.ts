import * as React from 'react';
import type { BindingHandle, BindingSource, CompiledBindings } from '../dom-bindings.js';

type DataProps = {
	[key: `data-${string}`]: string | number | bigint | boolean | null | undefined;
};
type Presentation = 'className' | 'style' | `aria-${string}` | `data-${string}`;
type Host<P, Tag extends keyof React.JSX.IntrinsicElements> = (
	props: React.ComponentPropsWithRef<Tag> &
		DataProps &
		Pick<P, Extract<keyof P, Presentation | 'input'>>,
) => React.ReactElement;
type HostProps = React.HTMLAttributes<Element> &
	DataProps & { ref?: React.Ref<Element>; input?: unknown };
type Projection = {
	id: string;
	derive?: (props: HostProps) => Partial<HostProps>;
};
type HostView = Projection &
	CompiledBindings<HostProps> & {
		adopt(
			node: Element,
			view: CompiledBindings<HostProps>,
			source: BindingSource<HostProps>,
		): BindingHandle;
	};

const stamp = 'data-octane-bindings';
const noop = () => {};

/**
 * Stream a single Strong DOM-binding element in the surrounding React tree.
 * The compiler replaces the local template with its stamp on the server
 * and its binding plan on the client. React always owns the children.
 */
export function createReactCompatHost<P>(view: (props: P) => unknown): Host<P, 'div'>;
export function createReactCompatHost<P, Tag extends keyof React.JSX.IntrinsicElements>(
	view: (props: P) => unknown,
	tag: Tag,
): Host<P, Tag>;
export function createReactCompatHost(
	view: string | Projection | HostView | ((props: never) => unknown),
	tag = 'div',
): unknown {
	if (typeof view === 'function') {
		throw new TypeError('createReactCompatHost requires a compiled Strong DOM-binding template.');
	}
	const derive = typeof view === 'string' ? undefined : view.derive;
	function project(raw: HostProps): HostProps {
		if (!derive && !('input' in raw)) return raw;
		const { input, ...props } = raw;
		return Object.assign(props, derive?.(raw));
	}
	if (typeof view === 'string' || !('adopt' in view)) {
		const id = typeof view === 'string' ? view : view.id;
		return (raw: HostProps) => React.createElement(tag, { ...project(raw), [stamp]: id });
	}

	const keys = view.bindings.map(
		([, kind, name]) => (kind === 'class' ? 'className' : name) as Presentation & keyof HostProps,
	);
	return function ReactCompatHost(raw: HostProps) {
		const props = project(raw);
		const { ref } = props;
		// Until attachment (including an initially hidden Activity), React owns all props.
		// A stale stream stays React-owned for the lifetime of this host.
		const [owned, setOwned] = React.useState<HostProps | null>();
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
			(node: Element | null) => {
				if (node && binding.handle === undefined) {
					if (node.getAttribute(stamp) === view.id) {
						// Shared tags such as <a> inherit SVG from the surrounding React tree.
						const plan: CompiledBindings<HostProps> =
							node.namespaceURI === 'http://www.w3.org/2000/svg' && view.nodes[0]![2] === 0
								? { ...view, nodes: [[-1, tag, 1, null]] }
								: view;
						binding.handle = view.adopt(node, plan, {
							getSnapshot: () => binding.props,
							subscribe: () => noop,
						});
						setOwned(Object.fromEntries(keys.map((key) => [key, binding.props[key]])) as HostProps);
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
		return React.createElement(tag, host);
	};
}
