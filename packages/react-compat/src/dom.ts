import {
	createElement,
	createPortal as octaneCreatePortal,
	createRoot as octaneCreateRoot,
	flushSync,
	hydrateRoot as octaneHydrateRoot,
	type Root as OctaneRoot,
} from 'octane';
import { useActionState, useFormStatus } from './shim.js';

export { flushSync, useFormStatus };
export const useFormState = useActionState;
export const version = '19.2.0-octane-compat';

function CompatRoot(props: { node: unknown }): unknown {
	return props.node;
}

export interface Root {
	render(node: unknown): void;
	unmount(): void;
}

function wrapRoot(root: OctaneRoot): Root {
	return {
		render(node) {
			root.render(createElement(CompatRoot as any, { node }) as any);
		},
		unmount: () => root.unmount(),
	};
}

export function createRoot(container: Element): Root {
	return wrapRoot(octaneCreateRoot(container));
}

export function hydrateRoot(container: Element, node: unknown): Root {
	return wrapRoot(octaneHydrateRoot(container, createElement(CompatRoot as any, { node }) as any));
}

export function createPortal(children: unknown, container: Element, key?: unknown): unknown {
	return octaneCreatePortal(children, container, key === undefined ? undefined : { key });
}

export function unstable_batchedUpdates<T>(fn: (...args: any[]) => T, ...args: any[]): T {
	return fn(...args);
}

export function requestFormReset(form: HTMLFormElement): void {
	form.reset();
}

export function findDOMNode(): never {
	throw new Error(
		'[react-compat] ReactDOM.findDOMNode is not supported (and was removed by React 19). Use a ref.',
	);
}

export function render(): never {
	throw new Error(
		'[react-compat] ReactDOM.render is legacy; use createRoot(container).render(node).',
	);
}

export function unmountComponentAtNode(): never {
	throw new Error('[react-compat] Use the Root object returned by createRoot().');
}

const ReactDOM = {
	createPortal,
	findDOMNode,
	flushSync,
	requestFormReset,
	unstable_batchedUpdates,
	useFormStatus,
	version,
};

export default ReactDOM;
