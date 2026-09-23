import { createContext, memo, useContext, useMemo } from 'octane';

// useMemo routes production client builds through the whole-module memo printer.
const ScaleContext = createContext(2);
export const MemoRow = memo(function Row() {
	return null;
});

export function useScaled(value: number) {
	const scale = useContext(ScaleContext);
	return useMemo(() => value * scale);
}

export function quintuple(value: number): number {
	return value * 5;
}
