// Ported from @floating-ui/react FloatingOverlay — a fixed <div> overlay with an
// optional body scroll-lock. A `.ts` component (createElement, ref-as-prop). React
// forwardRef → `props.ref`.
import { createElement } from 'octane';
import type { OctaneNode } from 'octane';

import { S } from './internal';
import { getPlatform, useModernLayoutEffect, type CSSProperties } from './utils';
import type { HTMLProps, MutableRefObject, RefCallback } from './types';

const scrollbarProperty = '--floating-ui-scrollbar-width';
let lockCount = 0;
let cleanup = () => {};

function enableScrollLock() {
	const platform = getPlatform();
	const isIOS =
		/iP(hone|ad|od)|iOS/.test(platform) ||
		(platform === 'MacIntel' && navigator.maxTouchPoints > 1);
	const bodyStyle = document.body.style as any;
	const scrollbarX =
		Math.round(document.documentElement.getBoundingClientRect().left) +
		document.documentElement.scrollLeft;
	const paddingProp = scrollbarX ? 'paddingLeft' : 'paddingRight';
	const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
	const scrollX = bodyStyle.left ? parseFloat(bodyStyle.left) : window.scrollX;
	const scrollY = bodyStyle.top ? parseFloat(bodyStyle.top) : window.scrollY;
	bodyStyle.overflow = 'hidden';
	bodyStyle.setProperty(scrollbarProperty, scrollbarWidth + 'px');
	if (scrollbarWidth) {
		bodyStyle[paddingProp] = scrollbarWidth + 'px';
	}
	if (isIOS) {
		const offsetLeft = window.visualViewport?.offsetLeft || 0;
		const offsetTop = window.visualViewport?.offsetTop || 0;
		Object.assign(bodyStyle, {
			position: 'fixed',
			top: -(scrollY - Math.floor(offsetTop)) + 'px',
			left: -(scrollX - Math.floor(offsetLeft)) + 'px',
			right: '0',
		});
	}
	return () => {
		Object.assign(bodyStyle, { overflow: '', [paddingProp]: '' });
		bodyStyle.removeProperty(scrollbarProperty);
		if (isIOS) {
			Object.assign(bodyStyle, { position: '', top: '', left: '', right: '' });
			window.scrollTo(scrollX, scrollY);
		}
	};
}

export interface FloatingOverlayProps {
	/**
	 * Whether the overlay should lock scrolling on the document body.
	 * @default false
	 */
	lockScroll?: boolean;
}

/**
 * Provides base styling for a fixed overlay element to dim content or block
 * pointer events behind a floating element.
 * @see https://floating-ui.com/docs/FloatingOverlay
 */
export function FloatingOverlay(
	props: FloatingOverlayProps &
		HTMLProps<HTMLDivElement> & {
			// Ref-as-prop (octane has no forwardRef); the overlay's own styles merge
			// over the OBJECT form of `style`.
			ref?: MutableRefObject<HTMLDivElement | null> | RefCallback<HTMLDivElement> | null;
			style?: CSSProperties;
		},
): OctaneNode {
	const { lockScroll = false, ref, ...rest } = props;

	useModernLayoutEffect(
		() => {
			if (!lockScroll) return;
			lockCount++;
			if (lockCount === 1) {
				cleanup = enableScrollLock();
			}
			return () => {
				lockCount--;
				if (lockCount === 0) {
					cleanup();
				}
			};
		},
		[lockScroll],
		S('FloatingOverlay:lock'),
	);

	return createElement('div', {
		ref,
		...rest,
		style: {
			position: 'fixed',
			overflow: 'auto',
			top: 0,
			right: 0,
			bottom: 0,
			left: 0,
			...(rest.style as CSSProperties | undefined),
		},
	});
}
