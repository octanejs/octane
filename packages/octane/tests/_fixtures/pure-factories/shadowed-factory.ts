import { createContext, useContext } from 'octane';

const LabelContext = createContext('label');

export function useLabel() {
	return useContext(LabelContext);
}

// A local that shadows the import is ordinary code with ordinary side effects.
export function recordCalls(): string[] {
	const calls: string[] = [];
	const createContext = (value: string) => {
		calls.push(value);
		return value;
	};
	createContext('shadowed call ran');
	return calls;
}
