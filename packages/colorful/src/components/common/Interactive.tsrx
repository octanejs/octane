import { memo, useEffect, useMemo, useRef } from 'octane';
import type { OctaneNode } from 'octane';
import { useEventCallback } from '../../hooks/useEventCallback.tsrx';
import { clamp } from '../../utils/clamp';

export interface Interaction {
	left: number;
	top: number;
}

const isTouch = (event: MouseEvent | TouchEvent): event is TouchEvent => 'touches' in event;

const getTouchPoint = (touches: TouchList, touchId: null | number): Touch => {
	for (let index = 0; index < touches.length; index++) {
		if (touches[index].identifier === touchId) return touches[index];
	}
	return touches[0];
};

const getParentWindow = (node?: HTMLDivElement | null): Window =>
	node && node.ownerDocument.defaultView || self;

const getRelativePosition = (
	node: HTMLDivElement,
	event: MouseEvent | TouchEvent,
	touchId: null | number,
): Interaction => {
	const rect = node.getBoundingClientRect();
	const pointer =
		isTouch(event) ? getTouchPoint(event.touches, touchId) : event;
	return {
		left: clamp((pointer.pageX - (rect.left + getParentWindow(node).pageXOffset)) / rect.width),
		top: clamp((pointer.pageY - (rect.top + getParentWindow(node).pageYOffset)) / rect.height),
	};
};

const preventDefaultMove = (event: MouseEvent | TouchEvent): void => {
	if (!isTouch(event)) event.preventDefault();
};

const isInvalid = (event: MouseEvent | TouchEvent, hasTouch: boolean): boolean =>
	hasTouch && !isTouch(event);

interface Props {
	onMove: (interaction: Interaction) => void;
	onKey: (offset: Interaction) => void;
	onEnd?: () => void;
	children: OctaneNode;
	'aria-label'?: string;
	'aria-valuetext'?: string;
	'aria-valuenow'?: number;
	'aria-valuemax'?: number;
	'aria-valuemin'?: number;
}

const InteractiveBase = ({
	onMove,
	onKey,
	onEnd,
	children,
	'aria-label': ariaLabel,
	'aria-valuetext': ariaValueText,
	'aria-valuenow': ariaValueNow,
	'aria-valuemax': ariaValueMax,
	'aria-valuemin': ariaValueMin,
}: Props) => {
	const container = useRef<HTMLDivElement | null>(null);
	const onMoveCallback = useEventCallback<Interaction>(onMove);
	const onKeyCallback = useEventCallback<Interaction>(onKey);
	const onEndCallback = useEventCallback<void>(onEnd);
	const touchId = useRef<null | number>(null);
	const hasTouch = useRef(false);

	const [handleMoveStart, handleKeyDown, handleKeyUp, toggleDocumentEvents] = useMemo(() => {
		const handleMove = (event: MouseEvent | TouchEvent) => {
			preventDefaultMove(event);
			const isDown = isTouch(event) ? event.touches.length > 0 : event.buttons > 0;
			if (isDown && container.current) {
				onMoveCallback(getRelativePosition(container.current, event, touchId.current));
			} else {
				toggleDocumentEvents(false);
				onEndCallback();
			}
		};

		const handleMoveEnd = () => {
			toggleDocumentEvents(false);
			onEndCallback();
		};

		function toggleDocumentEvents(state?: boolean) {
			const touch = hasTouch.current;
			const parentWindow = getParentWindow(container.current);
			const toggleEvent = state ? parentWindow.addEventListener : parentWindow.removeEventListener;
			toggleEvent.call(
				parentWindow,
				touch ? 'touchmove' : 'mousemove',
				handleMove as EventListener,
			);
			toggleEvent.call(
				parentWindow,
				touch ? 'touchend' : 'mouseup',
				handleMoveEnd as EventListener,
			);
		}

		const handleMoveStart = (nativeEvent: MouseEvent | TouchEvent) => {
			const element = container.current;
			if (!element) return;
			preventDefaultMove(nativeEvent);
			if (isInvalid(nativeEvent, hasTouch.current)) return;
			if (isTouch(nativeEvent)) {
				hasTouch.current = true;
				const changedTouches = nativeEvent.changedTouches || [];
				if (changedTouches.length) touchId.current = changedTouches[0].identifier;
			}
			element.focus();
			onMoveCallback(getRelativePosition(element, nativeEvent, touchId.current));
			toggleDocumentEvents(true);
		};

		const handleKeyDown = (event: KeyboardEvent) => {
			const keyCode = event.which || event.keyCode;
			if (keyCode < 37 || keyCode > 40) return;
			event.preventDefault();
			onKeyCallback({
				left: keyCode === 39
					? 0.05
					: keyCode === 37
						? -0.05
						: 0,
				top: keyCode === 40
					? 0.05
					: keyCode === 38
						? -0.05
						: 0,
			});
		};

		const handleKeyUp = (event: KeyboardEvent) => {
			const keyCode = event.which || event.keyCode;
			if (keyCode >= 37 && keyCode <= 40) onEndCallback();
		};

		return [handleMoveStart, handleKeyDown, handleKeyUp, toggleDocumentEvents] as const;
	}, [onKeyCallback, onMoveCallback, onEndCallback]);

	useEffect(() => toggleDocumentEvents, [toggleDocumentEvents]);

	return <div
		aria-label={ariaLabel}
		aria-valuetext={ariaValueText}
		aria-valuenow={ariaValueNow}
		aria-valuemax={ariaValueMax}
		aria-valuemin={ariaValueMin}
		onTouchStart={handleMoveStart}
		onMouseDown={handleMoveStart}
		class="react-colorful__interactive"
		ref={container}
		onKeyDown={handleKeyDown}
		onKeyUp={handleKeyUp}
		tabIndex={0}
		role="slider"
	>{children}</div>;
};

export const Interactive = memo(InteractiveBase);
