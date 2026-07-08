// Port of context/PanoramaContext.ts. A "panorama" chart is the mini-chart
// preview inside <Brush> — it renders WITHOUT its own store provider and
// inherits the parent chart's store.
import { createContext, useContext } from 'octane';

export const PanoramaContext = createContext<boolean | null>(null);

export function useIsPanorama(): boolean {
	return useContext(PanoramaContext) != null;
}
