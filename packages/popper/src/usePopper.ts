import type { VirtualElement } from '@popperjs/core';
import type { UsePopperOptions, UsePopperResult } from './types';
import { usePopperImpl } from './usePopper.tsrx';

export function usePopper<Modifiers = string>(
	referenceElement?: Element | VirtualElement | null,
	popperElement?: HTMLElement | null,
	options?: UsePopperOptions<Modifiers>,
): UsePopperResult;
export function usePopper<Modifiers = string>(...runtimeArgs: unknown[]): UsePopperResult {
	// The compiler appends a call-site Symbol to custom-hook calls. Strip it in
	// this plain-TypeScript boundary before optional arguments are interpreted;
	// the surrounding withSlot scope remains active for the compiled hook body.
	const tail = runtimeArgs[runtimeArgs.length - 1];
	const userArgs = typeof tail === 'symbol' ? runtimeArgs.slice(0, -1) : runtimeArgs;
	const [referenceElement, popperElement, options] = userArgs as [
		Element | VirtualElement | null | undefined,
		HTMLElement | null | undefined,
		UsePopperOptions<Modifiers> | undefined,
	];
	return usePopperImpl(referenceElement, popperElement, options ?? {});
}
