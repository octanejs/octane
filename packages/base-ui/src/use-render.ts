// Public entry — mirrors @base-ui/react/use-render
// (.base-ui/packages/react/src/use-render/useRender.ts). Build a custom element with
// Base UI's render-prop + state→data-* + prop-merge semantics.
//
// SLOT: plain-`.ts` hook; forwards the caller's slot to useRenderElement.
import { splitSlot, S, subSlot } from './internal';
import {
	useRenderElement,
	type RenderProp,
	type UseRenderElementParameters,
} from './utils/useRenderElement';
import type { StateAttributesMapping } from './utils/getStateAttributesProps';

export interface UseRenderParameters<State extends Record<string, unknown>> {
	render?: RenderProp<State>;
	ref?: any;
	state?: State;
	stateAttributesMapping?: StateAttributesMapping<State>;
	props?: Record<string, unknown>;
	enabled?: boolean;
	defaultTagName?: string;
}

export function useRender<State extends Record<string, unknown>>(...args: any[]): any {
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('useRender');
	const params = user[0] as UseRenderParameters<State>;
	return useRenderElement(
		params.defaultTagName ?? 'div',
		params as any,
		params as UseRenderElementParameters<State>,
		subSlot(slot, 're'),
	);
}

export namespace useRender {
	export type Parameters<State extends Record<string, unknown>> = UseRenderParameters<State>;
	export type RenderProp<State = Record<string, unknown>> =
		import('./utils/useRenderElement').RenderProp<State>;
}
