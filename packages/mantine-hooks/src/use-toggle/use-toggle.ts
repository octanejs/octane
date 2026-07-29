import { useReducer } from 'octane';
import { withoutSlot } from '../internal';

type UseToggleAction<T> = (value?: React.SetStateAction<T>) => void;
export type UseToggleReturnValue<T> = [T, UseToggleAction<T>];

export function useToggle<T = boolean>(
	options: readonly T[] = [false, true] as any,
): UseToggleReturnValue<T> {
	const normalizedOptions = withoutSlot(options) ?? ([false, true] as any);
	const [[option], toggle] = useReducer((state: T[], action: React.SetStateAction<T>) => {
		const value = action instanceof Function ? action(state[0]) : action;
		const index = Math.abs(state.indexOf(value));

		return state.slice(index).concat(state.slice(0, index));
	}, normalizedOptions as T[]);

	return [option, toggle as UseToggleAction<T>];
}

export namespace useToggle {
	export type ReturnValue<T> = UseToggleReturnValue<T>;
}
