// Ported from @radix-ui/react-direction (source:
// .radix-primitives/packages/react/direction/src/direction.tsx). Global reading-direction
// context with a per-call local override.
import { createContext, createElement, useContext } from 'octane';

type Direction = 'ltr' | 'rtl';
const DirectionContext = createContext<Direction | undefined>(undefined);

export function DirectionProvider(props: { dir: Direction; children?: any }): any {
	const { dir, children } = props;
	return createElement(DirectionContext.Provider, { value: dir, children });
}

export function useDirection(localDir?: Direction): Direction {
	const globalDir = useContext(DirectionContext);
	return localDir || globalDir || 'ltr';
}

export { DirectionProvider as Provider };
