// Declarative `<Routes>`/`<Route>` support — transcribed from
// react-router@7.18.1 lib/components.tsx with ONE octane-specific mechanism.
//
// Upstream walks React children (`createRoutesFromChildren`) reading
// `element.type === Route`. Octane value-position JSX (argument position, prop
// position, arrays) lowers to walkable descriptors, so that path ports
// verbatim. But the natural `.tsrx` authoring — `<Routes><Route/></Routes>` —
// compiles the children into an OPAQUE render block, so those `<Route>`s are
// collected by REGISTRATION instead (the recharts Cell precedent): `<Routes>`
// renders the block invisibly under a collector context, each `<Route>`
// registers its RouteObject-shaped props in a layout effect (and provides a
// nested collector for its own block children), and `<Routes>` finalizes the
// config pre-paint. Registration order is mount order — source order for
// static trees; a conditionally-mounted `<Route>` between static siblings
// registers late, which only matters for `matchRoutes` score TIES (documented
// divergence, pinned by a test).
import {
	createContext,
	createElement,
	isChildrenBlock,
	useContext,
	useId,
	useLayoutEffect,
	useRef,
	Children,
	isValidElement,
	Fragment,
} from 'octane';
import { invariant } from './../router/history';
import type { RouteObject } from '../router/utils';

interface CollectorEntry {
	order: number;
	props: Record<string, any>;
	childCollector: RoutesCollector | null;
}

export interface RoutesCollector {
	entries: Map<string, CollectorEntry>;
	nextOrder: number;
	onChange: () => void;
	register(id: string, props: Record<string, any>, childCollector: RoutesCollector | null): void;
	unregister(id: string): void;
	collect(parentPath?: number[]): RouteObject[];
}

// The RouteObject-shaped fields a <Route> carries (upstream's route-object
// construction in createRoutesFromChildren reads exactly these).
const ROUTE_PROP_KEYS = [
	'id',
	'caseSensitive',
	'element',
	'Component',
	'index',
	'path',
	'middleware',
	'loader',
	'action',
	'hydrateFallbackElement',
	'HydrateFallback',
	'errorElement',
	'ErrorBoundary',
	'hasErrorBoundary',
	'shouldRevalidate',
	'handle',
	'lazy',
] as const;

// Route props re-create their element descriptors on every render
// (`element={<Home/>}` is a fresh value-position descriptor each pass), so an
// identity comparison would register a material change — and bump/re-render
// <Routes> — on every pass, forever. Descriptors compare structurally
// (type/key + props, recursing through nested descriptors and arrays,
// depth-bounded); everything else stays Object.is, so a genuinely-changed
// element still registers as material.
function routeValueEqual(a: unknown, b: unknown, depth: number): boolean {
	if (Object.is(a, b)) return true;
	if (depth > 8 || a == null || b == null) return false;
	if (Array.isArray(a)) {
		if (!Array.isArray(b) || a.length !== b.length) return false;
		for (let i = 0; i < a.length; i++) {
			if (!routeValueEqual(a[i], b[i], depth + 1)) return false;
		}
		return true;
	}
	if (isValidElement(a) || isValidElement(b)) {
		return (
			isValidElement(a) &&
			isValidElement(b) &&
			a.type === b.type &&
			(a as any).key === (b as any).key &&
			routeValueEqual(a.props, b.props, depth + 1)
		);
	}
	if (typeof a !== 'object' || typeof b !== 'object') return false;
	const pa = Object.getPrototypeOf(a);
	const pb = Object.getPrototypeOf(b);
	if ((pa !== Object.prototype && pa !== null) || (pb !== Object.prototype && pb !== null)) {
		return false;
	}
	const ka = Object.keys(a);
	if (ka.length !== Object.keys(b).length) return false;
	for (const k of ka) {
		if (!routeValueEqual((a as any)[k], (b as any)[k], depth + 1)) return false;
	}
	return true;
}

function routePropsEqual(a: Record<string, any>, b: Record<string, any>): boolean {
	for (const key of ROUTE_PROP_KEYS) {
		if (!routeValueEqual(a[key], b[key], 0)) return false;
	}
	// BLOCK children are opaque compiled render fns whose identity is fresh
	// whenever the enclosing body re-runs (nested `__children$N` helpers are
	// declared inside their parent body) — but their identity is immaterial:
	// buildRoute reads the nested COLLECTOR for block children, and content
	// changes inside the block surface through that collector's own
	// registrations. Descriptor children compare structurally like any value.
	const ac = a.children;
	const bc = b.children;
	if (ac != null && bc != null && isChildrenBlock(ac) && isChildrenBlock(bc)) return true;
	return routeValueEqual(ac, bc, 0);
}

export function createCollector(onChange: () => void): RoutesCollector {
	return {
		entries: new Map(),
		nextOrder: 0,
		onChange,
		register(id, props, childCollector) {
			const existing = this.entries.get(id);
			if (existing) {
				// Only notify on a MATERIAL change — Route re-registers every
				// render (fresh props objects), and an unconditional bump would
				// re-render <Routes> forever.
				const changed =
					!routePropsEqual(existing.props, props) || existing.childCollector !== childCollector;
				existing.props = props;
				existing.childCollector = childCollector;
				if (changed) this.onChange();
			} else {
				this.entries.set(id, { order: this.nextOrder++, props, childCollector });
				this.onChange();
			}
		},
		unregister(id) {
			if (this.entries.delete(id)) this.onChange();
		},
		collect(parentPath = []) {
			const sorted = [...this.entries.values()].sort((a, b) => a.order - b.order);
			return sorted.map((entry, index) => buildRoute(entry, [...parentPath, index]));
		},
	};
}

function buildRoute(entry: CollectorEntry, treePath: number[]): RouteObject {
	const p = entry.props;
	invariant(!p.index || !p.children, 'An index route cannot have child routes.');
	const route: RouteObject = {
		id: p.id || treePath.join('-'),
		caseSensitive: p.caseSensitive,
		element: p.element,
		Component: p.Component,
		index: p.index,
		path: p.path,
		middleware: p.middleware,
		loader: p.loader,
		action: p.action,
		hydrateFallbackElement: p.hydrateFallbackElement,
		HydrateFallback: p.HydrateFallback,
		errorElement: p.errorElement,
		ErrorBoundary: p.ErrorBoundary,
		hasErrorBoundary:
			p.hasErrorBoundary === true || p.ErrorBoundary != null || p.errorElement != null,
		shouldRevalidate: p.shouldRevalidate,
		handle: p.handle,
		lazy: p.lazy,
	} as RouteObject;
	if (entry.childCollector) {
		// Block children — registered into the nested collector.
		route.children = entry.childCollector.collect(treePath);
	} else if (p.children) {
		// Descriptor children — walked directly, upstream-style.
		route.children = createRoutesFromChildren(p.children, treePath);
	}
	return route;
}

export const RoutesCollectorContext = createContext<RoutesCollector | null>(null);

/**
 * Configures an element to render when a pattern matches the current location.
 * It must be rendered within a {@link Routes} element.
 */
export function Route(props: Record<string, any>): unknown {
	const collector = useContext(RoutesCollectorContext);
	invariant(
		collector,
		`A <Route> is only ever to be used as the child of <Routes> element, ` +
			`never rendered directly. Please wrap your <Route> in a <Routes>.`,
	);

	// Plain-.ts component: hooks receive hand-passed stable slot symbols (the
	// runtime keys hook state per component-instance SCOPE, so fixed call-site
	// symbols are exactly what the compiler would inject).
	const id = useId(Symbol.for('rr:route:id') as any);
	const hasBlockChildren = props.children != null && isChildrenBlock(props.children);
	const childCollectorRef = useRef<RoutesCollector | null>(null, Symbol.for('rr:route:cc') as any);
	if (hasBlockChildren && childCollectorRef.current === null) {
		// Nested block children register here; changes bubble to the root
		// collector's onChange.
		childCollectorRef.current = createCollector(collector.onChange);
	}

	// Register AFTER the children's layout effects (octane runs effects
	// child-first on mount), so a nested collector is fully populated before
	// the parent finalizes. No deps: props may change render to render — the
	// collector's material-change check keeps this loop-free.
	useLayoutEffect(
		() => {
			collector.register(id, props, hasBlockChildren ? childCollectorRef.current : null);
		},
		undefined as any,
		Symbol.for('rr:route:reg') as any,
	);
	useLayoutEffect(
		() => {
			return () => collector.unregister(id);
		},
		[collector, id],
		Symbol.for('rr:route:unreg') as any,
	);

	// Block children render invisibly under the nested collector so the
	// <Route>s inside register; descriptor children need no rendering (walked
	// at collect time). Route itself renders nothing, as upstream.
	if (hasBlockChildren) {
		return createElement(RoutesCollectorContext.Provider as any, {
			value: childCollectorRef.current,
			children: props.children,
		});
	}
	return null;
}

/**
 * Creates a route config from a React "children" object, which is usually
 * either a `<Route>` element or an array of them. Used internally by
 * `<Routes>` to create a route config from its children.
 */
export function createRoutesFromChildren(
	children: unknown,
	parentPath: number[] = [],
): RouteObject[] {
	const routes: RouteObject[] = [];

	Children.forEach(children as any, (element: any, index: number) => {
		if (!isValidElement(element)) {
			// Ignore non-elements. This allows people to more easily inline
			// conditionals in their route config.
			return;
		}

		const treePath = [...parentPath, index];

		if ((element.type as unknown) === Fragment) {
			// Transparently support Fragment and its children.
			routes.push.apply(routes, createRoutesFromChildren(element.props.children, treePath));
			return;
		}

		invariant(
			element.type === Route,
			`[${
				typeof element.type === 'string' ? element.type : (element.type as any).name
			}] is not a <Route> component. All component children of <Routes> must be a <Route> or <React.Fragment>`,
		);

		invariant(
			!element.props.index || !element.props.children,
			'An index route cannot have child routes.',
		);

		const route: RouteObject = {
			id: element.props.id || treePath.join('-'),
			caseSensitive: element.props.caseSensitive,
			element: element.props.element,
			Component: element.props.Component,
			index: element.props.index,
			path: element.props.path,
			middleware: element.props.middleware,
			loader: element.props.loader,
			action: element.props.action,
			hydrateFallbackElement: element.props.hydrateFallbackElement,
			HydrateFallback: element.props.HydrateFallback,
			errorElement: element.props.errorElement,
			ErrorBoundary: element.props.ErrorBoundary,
			hasErrorBoundary:
				element.props.hasErrorBoundary === true ||
				element.props.ErrorBoundary != null ||
				element.props.errorElement != null,
			shouldRevalidate: element.props.shouldRevalidate,
			handle: element.props.handle,
			lazy: element.props.lazy,
		} as RouteObject;

		if (element.props.children) {
			route.children = createRoutesFromChildren(element.props.children, treePath);
		}

		routes.push(route);
	});

	return routes;
}

export const createRoutesFromElements = createRoutesFromChildren;
