// @ts-check
/**
 * Server component composition for the octane renderer.
 *
 * octane's server ABI is PROPS-FIRST (matching the client): a component body is
 * `(props, scope, extra) => string`. `render(Component, props)` invokes the ROOT
 * directly as `Component(props, rootScope, undefined)` and does NOT wrap it in
 * block markers — and `hydrateRoot()` adopts the container's FIRST CHILD as the
 * root's own node. So the wrapper must call the top-level component DIRECTLY
 * (wrapping it in `ssrComponent` would add an extra `<!--[-->…<!--]-->` layer that
 * `clone()` then mis-adopts on hydrate).
 *
 * Only the layout's `{children}` is a nested hole: the compiled layout emits
 * `ssrChild(props.children, scope)`, and `ssrChild` invokes a FUNCTION child as
 * `children({}, scope, undefined)` wrapped in one `<!--[-->…<!--]-->` range. So
 * `children` is a ComponentBody that calls the page directly, and any page data
 * (params) rides its CLOSURE — `ssrChild` supplies only `{}`. The client
 * `childSlot` applies the identical rule (bare function = ComponentBody, `{}`
 * props, one marker range), so server markers and client adoption line up.
 *
 * @typedef {(props?: any, scope?: any, extra?: any) => string | void} ServerComponent
 */

/**
 * Wrap a page component, baking in its route props.
 *
 * @param {ServerComponent} Page
 * @param {Record<string, unknown>} pageProps
 * @returns {ServerComponent}
 */
export function createPropsWrapper(Page, pageProps) {
	return function Root(_props, scope) {
		return Page(pageProps, scope, undefined);
	};
}

/**
 * Compose a layout with a page: the layout's `{children}` renders the page.
 *
 * @param {ServerComponent} Layout
 * @param {ServerComponent} Page
 * @param {Record<string, unknown>} pageProps
 * @returns {ServerComponent}
 */
export function createLayoutWrapper(Layout, Page, pageProps) {
	return function Root(_props, scope) {
		// `children` is a ComponentBody closing over pageProps; the layout's
		// `{children}` hole runs it via ssrChild (which supplies `{}` props and
		// wraps the output in one block range), so the page still gets its real
		// route props through the closure. PROPS-FIRST: childSlot/ssrChild call it
		// as `({}, scope, extra)`, so the page's real props are passed explicitly.
		const children = (/** @type {any} */ _cprops, /** @type {any} */ cscope) =>
			Page(pageProps, cscope, undefined);
		return Layout({ ...pageProps, children }, scope, undefined);
	};
}

/**
 * Add the configured app-wide Suspense/ErrorBoundary around a route root.
 * The same composition helper is used by dev SSR, production SSR, and the
 * generated browser hydrate entry, so all three produce/adopt the same nested
 * marker shape.
 *
 * @param {ServerComponent} Content
 * @param {{ pending?: ServerComponent | null, catch?: ServerComponent | null }} boundary
 * @param {{ Suspense: ServerComponent, ErrorBoundary: ServerComponent, createElement: Function }} runtime
 * @returns {ServerComponent}
 */
export function createRootBoundaryWrapper(Content, boundary, runtime) {
	let body = Content;

	// Compose the catch boundary closest to the route. A Suspense boundary is
	// allowed to retain its pending shell when an unhandled server render error
	// reaches it, so putting Suspense inside ErrorBoundary would prevent the
	// configured catch component from observing ordinary route errors.
	if (boundary.catch) {
		const child = body;
		const Catch = boundary.catch;
		body = function RootErrorBoundary(props, scope) {
			const children = (/** @type {any} */ _props, /** @type {any} */ childScope) =>
				child(props, childScope, undefined);
			const fallback = (/** @type {unknown} */ error, /** @type {() => void} */ reset) =>
				runtime.createElement(Catch, { error, reset });
			return runtime.ErrorBoundary({ fallback, children }, scope, undefined);
		};
	}

	if (boundary.pending) {
		const child = body;
		const Pending = boundary.pending;
		body = function RootSuspense(props, scope) {
			const children = (/** @type {any} */ _props, /** @type {any} */ childScope) =>
				child(props, childScope, undefined);
			return runtime.Suspense(
				{ fallback: runtime.createElement(Pending, {}), children },
				scope,
				undefined,
			);
		};
	}

	return body;
}
