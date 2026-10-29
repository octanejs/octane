import { ContextType, useContext } from 'octane';
import { PublicContext } from '../store';

export function useDndContext() {
	return useContext(PublicContext);
}

export type UseDndContextReturnValue = ContextType<typeof PublicContext>;
