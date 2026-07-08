// Port of state/ReportEventSettings.tsx.
import { memo, useEffect } from 'octane';
import { useAppDispatch } from './hooks';
import { setEventSettings } from './eventSettingsSlice';
import { propsAreEqual } from '../util/propsAreEqual';

const ReportEventSettingsImpl = (props: Record<string, unknown>): null => {
	const dispatch = useAppDispatch();
	useEffect(() => {
		dispatch(setEventSettings(props));
	}, [dispatch, props]);
	return null;
};

export const ReportEventSettings = memo(ReportEventSettingsImpl, propsAreEqual);
