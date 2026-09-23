import { createContext, useContext } from 'octane';

const RouterContext = createContext({ isNative: true });

export function useRouter() {
	return useContext(RouterContext);
}

export function triple(value: number): number {
	return value * 3;
}
