// Port of context/legendPortalContext.ts.
import { createContext, useContext } from 'octane';

export const LegendPortalContext = createContext<HTMLElement | null>(null);
export const useLegendPortal = () => useContext(LegendPortalContext);
