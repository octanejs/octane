// Port of state/SetTooltipEntrySettings.tsx — graphical items register their
// tooltip payload settings (panorama items never contribute).
import { useLayoutEffect, useRef } from 'octane';
import { useAppDispatch } from './hooks';
import {
	addTooltipEntrySettings,
	removeTooltipEntrySettings,
	replaceTooltipEntrySettings,
} from './tooltipSlice';
import { useIsPanorama } from '../context/PanoramaContext';

export function SetTooltipEntrySettings(props: { tooltipEntrySettings: unknown }): null {
	const { tooltipEntrySettings } = props;
	const dispatch = useAppDispatch();
	const isPanorama = useIsPanorama();
	const prevSettingsRef = useRef<unknown>(null);
	useLayoutEffect(() => {
		if (isPanorama) {
			// Panorama graphical items should never contribute to Tooltip payload.
			return;
		}
		if (prevSettingsRef.current === null) {
			dispatch(addTooltipEntrySettings(tooltipEntrySettings));
		} else if (prevSettingsRef.current !== tooltipEntrySettings) {
			dispatch(
				replaceTooltipEntrySettings({ prev: prevSettingsRef.current, next: tooltipEntrySettings }),
			);
		}
		prevSettingsRef.current = tooltipEntrySettings;
	}, [tooltipEntrySettings, dispatch, isPanorama]);
	useLayoutEffect(() => {
		return () => {
			if (prevSettingsRef.current) {
				dispatch(removeTooltipEntrySettings(prevSettingsRef.current));
				prevSettingsRef.current = null;
			}
		};
	}, [dispatch]);
	return null;
}
