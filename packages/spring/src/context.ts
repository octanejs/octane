import { createContext, useContext } from 'octane';
import type { ControllerUpdate } from './engine';

export type SpringContextValue = Pick<
	ControllerUpdate<Record<string, any>>,
	'cancel' | 'config' | 'immediate' | 'pause'
>;

export const SpringContext = createContext<SpringContextValue>({});

export function useSpringContext(): SpringContextValue {
	return useContext(SpringContext);
}
