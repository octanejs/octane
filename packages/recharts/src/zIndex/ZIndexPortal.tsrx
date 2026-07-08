// Port of zIndex/ZIndexPortal.tsx — SVG cannot use CSS z-index, so recharts
// renders one <g> per registered zIndex (negatives before the default layer,
// positives after) and ZIndexLayer portals content into them.
import { useLayoutEffect, useRef } from 'octane';
import { useAppDispatch, useAppSelector } from '../state/hooks';
import { registerZIndexPortalElement, unregisterZIndexPortalElement } from '../state/zIndexSlice';
import { selectAllRegisteredZIndexes } from './zIndexSelectors';

function ZIndexSvgPortal(props) {
	const { zIndex, isPanorama } = props;
	const ref = useRef(null);
	const dispatch = useAppDispatch();
	useLayoutEffect(() => {
		if (ref.current) {
			dispatch(registerZIndexPortalElement({ zIndex, element: ref.current, isPanorama }));
		}
		return () => {
			dispatch(unregisterZIndexPortalElement({ zIndex, isPanorama }));
		};
	}, [dispatch, zIndex, isPanorama]);
	// these g elements should not be tabbable
	return <g tabIndex={-1} ref={ref} className={'recharts-zIndex-layer_' + zIndex}></g>;
}

export function AllZIndexPortals(props) @{
	const { children, isPanorama } = props;
	const allRegisteredZIndexes = useAppSelector(selectAllRegisteredZIndexes);
	if (!allRegisteredZIndexes || allRegisteredZIndexes.length === 0) {
		return children;
	}
	const allNegativeZIndexes = allRegisteredZIndexes.filter((zIndex) => zIndex < 0);
	// We exclude zero on purpose - that is the default layer, and it doesn't need a portal.
	const allPositiveZIndexes = allRegisteredZIndexes.filter((zIndex) => zIndex > 0);
	<>
		@for (const zIndex of allNegativeZIndexes; key zIndex) {
			<ZIndexSvgPortal zIndex={zIndex} isPanorama={isPanorama} />
		}
		{children}
		@for (const zIndex of allPositiveZIndexes; key zIndex) {
			<ZIndexSvgPortal zIndex={zIndex} isPanorama={isPanorama} />
		}
	</>
}
