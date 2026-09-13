/** @jsxImportSource octane */
import { useEffect, useState } from 'octane';
import {
	FADE_DURATION_MS,
	FROZEN_GLOW_COLOR,
	FROZEN_GLOW_EDGE_PX,
	Z_INDEX_OVERLAY_CANVAS,
} from '../constants.js';
import { getScopeContainer } from '../utils/runtime-mode.js';

interface FrozenGlowProps {
	visible: boolean;
}

export const FrozenGlow = (props: FrozenGlowProps) => {
	const scopeContainer = getScopeContainer();
	const scopeBorderRadius = scopeContainer ? getComputedStyle(scopeContainer).borderRadius : '0px';

	const measureRect = () => scopeContainer?.getBoundingClientRect() ?? null;
	const [scopeRect, setScopeRect] = useState(measureRect());

	useEffect(() => {
		if (!scopeContainer) return;
		const handleViewportChange = () => setScopeRect(measureRect());
		const resizeObserver = new ResizeObserver(handleViewportChange);
		resizeObserver.observe(scopeContainer);
		window.addEventListener('scroll', handleViewportChange, { capture: true, passive: true });
		window.addEventListener('resize', handleViewportChange);
		return () => {
			resizeObserver.disconnect();
			window.removeEventListener('scroll', handleViewportChange, { capture: true });
			window.removeEventListener('resize', handleViewportChange);
		};
	}, []);

	useEffect(() => {
		if (props.visible && scopeContainer) {
			setScopeRect(measureRect());
		}
	}, [props.visible]);

	const top = scopeRect ? `${scopeRect.top}px` : '0';
	const left = scopeRect ? `${scopeRect.left}px` : '0';
	const width = scopeRect ? `${scopeRect.width}px` : '100%';
	const height = scopeRect ? `${scopeRect.height}px` : '100%';

	return (
		<div
			style={{
				position: 'fixed',
				top,
				left,
				width,
				height,
				borderRadius: scopeBorderRadius,
				pointerEvents: 'none',
				zIndex: Z_INDEX_OVERLAY_CANVAS,
				opacity: props.visible ? 1 : 0,
				transition: `opacity ${FADE_DURATION_MS}ms ease-out`,
				willChange: 'opacity',
				contain: 'strict',
				transform: 'translateZ(0)',
				boxShadow: `inset 0 0 ${FROZEN_GLOW_EDGE_PX}px ${FROZEN_GLOW_COLOR}`,
			}}
		/>
	);
};
