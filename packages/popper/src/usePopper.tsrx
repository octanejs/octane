import { createPopper as defaultCreatePopper } from '@popperjs/core';
import type { Modifier as CoreModifier, Options } from '@popperjs/core';
import { flushSync, useLayoutEffect, useMemo, useRef, useState } from 'octane';
import isEqual from 'react-fast-compare';
import type { UsePopperOptions, UsePopperResult } from './types';

const EMPTY_MODIFIERS: ReadonlyArray<never> = [];

export function usePopperImpl<Modifiers = string>(
	referenceElement?: Element | import('@popperjs/core').VirtualElement | null,
	popperElement?: HTMLElement | null,
	options: UsePopperOptions<Modifiers> = {},
): UsePopperResult {
	const previousOptions = useRef<Partial<Options> | null>(null);
	const instanceRef = useRef<import('@popperjs/core').Instance | null>(null);
	const [renderState, setRenderState] = useState<{
		styles: UsePopperResult['styles'];
		attributes: UsePopperResult['attributes'];
	}>({
		styles: {
			popper: { position: options.strategy ?? 'absolute', left: '0', top: '0' },
			arrow: { position: 'absolute' },
		},
		attributes: {},
	});

	const onFirstUpdate = options.onFirstUpdate;
	const placement = options.placement ?? 'bottom';
	const strategy = options.strategy ?? 'absolute';
	const modifiers = options.modifiers ?? EMPTY_MODIFIERS;
	const createPopper = options.createPopper ?? defaultCreatePopper;

	const updateStateModifier = useMemo<CoreModifier<'updateState', Record<string, never>>>(
		() => ({
			name: 'updateState',
			enabled: true,
			phase: 'write',
			fn: ({ state }) => {
				const elements = Object.keys(state.elements);
				flushSync(() => {
					setRenderState({
						styles: Object.fromEntries(
							elements.map((element) => [element, state.styles[element] ?? {}]),
						) as UsePopperResult['styles'],
						attributes: Object.fromEntries(
							elements.map((element) => [element, state.attributes[element]]),
						) as UsePopperResult['attributes'],
					});
				});
			},
			requires: ['computeStyles'],
		}),
		[],
	);

	const popperOptions = useMemo<Partial<Options>>(() => {
		const nextOptions: Partial<Options> = {
			onFirstUpdate,
			placement,
			strategy,
			modifiers: [
				...modifiers as ReadonlyArray<CoreModifier<any, any>>,
				updateStateModifier,
				{ name: 'applyStyles', enabled: false },
			],
		};
		if (isEqual(previousOptions.current, nextOptions)) {
			return previousOptions.current ?? nextOptions;
		}
		previousOptions.current = nextOptions;
		return nextOptions;
	}, [onFirstUpdate, placement, strategy, modifiers, updateStateModifier]);

	useLayoutEffect(() => {
		instanceRef.current?.setOptions(popperOptions);
	}, [popperOptions]);

	useLayoutEffect(() => {
		if (referenceElement == null || popperElement == null) return;
		const instance = createPopper(referenceElement, popperElement, popperOptions);
		instanceRef.current = instance;
		return () => {
			instance.destroy();
			if (instanceRef.current === instance) instanceRef.current = null;
		};
	}, [referenceElement, popperElement, createPopper]);

	return {
		state: instanceRef.current?.state ?? null,
		styles: renderState.styles,
		attributes: renderState.attributes,
		update: instanceRef.current?.update ?? null,
		forceUpdate: instanceRef.current?.forceUpdate ?? null,
	};
}
