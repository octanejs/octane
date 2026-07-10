import { createElement } from 'octane/server';
import { Fragment, resolveServerCompatType } from './server-shim.js';

export { Fragment };

const CONTEXT_TAG = Symbol.for('octane.context');

function reactType(type: any): any {
	return type?.$$kind === CONTEXT_TAG ? type.Provider : resolveServerCompatType(type);
}

function element(type: unknown, props: any, key: unknown, staticChildren: boolean): unknown {
	let nextProps = key === undefined ? props : { ...(props ?? {}), key };
	if (staticChildren && Array.isArray(nextProps?.children)) {
		const { children, ...withoutChildren } = nextProps;
		return createElement(reactType(type), withoutChildren, ...children);
	}
	return createElement(reactType(type), nextProps);
}

export function jsx(type: unknown, props: any, key?: unknown): unknown {
	return element(type, props, key, false);
}

export function jsxs(type: unknown, props: any, key?: unknown): unknown {
	return element(type, props, key, true);
}

export function jsxDEV(type: unknown, props: any, key?: unknown, staticChildren = false): unknown {
	return element(type, props, key, staticChildren);
}
