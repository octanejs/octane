import { createContext, useContext } from 'octane';
import type { OctaneNode } from 'octane';

export type TooltipPositionContextType = {
	isFlippedVertically: boolean;
	isFlippedHorizontally: boolean;
};

const TooltipPositionContext = createContext<TooltipPositionContextType>({
	isFlippedVertically: false,
	isFlippedHorizontally: false,
});

export const TooltipPositionProvider = TooltipPositionContext.Provider;

/**
 * Octane deliberately has no render-prop `Context.Consumer` (see
 * website/src/content/docs/differences-from-react.mdx); reading `.Consumer` returns `undefined` and
 * warns in development. Keep upstream's render-prop API by reading the context
 * with `useContext` instead.
 */
export function TooltipPositionConsumer({
	children,
}: {
	children: (value: TooltipPositionContextType) => OctaneNode;
}) {
	return <>{children(useContext(TooltipPositionContext))}</>;
}

export const useTooltipPosition = () => useContext(TooltipPositionContext);
