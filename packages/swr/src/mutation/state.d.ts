export { startTransition } from 'octane';
export declare const useStateWithDeps: <S = Record<string, any>>(
	initialState: S,
) => [{ current: S }, Record<keyof S, boolean>, (payload: Partial<S>) => void];
