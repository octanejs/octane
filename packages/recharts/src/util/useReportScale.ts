// Port of util/useReportScale.ts — measures the wrapper's CSS transform scale
// (getBoundingClientRect width vs offsetWidth) and reports it to the store.
import { useEffect, useState } from 'octane';
import { useAppDispatch, useAppSelector } from '../state/hooks';
import { selectContainerScale } from '../state/selectors/containerSelectors';
import { setScale } from '../state/layoutSlice';
import { isWellBehavedNumber } from './isWellBehavedNumber';
import { splitSlot, subSlot } from '../internal';

export function useReportScale(...rest: any[]) {
	const [, slot] = splitSlot(rest);
	const dispatch = useAppDispatch();
	const [ref, setRef] = useState<HTMLElement | null>(null);
	const scale = useAppSelector(selectContainerScale, subSlot(slot, 'urs:scale'));
	useEffect(() => {
		if (ref == null) {
			return;
		}
		const rect = ref.getBoundingClientRect();
		const newScale = rect.width / ref.offsetWidth;
		if (isWellBehavedNumber(newScale) && newScale !== scale) {
			dispatch(setScale(newScale));
		}
	}, [ref, dispatch, scale]);
	return setRef;
}
