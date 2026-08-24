import { type OctaneNode, useEffect, useRef, useState } from 'octane';
import type { Octane } from 'octane/jsx-runtime';

import type { Crop, Ords, PercentCrop, PixelCrop, XYOrds } from './types';
import {
	areCropsEqual,
	clamp,
	cls,
	containCrop,
	convertToPercentCrop,
	convertToPixelCrop,
	defaultCrop,
	nudgeCrop,
} from './utils';

import './ReactCrop.css';

interface EVData {
	startClientX: number;
	startClientY: number;
	startCropX: number;
	startCropY: number;
	clientX: number;
	clientY: number;
	isResize: boolean;
	ord?: Ords;
}

interface Rectangle {
	x: number;
	y: number;
	width: number;
	height: number;
}

type CSSProperties = Exclude<NonNullable<Octane.HTMLAttributes<Element>['style']>, string>;

const DOC_MOVE_OPTS = { capture: true, passive: false };
let instanceCount = 0;

const DEFAULT_ARIA_LABELS = {
	cropArea: 'Use the arrow keys to move the crop selection area',
	nwDragHandle: 'Use the arrow keys to move the north west drag handle to change the crop selection area',
	nDragHandle: 'Use the up and down arrow keys to move the north drag handle to change the crop selection area',
	neDragHandle: 'Use the arrow keys to move the north east drag handle to change the crop selection area',
	eDragHandle: 'Use the up and down arrow keys to move the east drag handle to change the crop selection area',
	seDragHandle: 'Use the arrow keys to move the south east drag handle to change the crop selection area',
	sDragHandle: 'Use the up and down arrow keys to move the south drag handle to change the crop selection area',
	swDragHandle: 'Use the arrow keys to move the south west drag handle to change the crop selection area',
	wDragHandle: 'Use the up and down arrow keys to move the west drag handle to change the crop selection area',
};

export interface ReactCropProps {
	/** An object of labels to override the built-in English ones */
	ariaLabels?: {
		cropArea: string;
		nwDragHandle: string;
		nDragHandle: string;
		neDragHandle: string;
		eDragHandle: string;
		seDragHandle: string;
		sDragHandle: string;
		swDragHandle: string;
		wDragHandle: string;
	};
	/** The aspect ratio of the crop, e.g. `1` for a square or `16 / 9` for landscape. */
	aspect?: number;
	/** Classes to pass to the `ReactCrop` element. */
	className?: string;
	/** The elements that you want to perform a crop on. For example
 * an image or video. */
	children?: OctaneNode;
	/** Show the crop area as a circle. If your aspect is not 1 (a square) then the circle will be warped into an oval shape. Defaults to false. */
	circularCrop?: boolean;
	/** Since v10 all crop params are required except for aspect. Omit the entire crop object if you don't want a crop. See README on how to create an aspect crop with a % crop. */
	crop?: Crop;
	/** If true then the user cannot resize or draw a new crop. A class of `ReactCrop--disabled` is also added to the container for user styling. */
	disabled?: boolean;
	/** If true then the user cannot create or resize a crop, but can still drag the existing crop around. A class of `ReactCrop--locked` is also added to the container for user styling. */
	locked?: boolean;
	/** If true is passed then selection can't be disabled if the user clicks outside the selection area. */
	keepSelection?: boolean;
	/** A minimum crop width, in pixels. */
	minWidth?: number;
	/** A minimum crop height, in pixels. */
	minHeight?: number;
	/** A maximum crop width, in pixels. */
	maxWidth?: number;
	/** A maximum crop height, in pixels. */
	maxHeight?: number;
	/** A callback which happens for every change of the crop. You should set the crop to state and pass it back into the library via the `crop` prop. */
	onChange: (crop: PixelCrop, percentageCrop: PercentCrop) => void;
	/** A callback which happens after a resize, drag, or nudge. Passes the current crop state object in pixels and percent. */
	onComplete?: (crop: PixelCrop, percentageCrop: PercentCrop) => void;
	/** A callback which happens when a user starts dragging or resizing. It is convenient to manipulate elements outside this component. */
	onDragStart?: (event: PointerEvent) => void;
	/** A callback which happens when a user releases the cursor or touch after dragging or resizing. */
	onDragEnd?: (event: PointerEvent) => void;
	/** Render a custom element in crop selection. */
	renderSelectionAddon?: (state: ReactCropState) => OctaneNode;
	/** Show rule of thirds lines in the cropped area. Defaults to false. */
	ruleOfThirds?: boolean;
	/** Inline styles object to be passed to the `ReactCrop` element. */
	style?: CSSProperties;
}

export interface ReactCropState {
	cropIsActive: boolean;
	newCropIsBeingDrawn: boolean;
}

export function ReactCrop(props: ReactCropProps): OctaneNode {
	const propsRef = useRef(props);
	propsRef.current = props;

	const docMoveBoundRef = useRef(false);
	const mouseDownOnCropRef = useRef(false);
	const dragStartedRef = useRef(false);
	const evDataRef = useRef<EVData>({
		startClientX: 0,
		startClientY: 0,
		startCropX: 0,
		startCropY: 0,
		clientX: 0,
		clientY: 0,
		isResize: true,
	});
	const componentRef = useRef<HTMLDivElement | null>(null);
	const mediaRef = useRef<HTMLDivElement | null>(null);
	const resizeObserverRef = useRef<ResizeObserver | undefined>(undefined);
	const initChangeCalledRef = useRef(false);
	const instanceIdRef = useRef<string | null>(null);
	const previousCropRef = useRef<Crop | undefined>(props.crop);
	const docListenersRef = useRef<
		| {
				move: (event: PointerEvent) => void;
				done: (event: PointerEvent) => void;
		  }
		| null
	>(null);

	if (instanceIdRef.current === null) {
		instanceIdRef.current = `rc-${instanceCount++}`;
	}

	const [cropIsActive, setCropIsActive] = useState(false);
	const [newCropIsBeingDrawn, setNewCropIsBeingDrawn] = useState(false);

	// We unfortunately get the bounding box every time as x+y changes
	// due to scrolling.
	function getBox(): Rectangle {
		const element = mediaRef.current;
		if (!element) {
			return { x: 0, y: 0, width: 0, height: 0 };
		}
		const { x, y, width, height } = element.getBoundingClientRect();
		return { x, y, width, height };
	}

	function bindDocMove(): void {
		if (docMoveBoundRef.current) {
			return;
		}

		const listeners = {
			move: onDocPointerMove,
			done: onDocPointerDone,
		};
		docListenersRef.current = listeners;

		document.addEventListener('pointermove', listeners.move, DOC_MOVE_OPTS);
		document.addEventListener('pointerup', listeners.done, DOC_MOVE_OPTS);
		document.addEventListener('pointercancel', listeners.done, DOC_MOVE_OPTS);

		docMoveBoundRef.current = true;
	}

	function unbindDocMove(): void {
		if (!docMoveBoundRef.current) {
			return;
		}

		const listeners = docListenersRef.current;
		if (listeners) {
			document.removeEventListener('pointermove', listeners.move, DOC_MOVE_OPTS);
			document.removeEventListener('pointerup', listeners.done, DOC_MOVE_OPTS);
			document.removeEventListener('pointercancel', listeners.done, DOC_MOVE_OPTS);
		}

		docListenersRef.current = null;
		docMoveBoundRef.current = false;
	}

	function onCropPointerDown(event: PointerEvent): void {
		const { crop, disabled } = propsRef.current;
		const box = getBox();

		if (!crop) {
			return;
		}

		const pixelCrop = convertToPixelCrop(crop, box.width, box.height);

		if (disabled) {
			return;
		}

		if (event.cancelable) event.preventDefault(); // Stop drag selection.

		// Bind to doc to follow movements outside of element.
		bindDocMove();

		// Focus for detecting keypress.
		componentRef.current!.focus({ preventScroll: true });

		const ord = (event.target as HTMLElement).dataset.ord as Ords;
		const isResize = Boolean(ord);
		let startClientX = event.clientX;
		let startClientY = event.clientY;
		let startCropX = pixelCrop.x;
		let startCropY = pixelCrop.y;

		// Set the starting coords to the opposite corner.
		if (ord) {
			const relativeX = event.clientX - box.x;
			const relativeY = event.clientY - box.y;
			let fromCornerX = 0;
			let fromCornerY = 0;

			if (ord === 'ne' || ord == 'e') {
				fromCornerX = relativeX - (pixelCrop.x + pixelCrop.width);
				fromCornerY = relativeY - pixelCrop.y;
				startCropX = pixelCrop.x;
				startCropY = pixelCrop.y + pixelCrop.height;
			} else if (ord === 'se' || ord === 's') {
				fromCornerX = relativeX - (pixelCrop.x + pixelCrop.width);
				fromCornerY = relativeY - (pixelCrop.y + pixelCrop.height);
				startCropX = pixelCrop.x;
				startCropY = pixelCrop.y;
			} else if (ord === 'sw' || ord == 'w') {
				fromCornerX = relativeX - pixelCrop.x;
				fromCornerY = relativeY - (pixelCrop.y + pixelCrop.height);
				startCropX = pixelCrop.x + pixelCrop.width;
				startCropY = pixelCrop.y;
			} else if (ord === 'nw' || ord == 'n') {
				fromCornerX = relativeX - pixelCrop.x;
				fromCornerY = relativeY - pixelCrop.y;
				startCropX = pixelCrop.x + pixelCrop.width;
				startCropY = pixelCrop.y + pixelCrop.height;
			}

			startClientX = startCropX + box.x + fromCornerX;
			startClientY = startCropY + box.y + fromCornerY;
		}

		evDataRef.current = {
			startClientX,
			startClientY,
			startCropX,
			startCropY,
			clientX: event.clientX,
			clientY: event.clientY,
			isResize,
			ord,
		};

		mouseDownOnCropRef.current = true;
		setCropIsActive(true);
	}

	function onComponentPointerDown(event: PointerEvent): void {
		const { crop, disabled, locked, keepSelection, onChange } = propsRef.current;
		const box = getBox();

		if (disabled || locked || keepSelection && crop) {
			return;
		}

		if (event.cancelable) event.preventDefault(); // Stop drag selection.

		// Bind to doc to follow movements outside of element.
		bindDocMove();

		// Focus for detecting keypress.
		componentRef.current!.focus({ preventScroll: true });

		const cropX = event.clientX - box.x;
		const cropY = event.clientY - box.y;
		const nextCrop: PixelCrop = {
			unit: 'px',
			x: cropX,
			y: cropY,
			width: 0,
			height: 0,
		};

		evDataRef.current = {
			startClientX: event.clientX,
			startClientY: event.clientY,
			startCropX: cropX,
			startCropY: cropY,
			clientX: event.clientX,
			clientY: event.clientY,
			isResize: true,
		};

		mouseDownOnCropRef.current = true;

		onChange(
			convertToPixelCrop(nextCrop, box.width, box.height),
			convertToPercentCrop(nextCrop, box.width, box.height),
		);

		setCropIsActive(true);
		setNewCropIsBeingDrawn(true);
	}

	function onDocPointerMove(event: PointerEvent): void {
		const { crop, disabled, onChange, onDragStart } = propsRef.current;
		const box = getBox();

		if (disabled || !crop || !mouseDownOnCropRef.current) {
			return;
		}

		// Stop drag selection.
		if (event.cancelable) event.preventDefault();

		if (!dragStartedRef.current) {
			dragStartedRef.current = true;
			if (onDragStart) {
				onDragStart(event);
			}
		}

		// Update pointer position.
		const evData = evDataRef.current;

		evData.clientX = event.clientX;
		evData.clientY = event.clientY;

		let nextCrop;

		if (evData.isResize) {
			nextCrop = resizeCrop();
		} else {
			nextCrop = dragCrop();
		}

		if (!areCropsEqual(crop, nextCrop)) {
			onChange(
				convertToPixelCrop(nextCrop, box.width, box.height),
				convertToPercentCrop(nextCrop, box.width, box.height),
			);
		}
	}

	function onComponentKeyDown(event: KeyboardEvent): void {
		const { crop, disabled, onChange, onComplete } = propsRef.current;

		if (disabled) {
			return;
		}

		const keyCode = event.key;
		let nudged = false;

		if (!crop) {
			return;
		}

		const box = getBox();
		const nextCrop = makePixelCrop(box);
		const ctrlCmdPressed = navigator.platform.match('Mac') ? event.metaKey : event.ctrlKey;
		const nudgeStep =
			ctrlCmdPressed
				? ReactCrop.nudgeStepLarge
				: event.shiftKey
					? ReactCrop.nudgeStepMedium
					: ReactCrop.nudgeStep;

		if (keyCode === 'ArrowLeft') {
			nextCrop.x -= nudgeStep;
			nudged = true;
		} else if (keyCode === 'ArrowRight') {
			nextCrop.x += nudgeStep;
			nudged = true;
		} else if (keyCode === 'ArrowUp') {
			nextCrop.y -= nudgeStep;
			nudged = true;
		} else if (keyCode === 'ArrowDown') {
			nextCrop.y += nudgeStep;
			nudged = true;
		}

		if (nudged) {
			if (event.cancelable) event.preventDefault(); // Stop drag selection.

			nextCrop.x = clamp(nextCrop.x, 0, box.width - nextCrop.width);
			nextCrop.y = clamp(nextCrop.y, 0, box.height - nextCrop.height);

			const pixelCrop = convertToPixelCrop(nextCrop, box.width, box.height);
			const percentCrop = convertToPercentCrop(nextCrop, box.width, box.height);

			onChange(pixelCrop, percentCrop);
			if (onComplete) {
				onComplete(pixelCrop, percentCrop);
			}
		}
	}

	function onHandlerKeyDown(event: KeyboardEvent, ord: Ords): void {
		const {
			aspect = 0,
			crop,
			disabled,
			minWidth = 0,
			minHeight = 0,
			maxWidth,
			maxHeight,
			onChange,
			onComplete,
		} = propsRef.current;
		const box = getBox();

		if (disabled || !crop) {
			return;
		}

		// Keep the event from bubbling up to the container
		if (
			event.key === 'ArrowUp' || event.key === 'ArrowDown' || event.key === 'ArrowLeft' ||
				event.key === 'ArrowRight'
		) {
			event.stopPropagation();
			event.preventDefault();
		} else {
			return;
		}

		const ctrlCmdPressed = navigator.platform.match('Mac') ? event.metaKey : event.ctrlKey;
		const offset =
			ctrlCmdPressed
				? ReactCrop.nudgeStepLarge
				: event.shiftKey
					? ReactCrop.nudgeStepMedium
					: ReactCrop.nudgeStep;

		const pixelCrop = convertToPixelCrop(crop, box.width, box.height);
		const nudgedCrop = nudgeCrop(pixelCrop, event.key, offset, ord);
		const containedCrop = containCrop(
			nudgedCrop,
			aspect,
			ord,
			box.width,
			box.height,
			minWidth,
			minHeight,
			maxWidth,
			maxHeight,
		);

		if (!areCropsEqual(crop, containedCrop)) {
			const percentCrop = convertToPercentCrop(containedCrop, box.width, box.height);
			onChange(containedCrop, percentCrop);

			if (onComplete) {
				onComplete(containedCrop, percentCrop);
			}
		}
	}

	function onDocPointerDone(event: PointerEvent): void {
		const { crop, disabled, onComplete, onDragEnd } = propsRef.current;
		const box = getBox();

		unbindDocMove();

		if (disabled || !crop) {
			return;
		}

		if (mouseDownOnCropRef.current) {
			mouseDownOnCropRef.current = false;
			dragStartedRef.current = false;

			onDragEnd && onDragEnd(event);
			onComplete &&
				onComplete(
					convertToPixelCrop(crop, box.width, box.height),
					convertToPercentCrop(crop, box.width, box.height),
				);

			setCropIsActive(false);
			setNewCropIsBeingDrawn(false);
		}
	}

	function onDragFocus(): void {
		// Fixes #491
		componentRef.current?.scrollTo(0, 0);
	}

	function getCropStyle(): CSSProperties | undefined {
		const { crop } = propsRef.current;

		if (!crop) {
			return undefined;
		}

		return {
			top: `${crop.y}${crop.unit}`,
			left: `${crop.x}${crop.unit}`,
			width: `${crop.width}${crop.unit}`,
			height: `${crop.height}${crop.unit}`,
		};
	}

	function dragCrop(): PixelCrop {
		const evData = evDataRef.current;
		const box = getBox();
		const nextCrop = makePixelCrop(box);
		const xDiff = evData.clientX - evData.startClientX;
		const yDiff = evData.clientY - evData.startClientY;

		nextCrop.x = clamp(evData.startCropX + xDiff, 0, box.width - nextCrop.width);
		nextCrop.y = clamp(evData.startCropY + yDiff, 0, box.height - nextCrop.height);

		return nextCrop;
	}

	function getPointRegion(
		box: Rectangle,
		origOrd: Ords | undefined,
		minWidth: number,
		minHeight: number,
	): XYOrds {
		const evData = evDataRef.current;

		const relativeX = evData.clientX - box.x;
		const relativeY = evData.clientY - box.y;

		let topHalf: boolean;
		if (minHeight && origOrd) {
			// Uses orig ord (never flip when minHeight != 0)
			topHalf = origOrd === 'nw' || origOrd === 'n' || origOrd === 'ne';
		} else {
			topHalf = relativeY < evData.startCropY;
		}

		let leftHalf: boolean;
		if (minWidth && origOrd) {
			// Uses orig ord (never flip when minWidth != 0)
			leftHalf = origOrd === 'nw' || origOrd === 'w' || origOrd === 'sw';
		} else {
			leftHalf = relativeX < evData.startCropX;
		}

		if (leftHalf) {
			return topHalf ? 'nw' : 'sw';
		} else {
			return topHalf ? 'ne' : 'se';
		}
	}

	function resolveMinDimensions(
		box: Rectangle,
		aspect: number,
		minWidth = 0,
		minHeight = 0,
	): [number, number] {
		const mw = Math.min(minWidth, box.width);
		const mh = Math.min(minHeight, box.height);

		if (!aspect || !mw && !mh) {
			return [mw, mh];
		}

		if (aspect > 1) {
			return mw ? [mw, mw / aspect] : [mh * aspect, mh];
		} else {
			return mh ? [mh * aspect, mh] : [mw, mw / aspect];
		}
	}

	function resizeCrop(): PixelCrop {
		const evData = evDataRef.current;
		const { aspect = 0, maxWidth, maxHeight } = propsRef.current;
		const box = getBox();
		const [minWidth, minHeight] = resolveMinDimensions(
			box,
			aspect,
			propsRef.current.minWidth,
			propsRef.current.minHeight,
		);
		let nextCrop = makePixelCrop(box);
		const area = getPointRegion(box, evData.ord, minWidth, minHeight);
		const ord = evData.ord || area;
		let xDiff = evData.clientX - evData.startClientX;
		let yDiff = evData.clientY - evData.startClientY;

		// When min dimensions are set, ensure crop isn't dragged when going
		// beyond the other side #554
		if (minWidth && ord === 'nw' || ord === 'w' || ord === 'sw') {
			xDiff = Math.min(xDiff, -minWidth);
		}

		if (minHeight && ord === 'nw' || ord === 'n' || ord === 'ne') {
			yDiff = Math.min(yDiff, -minHeight);
		}

		const tmpCrop: PixelCrop = {
			unit: 'px',
			x: 0,
			y: 0,
			width: 0,
			height: 0,
		};

		if (area === 'ne') {
			tmpCrop.x = evData.startCropX;
			tmpCrop.width = xDiff;

			if (aspect) {
				tmpCrop.height = tmpCrop.width / aspect;
				tmpCrop.y = evData.startCropY - tmpCrop.height;
			} else {
				tmpCrop.height = Math.abs(yDiff);
				tmpCrop.y = evData.startCropY - tmpCrop.height;
			}
		} else if (area === 'se') {
			tmpCrop.x = evData.startCropX;
			tmpCrop.y = evData.startCropY;
			tmpCrop.width = xDiff;

			if (aspect) {
				tmpCrop.height = tmpCrop.width / aspect;
			} else {
				tmpCrop.height = yDiff;
			}
		} else if (area === 'sw') {
			tmpCrop.x = evData.startCropX + xDiff;
			tmpCrop.y = evData.startCropY;
			tmpCrop.width = Math.abs(xDiff);

			if (aspect) {
				tmpCrop.height = tmpCrop.width / aspect;
			} else {
				tmpCrop.height = yDiff;
			}
		} else if (area === 'nw') {
			tmpCrop.x = evData.startCropX + xDiff;
			tmpCrop.width = Math.abs(xDiff);

			if (aspect) {
				tmpCrop.height = tmpCrop.width / aspect;
				tmpCrop.y = evData.startCropY - tmpCrop.height;
			} else {
				tmpCrop.height = Math.abs(yDiff);
				tmpCrop.y = evData.startCropY + yDiff;
			}
		}

		const containedCrop = containCrop(
			tmpCrop,
			aspect,
			area,
			box.width,
			box.height,
			minWidth,
			minHeight,
			maxWidth,
			maxHeight,
		);

		// Apply x/y/width/height changes depending on ordinate
		// (fixed aspect always applies both).
		if (aspect || ReactCrop.xyOrds.indexOf(ord) > -1) {
			nextCrop = containedCrop;
		} else if (ReactCrop.xOrds.indexOf(ord) > -1) {
			nextCrop.x = containedCrop.x;
			nextCrop.width = containedCrop.width;
		} else if (ReactCrop.yOrds.indexOf(ord) > -1) {
			nextCrop.y = containedCrop.y;
			nextCrop.height = containedCrop.height;
		}

		// When drawing a new crop with min dimensions we allow flipping, but
		// ensure we don't flip outside the crop area, just ignore those.
		nextCrop.x = clamp(nextCrop.x, 0, box.width - nextCrop.width);
		nextCrop.y = clamp(nextCrop.y, 0, box.height - nextCrop.height);

		return nextCrop;
	}

	function renderCropSelection(): OctaneNode {
		const {
			ariaLabels = DEFAULT_ARIA_LABELS,
			disabled,
			locked,
			renderSelectionAddon,
			ruleOfThirds,
			crop,
		} = propsRef.current;
		const style = getCropStyle();

		if (!crop) {
			return undefined;
		}

		return <div
			style={style}
			className="ReactCrop__crop-selection"
			onPointerDown={onCropPointerDown}
			aria-label={ariaLabels.cropArea}
			tabIndex={0}
			onKeyDown={onComponentKeyDown}
			role="group"
		>
			{!disabled && !locked
				? <div className="ReactCrop__drag-elements" onFocus={onDragFocus}>
						<div className="ReactCrop__drag-bar ord-n" data-ord="n" />
						<div className="ReactCrop__drag-bar ord-e" data-ord="e" />
						<div className="ReactCrop__drag-bar ord-s" data-ord="s" />
						<div className="ReactCrop__drag-bar ord-w" data-ord="w" />

						<div
							className="ReactCrop__drag-handle ord-nw"
							data-ord="nw"
							tabIndex={0}
							aria-label={ariaLabels.nwDragHandle}
							onKeyDown={(event) => onHandlerKeyDown(event, 'nw')}
							role="button"
						/>
						<div
							className="ReactCrop__drag-handle ord-n"
							data-ord="n"
							tabIndex={0}
							aria-label={ariaLabels.nDragHandle}
							onKeyDown={(event) => onHandlerKeyDown(event, 'n')}
							role="button"
						/>
						<div
							className="ReactCrop__drag-handle ord-ne"
							data-ord="ne"
							tabIndex={0}
							aria-label={ariaLabels.neDragHandle}
							onKeyDown={(event) => onHandlerKeyDown(event, 'ne')}
							role="button"
						/>
						<div
							className="ReactCrop__drag-handle ord-e"
							data-ord="e"
							tabIndex={0}
							aria-label={ariaLabels.eDragHandle}
							onKeyDown={(event) => onHandlerKeyDown(event, 'e')}
							role="button"
						/>
						<div
							className="ReactCrop__drag-handle ord-se"
							data-ord="se"
							tabIndex={0}
							aria-label={ariaLabels.seDragHandle}
							onKeyDown={(event) => onHandlerKeyDown(event, 'se')}
							role="button"
						/>
						<div
							className="ReactCrop__drag-handle ord-s"
							data-ord="s"
							tabIndex={0}
							aria-label={ariaLabels.sDragHandle}
							onKeyDown={(event) => onHandlerKeyDown(event, 's')}
							role="button"
						/>
						<div
							className="ReactCrop__drag-handle ord-sw"
							data-ord="sw"
							tabIndex={0}
							aria-label={ariaLabels.swDragHandle}
							onKeyDown={(event) => onHandlerKeyDown(event, 'sw')}
							role="button"
						/>
						<div
							className="ReactCrop__drag-handle ord-w"
							data-ord="w"
							tabIndex={0}
							aria-label={ariaLabels.wDragHandle}
							onKeyDown={(event) => onHandlerKeyDown(event, 'w')}
							role="button"
						/>
					</div>
				: undefined}
			{renderSelectionAddon
				? <div
						className="ReactCrop__selection-addon"
						onPointerDown={(event) => event.stopPropagation()}
					>{renderSelectionAddon({ cropIsActive, newCropIsBeingDrawn })}</div>
				: undefined}
			{ruleOfThirds
				? <>
						<div className="ReactCrop__rule-of-thirds-hz" />
						<div className="ReactCrop__rule-of-thirds-vt" />
					</>
				: undefined}
		</div>;
	}

	function makePixelCrop(box: Rectangle): PixelCrop {
		const crop = { ...defaultCrop, ...propsRef.current.crop || {} };
		return convertToPixelCrop(crop, box.width, box.height);
	}

	useEffect(() => {
		const previousCrop = previousCropRef.current;
		previousCropRef.current = props.crop;

		// Useful for when programatically setting a new
		// crop and wanting to show a preview.
		if (props.onComplete && !previousCrop && props.crop) {
			const { width, height } = getBox();
			if (width && height) {
				props.onComplete(
					convertToPixelCrop(props.crop, width, height),
					convertToPercentCrop(props.crop, width, height),
				);
			}
		}
	}, [props.crop, props.onComplete]);

	useEffect(() => {
		return () => {
			resizeObserverRef.current?.disconnect();
			unbindDocMove();
		};
	}, []);

	const {
		aspect,
		children,
		circularCrop,
		className,
		crop,
		disabled,
		locked,
		style,
		ruleOfThirds,
	} = props;
	const cropSelection =
		crop ? renderCropSelection() : null;

	const componentClasses = cls(
		'ReactCrop',
		className,
		cropIsActive && 'ReactCrop--active',
		disabled && 'ReactCrop--disabled',
		locked && 'ReactCrop--locked',
		newCropIsBeingDrawn && 'ReactCrop--new-crop',
		crop && aspect && 'ReactCrop--fixed-aspect',
		crop && circularCrop && 'ReactCrop--circular-crop',
		crop && ruleOfThirds && 'ReactCrop--rule-of-thirds',
		!dragStartedRef.current && crop && !crop.width && !crop.height && 'ReactCrop--invisible-crop',
		circularCrop && 'ReactCrop--no-animate',
	);

	return <div ref={componentRef} className={componentClasses} style={style}>
		<div
			ref={mediaRef}
			className="ReactCrop__child-wrapper"
			onPointerDown={onComponentPointerDown}
		>{children}</div>
		{crop
			? <svg className="ReactCrop__crop-mask" width="100%" height="100%">
					<defs>
						<mask id={`hole-${instanceIdRef.current}`}>
							<rect width="100%" height="100%" fill="white" />
							{circularCrop
								? <ellipse
										cx={`${crop.x + crop.width / 2}${crop.unit}`}
										cy={`${crop.y + crop.height / 2}${crop.unit}`}
										rx={`${crop.width / 2}${crop.unit}`}
										ry={`${crop.height / 2}${crop.unit}`}
										fill="black"
									/>
								: <rect
										x={`${crop.x}${crop.unit}`}
										y={`${crop.y}${crop.unit}`}
										width={`${crop.width}${crop.unit}`}
										height={`${crop.height}${crop.unit}`}
										fill="black"
									/>}
						</mask>
					</defs>
					<rect
						fill="black"
						fillOpacity={0.5}
						width="100%"
						height="100%"
						mask={`url(#hole-${instanceIdRef.current})`}
					/>
				</svg>
			: undefined}
		{cropSelection}
	</div>;
}

ReactCrop.xOrds = ['e', 'w'];
ReactCrop.yOrds = ['n', 's'];
ReactCrop.xyOrds = ['nw', 'ne', 'se', 'sw'];

ReactCrop.nudgeStep = 1;
ReactCrop.nudgeStepMedium = 10;
ReactCrop.nudgeStepLarge = 100;

ReactCrop.defaultProps = {
	ariaLabels: DEFAULT_ARIA_LABELS,
};

export default ReactCrop;
