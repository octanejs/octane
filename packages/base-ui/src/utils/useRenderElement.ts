// Ported from .base-ui/packages/react/src/internals/useRenderElement.tsx (v1.6.0).
//
// The single composition engine every Base UI part routes through. It resolves the
// component's `render` (a JSX element OR `(props, state) => element`) + `className`
// (string|fn) + `style` (object|fn) + `state`→`data-*`, merges them with the
// behavior/intrinsic props, composes refs, and produces the final element via
// octane's `cloneElement`/`createElement`.
//
// octane specifics: no rules of hooks, so the ref-merge hook is called
// unconditionally (Base UI's `typeof document` + conditional-hook dance is dropped);
// `render`-as-function returns octane JSX directly; ref is a plain prop.
//
// SLOT: this is a plain-`.ts` hook consumed from source (excluded from auto-slotting),
// so it forwards the caller's slot. The component passes `subSlot(componentSlot, 're')`
// as the trailing arg.
import { createElement, cloneElement } from 'octane';

import { splitSlot, subSlot, S } from '../internal';
import { useComposedRefs } from './composeRefs';
import { getElementRef } from './getElementRef';
import { getStateAttributesProps, type StateAttributesMapping } from './getStateAttributesProps';
import { mergeObjects } from './mergeObjects';
import { resolveClassName } from './resolveClassName';
import { resolveStyle } from './resolveStyle';
import { mergeProps, mergePropsN, mergeClassNames } from './mergeProps';

const EMPTY_OBJECT: Record<string, any> = {};

export type RenderProp<State> =
	| ((props: Record<string, any>, state: State) => any)
	| any /* element descriptor */;

export interface UseRenderElementComponentProps<State> {
	className?: string | ((state: State) => string | undefined);
	render?: RenderProp<State>;
	style?: Record<string, any> | ((state: State) => Record<string, any> | undefined);
}

export interface UseRenderElementParameters<State> {
	enabled?: boolean;
	ref?: any;
	state?: State;
	props?: Record<string, any> | Array<Record<string, any> | undefined | ((p: any) => any)>;
	stateAttributesMapping?: StateAttributesMapping<State>;
}

export function useRenderElement<State extends Record<string, any>>(
	element: string | undefined,
	componentProps: UseRenderElementComponentProps<State>,
	params: UseRenderElementParameters<State> = {},
	...slotArgs: any[]
): any {
	const [, slotArg] = splitSlot(['_', ...slotArgs]);
	const slot = slotArg ?? S('useRenderElement');

	const renderProp = componentProps.render;
	const outProps = useRenderElementProps(componentProps, params, subSlot(slot, 'rp'));

	if (params.enabled === false) {
		return null;
	}

	const state = params.state ?? (EMPTY_OBJECT as State);
	return evaluateRenderProp(element, renderProp, outProps, state);
}

function useRenderElementProps<State extends Record<string, any>>(
	componentProps: UseRenderElementComponentProps<State>,
	params: UseRenderElementParameters<State>,
	slot: symbol | undefined,
): Record<string, any> {
	const { className: classNameProp, style: styleProp, render: renderProp } = componentProps;
	const {
		state = EMPTY_OBJECT as State,
		ref,
		props,
		stateAttributesMapping,
		enabled = true,
	} = params;

	const className = enabled ? resolveClassName(classNameProp, state) : undefined;
	const style = enabled ? resolveStyle(styleProp, state) : undefined;
	const stateProps = enabled
		? getStateAttributesProps(state, stateAttributesMapping)
		: EMPTY_OBJECT;

	const resolvedProps = enabled && props ? resolveRenderFunctionProps(props) : undefined;

	// When enabled, always a FRESH mutable object (never the shared EMPTY_OBJECT — we set
	// ref/className/style below). Matches Base UI's `?? {}`.
	const outProps: Record<string, any> = enabled
		? (mergeObjects(stateProps, resolvedProps) ?? {})
		: EMPTY_OBJECT;

	// Compose the intrinsic-prop ref, the render-element's own ref, and the forwarded
	// ref into one. octane has no rules of hooks, so this is unconditional; the
	// composed-refs hook is memoized under its own sub-slot.
	const renderRef = getElementRef(renderProp);
	const refs = Array.isArray(ref)
		? [outProps.ref, renderRef, ...ref]
		: [outProps.ref, renderRef, ref];
	outProps.ref = useComposedRefs(...refs, subSlot(slot, 'refs'));

	if (!enabled) {
		return EMPTY_OBJECT;
	}

	if (className !== undefined) {
		outProps.className = mergeClassNames(outProps.className, className);
	}
	if (style !== undefined) {
		outProps.style = mergeObjects(outProps.style, style);
	}

	return outProps;
}

function evaluateRenderProp<State>(
	element: string | undefined,
	render: RenderProp<State> | undefined,
	props: Record<string, any>,
	state: State,
): any {
	if (render) {
		if (typeof render === 'function') {
			return render(props, state);
		}
		// Element descriptor: merge the behavior props UNDER the element's own props
		// (external wins), thread the composed ref, and clone.
		const mergedProps = mergeProps(props, (render as any).props);
		mergedProps.ref = props.ref;
		return cloneElement(render, mergedProps);
	}
	if (element) {
		return renderTag(element, props);
	}
	throw new Error('Base UI: render element or function are not defined.');
}

// A single (non-array) `props` goes through `mergeProps(undefined, props)` so its event
// handlers are wrapped (preventable) like an array's would be via `mergePropsN`.
function resolveRenderFunctionProps(
	props: NonNullable<UseRenderElementParameters<any>['props']>,
): Record<string, any> {
	if (Array.isArray(props)) {
		return mergePropsN(props);
	}
	return mergeProps(undefined, props);
}

function renderTag(tag: string, props: Record<string, any>): any {
	if (tag === 'button') {
		return createElement('button', { type: 'button', ...props });
	}
	if (tag === 'img') {
		return createElement('img', { alt: '', ...props });
	}
	return createElement(tag, props);
}
