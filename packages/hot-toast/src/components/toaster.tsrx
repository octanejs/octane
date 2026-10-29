// Ported from react-hot-toast@2.6.1 src/components/toaster.tsx
// (https://github.com/timolins/react-hot-toast/tree/v2.6.1).
//
// Octane adaptations: hooks and style types come from octane, the toast list is
// a keyed @for block, and the template carries the published build's collapsed
// whitespace (see styled.tsrx).
//
// OCTANE DIVERGENCE[goober-pragma][conformance:hot-toast-goober-pragma]: upstream
// calls goober's setup(React.createElement) here. The port renders its own
// elements (see styled.tsrx) and never calls setup().
import { css } from '../goober.js';
import { type CSSProperties, useCallback } from 'octane';
import {
	type ToasterProps,
	type ToastPosition,
	type ToastWrapperProps,
	resolveValue,
} from '../core/types';
import { useToaster } from '../core/use-toaster';
import { prefersReducedMotion } from '../core/utils';
import { ToastBar } from './toast-bar.tsrx';

function ToastWrapper(props: ToastWrapperProps) @{
	const { id, className, style, onHeightUpdate, children } = props;
	const ref = useCallback(
		(el: HTMLElement | null) => {
			if (el) {
				const updateHeight = () => {
					const height = el.getBoundingClientRect().height;
					onHeightUpdate(id, height);
				};
				updateHeight();
				new MutationObserver(updateHeight).observe(el, {
					subtree: true,
					childList: true,
					characterData: true,
				});
			}
		},
		[id, onHeightUpdate],
	);

	<div ref={ref} className={className} style={style}>
		{children}
	</div>
}

const getPositionStyle = (position: ToastPosition, offset: number): CSSProperties => {
	const top = position.includes('top');
	const verticalStyle: CSSProperties = top ? { top: 0 } : { bottom: 0 };
	const horizontalStyle: CSSProperties = position.includes('center')
		? {
				justifyContent: 'center',
			}
		: position.includes('right')
			? {
					justifyContent: 'flex-end',
				}
			: {};
	return {
		left: 0,
		right: 0,
		display: 'flex',
		position: 'absolute',
		transition: prefersReducedMotion() ? undefined : `all 230ms cubic-bezier(.21,1.02,.73,1)`,
		transform: `translateY(${offset * (top ? 1 : -1)}px)`,
		...verticalStyle,
		...horizontalStyle,
	};
};

// Prettier formats `css` templates; goober hashes the published text verbatim.
// prettier-ignore
const activeClass = css` z-index: 9999; > * { pointer-events: auto; } `;

const DEFAULT_OFFSET = 16;

export function Toaster(props: ToasterProps) @{
	const {
		reverseOrder,
		position = 'top-center',
		toastOptions,
		gutter,
		children,
		toasterId,
		containerStyle,
		containerClassName,
	} = props;
	const { toasts, handlers } = useToaster(toastOptions, toasterId);

	// OCTANE DIVERGENCE[native-mouseenter][conformance:hot-toast-native-pause]: the
	// pause handlers are native mouseenter/mouseleave listeners, which a pointer
	// entering any toast dispatches on this container.
	<div
		data-rht-toaster={toasterId || ''}
		style={{
			position: 'fixed',
			zIndex: 9999,
			top: DEFAULT_OFFSET,
			left: DEFAULT_OFFSET,
			right: DEFAULT_OFFSET,
			bottom: DEFAULT_OFFSET,
			pointerEvents: 'none',
			...containerStyle,
		}}
		className={containerClassName}
		onMouseEnter={handlers.startPause}
		onMouseLeave={handlers.endPause}
	>
		@for (const t of toasts; key t.id) {
			const toastPosition = t.position || position;
			const offset = handlers.calculateOffset(t, {
				reverseOrder,
				gutter,
				defaultPosition: position,
			});
			const positionStyle = getPositionStyle(toastPosition, offset);

			<ToastWrapper
				id={t.id}
				onHeightUpdate={handlers.updateHeight}
				className={t.visible ? activeClass : ''}
				style={positionStyle}
			>
				@if (t.type === 'custom') {
					<>{resolveValue(t.message, t)}</>
				} @else if (children) {
					<>{children(t)}</>
				} @else {
					<ToastBar toast={t} position={toastPosition} />
				}
			</ToastWrapper>
		}
	</div>
}
