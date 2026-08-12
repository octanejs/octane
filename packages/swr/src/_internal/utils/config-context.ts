'use client';

import { createContext, createElement, useContext, useMemo, useRef } from 'octane';
import { cache as defaultCache } from './config.js';
import { initCache } from './cache.js';
import { mergeConfigs } from './merge-config.js';
import { UNDEFINED, mergeObjects, isFunction } from './shared.js';
import { useIsomorphicLayoutEffect } from './env.js';
import type { SWRConfiguration, FullConfiguration } from '../types.js';

export const SWRConfigContext = createContext<Partial<FullConfiguration>>({});
const SWR_CONFIG_CACHE_EFFECT_SLOT = Symbol.for('@octanejs/swr:config-cache-effect');

export interface SWRConfigProps {
	children?: unknown;
	value?: SWRConfiguration | ((parentConfig?: SWRConfiguration) => SWRConfiguration);
}

const SWRConfig = (props: SWRConfigProps) => {
	const { value } = props;
	const parentConfig = useContext(SWRConfigContext);
	const isFunctionalConfig = isFunction(value);
	const config = useMemo(
		() => (isFunctionalConfig ? value(parentConfig) : value),
		[isFunctionalConfig, parentConfig, value],
	);
	const extendedConfig = useMemo(
		() => (isFunctionalConfig ? config : mergeConfigs(parentConfig, config)),
		[isFunctionalConfig, parentConfig, config],
	);
	const provider = config && config.provider;
	const cacheContextRef = useRef<ReturnType<typeof initCache>>(UNDEFINED);
	if (provider && !cacheContextRef.current) {
		cacheContextRef.current = initCache(
			provider((extendedConfig as FullConfiguration).cache || defaultCache),
			config,
		);
	}
	const cacheContext = cacheContextRef.current;

	if (cacheContext) {
		(extendedConfig as FullConfiguration).cache = cacheContext[0];
		(extendedConfig as FullConfiguration).mutate = cacheContext[1];
	}

	useIsomorphicLayoutEffect(
		() => {
			if (cacheContext) {
				cacheContext[2]?.();
				return cacheContext[3];
			}
		},
		[],
		SWR_CONFIG_CACHE_EFFECT_SLOT,
	);

	return createElement(
		SWRConfigContext.Provider,
		mergeObjects(props, { value: extendedConfig }) as never,
	);
};

export default SWRConfig;
