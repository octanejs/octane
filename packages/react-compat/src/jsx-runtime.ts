import { Fragment, createElement } from './shim.js';

export { Fragment };

function element(type: unknown, props: any, key: unknown, staticChildren: boolean): unknown {
	let nextProps = key === undefined ? props : { ...(props ?? {}), key };
	if (staticChildren && Array.isArray(nextProps?.children)) {
		const { children, ...withoutChildren } = nextProps;
		return createElement(type, withoutChildren, ...children);
	}
	return createElement(type, nextProps);
}

export function jsx(type: unknown, props: any, key?: unknown): unknown {
	return element(type, props, key, false);
}

export function jsxs(type: unknown, props: any, key?: unknown): unknown {
	return element(type, props, key, true);
}

export function jsxDEV(
	type: unknown,
	props: any,
	key?: unknown,
	isStaticChildren: boolean = false,
): unknown {
	return element(type, props, key, isStaticChildren);
}
