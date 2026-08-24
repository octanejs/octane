// Adapted from recharts@3.9.2, commit b3451050c027a23957ffa50a2665c9119df21e47.
import { createContext } from 'octane';

export interface BrushStartEndIndex {
	startIndex: number;
	endIndex: number;
}

export type OnBrushUpdate = (newState: BrushStartEndIndex) => void;

export const BrushUpdateDispatchContext = createContext<OnBrushUpdate>(() => {});
