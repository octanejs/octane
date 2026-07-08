// Port of state/SetGraphicalItem.tsx — registers a graphical item's settings
// in the store on layout-effect timing (add on mount, replace on change,
// remove on unmount).
import { memo, useLayoutEffect, useRef } from 'octane';
import { useAppDispatch } from './hooks';
import {
	addCartesianGraphicalItem,
	addPolarGraphicalItem,
	removeCartesianGraphicalItem,
	removePolarGraphicalItem,
	replaceCartesianGraphicalItem,
	replacePolarGraphicalItem,
} from './graphicalItemsSlice';

const SetCartesianGraphicalItemImpl = (props: Record<string, unknown>): null => {
	const dispatch = useAppDispatch();
	const prevPropsRef = useRef<Record<string, unknown> | null>(null);
	useLayoutEffect(() => {
		if (prevPropsRef.current === null) {
			dispatch(addCartesianGraphicalItem(props));
		} else if (prevPropsRef.current !== props) {
			dispatch(replaceCartesianGraphicalItem({ prev: prevPropsRef.current, next: props }));
		}
		prevPropsRef.current = props;
	}, [dispatch, props]);
	useLayoutEffect(() => {
		return () => {
			if (prevPropsRef.current) {
				dispatch(removeCartesianGraphicalItem(prevPropsRef.current));
				prevPropsRef.current = null;
			}
		};
	}, [dispatch]);
	return null;
};

export const SetCartesianGraphicalItem = memo(SetCartesianGraphicalItemImpl);

const SetPolarGraphicalItemImpl = (props: Record<string, unknown>): null => {
	const dispatch = useAppDispatch();
	const prevPropsRef = useRef<Record<string, unknown> | null>(null);
	useLayoutEffect(() => {
		if (prevPropsRef.current === null) {
			dispatch(addPolarGraphicalItem(props));
		} else if (prevPropsRef.current !== props) {
			dispatch(replacePolarGraphicalItem({ prev: prevPropsRef.current, next: props }));
		}
		prevPropsRef.current = props;
	}, [dispatch, props]);
	useLayoutEffect(() => {
		return () => {
			if (prevPropsRef.current) {
				dispatch(removePolarGraphicalItem(prevPropsRef.current));
				prevPropsRef.current = null;
			}
		};
	}, [dispatch]);
	return null;
};

export const SetPolarGraphicalItem = memo(SetPolarGraphicalItemImpl);
