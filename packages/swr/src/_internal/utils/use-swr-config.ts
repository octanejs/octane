import { useContext, useMemo } from 'octane';
import { defaultConfig } from './config.js';
import { SWRConfigContext } from './config-context.js';
import { mergeObjects } from './shared.js';
import type { FullConfiguration } from '../types.js';

export const useSWRConfig = (): FullConfiguration => {
	const parentConfig = useContext(SWRConfigContext);
	return useMemo(() => mergeObjects(defaultConfig, parentConfig), [parentConfig]);
};
