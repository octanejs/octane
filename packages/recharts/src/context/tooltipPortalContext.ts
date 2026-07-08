// Port of context/tooltipPortalContext.ts.
import { createContext, useContext } from 'octane';

export const TooltipPortalContext = createContext<HTMLElement | null>(null);
export const useTooltipPortal = () => useContext(TooltipPortalContext);
