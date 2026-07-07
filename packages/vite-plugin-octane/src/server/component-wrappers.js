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
 * @typedef {(props?: any, scope?: any, extra?: any) => string} ServerComponent
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
