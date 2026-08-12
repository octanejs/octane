import { createContext } from 'octane';

export interface TransitionGroupContextValue {
	isMounting: boolean;
}

const TransitionGroupContext = createContext<TransitionGroupContextValue | null>(null);

export default TransitionGroupContext;
