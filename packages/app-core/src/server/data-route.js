// @ts-check
/**
 * The config's `data` module on the server: open one store per request, render
 * the route inside it, seed its loaded values for the browser once the render
 * has finished, and retire it when the response ends.
 */
import { onRouteEnd, routeSeed } from '../seeds.js';

/** The seed the browser's store starts from. */
export const DATA_SEED = 'data';

/**
 * @param {import('@octanejs/app-core').Context} context
 * @param {import('@octanejs/app-core/production').RouteDataEntry | null | undefined} data
 * @param {(props?: any, scope?: any, extra?: any) => any} Root
 */
export function provideRouteData(context, data, Root) {
	if (!data) return Root;
	const store = data.open(null, context);
	onRouteEnd(context, () => void store.retire());
	routeSeed(context, DATA_SEED, () => store.dehydrate());
	const { Root: DataRoot } = data;
	return function RouteData(/** @type {any} */ props, /** @type {any} */ scope) {
		// As a layout's `children`: a body closing over the route's props.
		const children = (/** @type {any} */ _props, /** @type {any} */ childScope) =>
			Root(props, childScope, undefined);
		return DataRoot({ store, children }, scope, undefined);
	};
}
