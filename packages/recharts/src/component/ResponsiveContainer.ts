// PARTIAL port of component/ResponsiveContainer.tsx — Phase 1 needs only the
// CONTEXT surface (chartLayoutContext's ReportChartSize prefers container-
// measured dimensions when present). The ResizeObserver-driven container
// component itself is a Phase 2 port (measurement + interaction phase).
import { createContext, useContext } from 'octane';

export interface ResponsiveContainerDimensions {
	width: number;
	height: number;
}

const initialDimension: ResponsiveContainerDimensions = { width: -1, height: -1 };

// Upstream defaults the context VALUE to the {-1,-1} dimension object (always
// truthy); consumers gate on `.width > 0`. Mirror that exactly.
const ResponsiveContainerContext = createContext<ResponsiveContainerDimensions>(initialDimension);

export const ResponsiveContainerContextProviderInternal = ResponsiveContainerContext.Provider;

export const useResponsiveContainerContext = () => useContext(ResponsiveContainerContext);

export { initialDimension as defaultResponsiveContainerDimension };
