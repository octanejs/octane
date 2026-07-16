/**
 * Use Octane components inside a React app.
 *
 * This is the reverse direction of `@octanejs/react-compat` (which runs React
 * packages on Octane). Here the host renderer is REAL React: the wrapper
 * renders a container element into the React tree, mounts an Octane root into
 * it, and keeps the two renderers glued together:
 *
 *  - React props flow into the Octane component on every React commit via the
 *    Octane root's same-body fast path (props update in place — Octane state,
 *    effects and DOM survive; see makeRoot in octane's runtime).
 *  - React children flow INTO the Octane tree: the Octane component receives a
 *    `children` host slot (`display: contents`, so it is layout-neutral), and
 *    the wrapper portals the React children into that slot once Octane attaches
 *    its ref. Events inside the children bubble to React's root listener as
 *    usual, so React handlers keep working inside Octane-rendered DOM.
 *  - Renders are flushed with Octane's `flushSync` from a layout effect, so the
 *    Octane DOM is committed before the browser paints the React commit.
 *
 * Client-only: under React SSR the wrapper renders an empty container and
 * mounts Octane after hydration.
 */
import {
	createElement as reactCreateElement,
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
	type ComponentType,
	type CSSProperties,
	type ReactElement,
	type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import {
	createElement as octaneCreateElement,
	createRoot as octaneCreateRoot,
	flushSync as octaneFlushSync,
	type ComponentBody,
	type Root as OctaneRoot,
} from 'octane';

/** A compiled Octane component (a `.tsrx` export, or any Octane component body). */
export type OctaneComponent<P = Record<string, unknown>> = ((props: P) => unknown) & {
	displayName?: string;
};

export interface OctaneWrapperProps<P = Record<string, unknown>> {
	/** The Octane component to mount. */
	component: OctaneComponent<P>;
	/** Props forwarded to the Octane component on every React commit. */
	props?: P;
	/**
	 * React children, bridged into the Octane component's `children` prop as a
	 * layout-neutral host slot. Overrides any `children` key in `props`.
	 */
	children?: ReactNode;
	/** Container tag rendered by React to host the Octane root. Default: 'div'. */
	as?: string;
	className?: string;
	style?: CSSProperties;
}

// React SSR warns on useLayoutEffect; the server pass renders only the empty
// container anyway, so the effect timing there is irrelevant.
const useIsomorphicLayoutEffect = typeof document === 'undefined' ? useEffect : useLayoutEffect;

// The children slot Octane renders for us to portal into. `display: contents`
// keeps it out of layout, so bridged children behave as direct children of
// whatever the Octane component renders around `{children}`.
const CHILD_SLOT_STYLE = { display: 'contents' } as const;

/**
 * Mount an Octane component inside a React tree.
 *
 * ```tsx
 * <OctaneWrapper component={Counter} props={{ start: 5 }} />
 *
 * <OctaneWrapper component={Panel} props={{ title: 'Settings' }}>
 *   <ReactSettingsForm />
 * </OctaneWrapper>
 * ```
 */
export function OctaneWrapper<P = Record<string, unknown>>(
	wrapperProps: OctaneWrapperProps<P>,
): ReactElement {
	const { component, props, children, as = 'div', className, style } = wrapperProps;
	const containerRef = useRef<HTMLElement | null>(null);
	const rootRef = useRef<OctaneRoot | null>(null);
	const mountedOn = useRef<HTMLElement | null>(null);
	const [childSlot, setChildSlot] = useState<Element | null>(null);
	// The slot descriptor is minted ONCE per wrapper instance. Identity matters
	// twice over: a stable ref callback means Octane never re-attaches it, and a
	// stable element descriptor makes Octane bail out of reconciling the slot on
	// re-renders — the portal content React parks inside is foreign to Octane's
	// reconciler and would be swept out by a fresh descriptor.
	const slotDescriptor = useRef<unknown>(null);
	slotDescriptor.current ??= octaneCreateElement('span', {
		ref: (el: Element | null) => setChildSlot(el),
		style: CHILD_SLOT_STYLE,
	});

	// React ignores boolean/nullish children; mirror that here so `{cond && <X/>}`
	// composes without minting an empty slot.
	const hasChildren = children != null && typeof children !== 'boolean';

	// Render on every React commit. The Octane root's same-body fast path turns
	// repeat renders into in-place props updates (Octane state/DOM survive); a
	// changed `component` tears down and remounts inside Octane itself.
	useIsomorphicLayoutEffect(() => {
		const container = containerRef.current!;
		if (rootRef.current !== null && mountedOn.current !== container) {
			// The `as` tag changed, so React replaced the container element; the old
			// root points at detached DOM.
			rootRef.current.unmount();
			rootRef.current = null;
		}
		mountedOn.current = container;
		const root = (rootRef.current ??= octaneCreateRoot(container));
		const octaneProps = hasChildren
			? { ...(props as object), children: slotDescriptor.current }
			: ((props ?? {}) as object);
		// flushSync commits the Octane render (and its layout effects) before the
		// browser paints this React commit; Octane passive effects stay post-paint.
		octaneFlushSync(() => root.render(component as ComponentBody, octaneProps));
	});

	useIsomorphicLayoutEffect(
		() => () => {
			rootRef.current?.unmount();
			rootRef.current = null;
			mountedOn.current = null;
		},
		[],
	);

	// The portal is the container's only React child; it renders no DOM in place,
	// so React never touches the Octane-managed nodes inside the container.
	return reactCreateElement(
		as,
		{ ref: containerRef, className, style },
		hasChildren && childSlot !== null ? createPortal(children, childSlot) : null,
	);
}

export interface WrapOctaneOptions {
	/** Container tag rendered by React to host the Octane root. Default: 'div'. */
	as?: string;
	className?: string;
	style?: CSSProperties;
	displayName?: string;
}

/**
 * Turn an Octane component into a first-class React component: props pass
 * through one-to-one and React children bridge into the Octane `children` prop.
 *
 * ```tsx
 * const Counter = wrapOctane(OctaneCounter);
 * <Counter start={5} />
 * ```
 */
export function wrapOctane<P extends Record<string, unknown> = Record<string, unknown>>(
	component: OctaneComponent<P>,
	options: WrapOctaneOptions = {},
): ComponentType<P & { children?: ReactNode }> {
	function Wrapped(allProps: P & { children?: ReactNode }): ReactElement {
		const { children, ...rest } = allProps;
		return reactCreateElement(OctaneWrapper as ComponentType<OctaneWrapperProps<P>>, {
			component,
			props: rest as unknown as P,
			children,
			as: options.as,
			className: options.className,
			style: options.style,
		});
	}
	Wrapped.displayName =
		options.displayName ?? `Octane(${component.displayName ?? (component.name || 'Component')})`;
	return Wrapped;
}
