// Port of zIndex/ZIndexLayer.tsx — renders children into the redux-registered
// <g> for the given zIndex via an octane portal (SVG has no CSS z-index).
// Registration is deferred-cleanup: while a zIndex changes, the old portal
// element stays alive until the new one is ready, avoiding a flash.
import { createPortal, useLayoutEffect, useRef } from 'octane';
import { useAppDispatch, useAppSelector } from '../state/hooks';
import { selectZIndexPortalElement } from './zIndexSelectors';
import { registerZIndexPortal, unregisterZIndexPortal } from '../state/zIndexSlice';
import { useIsInChartContext } from '../context/chartLayoutContext.ts';
import { useIsPanorama } from '../context/PanoramaContext.ts';

/** @since 3.4 */
export function ZIndexLayer(props) {
	const { zIndex, children } = props;
	// Outside a chart there is no zIndex portal state — render normally.
	const isInChartContext = useIsInChartContext();
	// zIndex undefined or 0 renders normally (0 is the default layer).
	const shouldRenderInPortal = isInChartContext && zIndex !== undefined && zIndex !== 0;
	const isPanorama = useIsPanorama();

	// Deferred-cleanup bookkeeping: every registered zIndex, plus the last valid
	// portal node to keep rendering into during a zIndex transition.
	const lastPortalElementRef = useRef(undefined);
	const registeredZIndexesRef = useRef(new Set());
	const dispatch = useAppDispatch();
	const portalElement = useAppSelector(
		(state) => selectZIndexPortalElement(state, zIndex, isPanorama),
	);

	useLayoutEffect(() => {
		if (!shouldRenderInPortal) {
			// Portal rendering was disabled — clean up any stale registrations.
			const registered = registeredZIndexesRef.current;
			registered.forEach((z) => {
				dispatch(unregisterZIndexPortal({ zIndex: z }));
			});
			registered.clear();
			lastPortalElementRef.current = undefined;
			return;
		}
		// Register the current zIndex (idempotent — skips if already registered).
		if (!registeredZIndexesRef.current.has(zIndex)) {
			dispatch(registerZIndexPortal({ zIndex }));
			registeredZIndexesRef.current.add(zIndex);
		}
		// When the new portal element is ready, retire old zIndex registrations.
		if (portalElement) {
			lastPortalElementRef.current = portalElement;
			const registered = registeredZIndexesRef.current;
			registered.forEach((z) => {
				if (z !== zIndex) {
					dispatch(unregisterZIndexPortal({ zIndex: z }));
					registered.delete(z);
				}
			});
		}
	}, [dispatch, zIndex, shouldRenderInPortal, portalElement]);

	// Unmount-only cleanup — unregister everything when the component is removed.
	useLayoutEffect(() => {
		const registered = registeredZIndexesRef.current;
		return () => {
			registered.forEach((z) => {
				dispatch(unregisterZIndexPortal({ zIndex: z }));
			});
			registered.clear();
		};
	}, [dispatch]);

	if (!shouldRenderInPortal) {
		return children;
	}
	// Prefer the current portal; fall back to the cached one during transitions.
	const targetElement = portalElement ?? lastPortalElementRef.current;
	if (!targetElement) {
		// Very first render — no portal has ever been registered yet.
		return null;
	}
	return createPortal(children, targetElement);
}
