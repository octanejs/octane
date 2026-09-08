// Adapted from recharts@3.9.2, commit b3451050c027a23957ffa50a2665c9119df21e47.
import { useAppSelector } from '../state/hooks';

export const useAccessibilityLayer: () => boolean = () =>
	useAppSelector((state) => state.rootProps.accessibilityLayer) ?? true;
