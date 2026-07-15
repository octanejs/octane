import { useState, useRef, useCallback, useEffect } from 'octane';
import type { ReactElement } from 'react';
import { localPoint } from '@octanejs/visx/event';
import {
	composeMatrices,
	inverseMatrix,
	applyMatrixToPoint,
	applyInverseMatrixToPoint,
	translateMatrix,
	identityMatrix,
	scaleMatrix,
} from './util/matrix';
import type {
	TransformMatrix,
	Point,
	Translate,
	Scale,
	ScaleSignature,
	PinchDelta,
	GenericWheelEvent,
	InteractionEvent,
	Zoom as ZoomType,
} from './types';

// default prop values
const defaultInitialTransformMatrix = {
	scaleX: 1,
	scaleY: 1,
	translateX: 0,
	translateY: 0,
	skewX: 0,
	skewY: 0,
};

const defaultWheelDelta = (event: GenericWheelEvent) => -event.deltaY > 0
	? { scaleX: 1.1, scaleY: 1.1 }
	: { scaleX: 0.9, scaleY: 0.9 };

const defaultPinchDelta: PinchDelta = ({ offset: [s], lastOffset: [lastS] }) => ({
	scaleX: s - lastS < 0 ? 0.9 : 1.1,
	scaleY: s - lastS < 0 ? 0.9 : 1.1,
});

export type ZoomProps<ElementType> = {
	/** Width of the zoom container. */
	width: number;
	/** Height of the zoom container. */
	height: number;
	/**
 * ```js
 *  wheelDelta(event)
 * ```
 *
 * A function that returns { scaleX,scaleY } factors to scale the matrix by.
 * Scale factors greater than 1 will increase (zoom in), less than 1 will decrease (zoom out).
 */
	wheelDelta?: (event: GenericWheelEvent) => Scale;
	/**
 * ```js
 *  pinchDelta(state)
 * ```
 *
 * A function that returns { scaleX, scaleY, point } factors to scale the matrix by.
 * Scale factors greater than 1 will increase (zoom in), less than 1 will decrease (zoom out), the point is used to find where to zoom.
 * The state parameter is from react-use-gestures onPinch handler
 */
	pinchDelta?: PinchDelta;
	/** Minimum x scale value for transform. */
	scaleXMin?: number;
	/** Maximum x scale value for transform. */
	scaleXMax?: number;
	/** Minimum y scale value for transform. */
	scaleYMin?: number;
	/** Maximum y scale value for transform. */
	scaleYMax?: number;
	/**
 * By default constrain() will only constrain scale values. To change
 * constraints you can pass in your own constrain function as a prop.
 *
 * For example, if you wanted to constrain your view to within [[0, 0], [width, height]]:
 *
 * ```js
 * function constrain(transformMatrix, prevTransformMatrix) {
 *   const min = applyMatrixToPoint(transformMatrix, { x: 0, y: 0 });
 *   const max = applyMatrixToPoint(transformMatrix, { x: width, y: height });
 *   if (max.x < width || max.y < height) {
 *     return prevTransformMatrix;
 *   }
 *   if (min.x > 0 || min.y > 0) {
 *     return prevTransformMatrix;
 *   }
 *   return transformMatrix;
 * }
 * ```
 */
	constrain?: (transform: TransformMatrix, prevTransform: TransformMatrix) => TransformMatrix;
	/** Initial transform matrix to apply. */
	initialTransformMatrix?: TransformMatrix;
	children: (zoom: ZoomType<ElementType>) => ReactElement;
};

function Zoom<ElementType extends Element>({
	scaleXMin = 0,
	scaleXMax = Infinity,
	scaleYMin = 0,
	scaleYMax = Infinity,
	initialTransformMatrix = defaultInitialTransformMatrix,
	wheelDelta = defaultWheelDelta,
	pinchDelta = defaultPinchDelta,
	width,
	height,
	constrain,
	children,
}: ZoomProps<ElementType>): ReactElement {
	const containerRef = useRef<ElementType>(null);
	const matrixStateRef = useRef<TransformMatrix>(initialTransformMatrix);
	const pointerActiveRef = useRef(false);
	const lastPinchDistanceRef = useRef(0);
	const pinchMemoRef = useRef<unknown>(undefined);

	const [transformMatrix, setTransformMatrixState] = useState<TransformMatrix>(
		initialTransformMatrix!,
	);
	const [isDragging, setIsDragging] = useState(false);
	const [startTranslate, setStartTranslate] = useState<Translate | undefined>(undefined);
	const [startPoint, setStartPoint] = useState<Point | undefined>(undefined);

	const defaultConstrain = useCallback((
		newTransformMatrix: TransformMatrix,
		prevTransformMatrix: TransformMatrix,
	) => {
		if (constrain) return constrain(newTransformMatrix, prevTransformMatrix);
		const { scaleX, scaleY } = newTransformMatrix;
		const shouldConstrainScaleX = scaleX > scaleXMax! || scaleX < scaleXMin!;
		const shouldConstrainScaleY = scaleY > scaleYMax! || scaleY < scaleYMin!;

		if (shouldConstrainScaleX || shouldConstrainScaleY) {
			return prevTransformMatrix;
		}
		return newTransformMatrix;
	}, [constrain, scaleXMin, scaleXMax, scaleYMin, scaleYMax]);

	const setTransformMatrix = useCallback((newTransformMatrix: TransformMatrix) => {
		setTransformMatrixState((prevTransformMatrix) => {
			const updatedTransformMatrix = defaultConstrain(newTransformMatrix, prevTransformMatrix);
			matrixStateRef.current = updatedTransformMatrix;
			return updatedTransformMatrix;
		});
	}, [defaultConstrain]);

	const applyToPoint = useCallback(
		({ x, y }: Point) => applyMatrixToPoint(transformMatrix, { x, y }),
		[transformMatrix],
	);

	const applyInverseToPoint = useCallback(
		({ x, y }: Point) => applyInverseMatrixToPoint(transformMatrix, { x, y }),
		[transformMatrix],
	);

	const reset = useCallback(() => {
		setTransformMatrix(initialTransformMatrix);
	}, [initialTransformMatrix, setTransformMatrix]);

	const scale = useCallback(({ scaleX, scaleY: maybeScaleY, point }: ScaleSignature) => {
		const scaleY = maybeScaleY || scaleX;
		const cleanPoint = point || { x: width / 2, y: height / 2 };
		// need to use ref value instead of state here because wheel listener does not have access to latest state
		const translate = applyInverseMatrixToPoint(matrixStateRef.current, cleanPoint);
		const nextMatrix = composeMatrices(
			matrixStateRef.current,
			translateMatrix(translate.x, translate.y),
			scaleMatrix(scaleX, scaleY),
			translateMatrix(-translate.x, -translate.y),
		);
		setTransformMatrix(nextMatrix);
		if (isDragging) {
			const { translateX, translateY } = matrixStateRef.current;
			setStartPoint(point);
			setStartTranslate({ translateX, translateY });
		}
	}, [height, width, isDragging, setTransformMatrix]);

	const translate = useCallback(({ translateX, translateY }: Translate) => {
		const nextMatrix = composeMatrices(transformMatrix, translateMatrix(translateX, translateY));
		setTransformMatrix(nextMatrix);
	}, [setTransformMatrix, transformMatrix]);

	const setTranslate = useCallback(({ translateX, translateY }: Translate) => {
		const nextMatrix = {
			...transformMatrix,
			translateX,
			translateY,
		};
		setTransformMatrix(nextMatrix);
	}, [setTransformMatrix, transformMatrix]);

	const translateTo = useCallback(({ x, y }: Point) => {
		const point = applyInverseMatrixToPoint(transformMatrix, { x, y });
		setTranslate({ translateX: point.x, translateY: point.y });
	}, [setTranslate, transformMatrix]);

	const invert = useCallback(() => inverseMatrix(transformMatrix), [transformMatrix]);

	const toStringInvert = useCallback(() => {
		const { translateX, translateY, scaleX, scaleY, skewX, skewY } = invert();
		return `matrix(${scaleX}, ${skewY}, ${skewX}, ${scaleY}, ${translateX}, ${translateY})`;
	}, [invert]);

	const dragStart = useCallback((event: InteractionEvent) => {
		const { translateX, translateY } = transformMatrix;
		setStartPoint(localPoint(event) || undefined);
		setStartTranslate({ translateX, translateY });
		setIsDragging(true);
	}, [transformMatrix]);

	const dragMove = useCallback((
		event: InteractionEvent,
		options?: { offsetX?: number; offsetY?: number },
	) => {
		if (!isDragging || !startPoint || !startTranslate) return;
		const currentPoint = localPoint(event);
		const dx = currentPoint ? -(startPoint.x - currentPoint.x) : -startPoint.x;
		const dy = currentPoint ? -(startPoint.y - currentPoint.y) : -startPoint.y;

		let translateX = startTranslate.translateX + dx;
		if (options?.offsetX) translateX += options?.offsetX ?? 0;
		let translateY = startTranslate.translateY + dy;
		if (options?.offsetY) translateY += options?.offsetY ?? 0;
		setTranslate({
			translateX,
			translateY,
		});
	}, [isDragging, setTranslate, startPoint, startTranslate]);

	const dragEnd = useCallback(() => {
		setStartPoint(undefined);
		setStartTranslate(undefined);
		setIsDragging(false);
	}, []);

	const handleWheel = useCallback((event: GenericWheelEvent) => {
		event.preventDefault();
		const point = localPoint(event) || undefined;
		const { scaleX, scaleY } = wheelDelta!(event);
		scale({ scaleX, scaleY, point });
	}, [scale, wheelDelta]);

	const handlePinch: ZoomType<ElementType>['handlePinch'] = useCallback((state) => {
		const { origin: [ox, oy], memo } = state;
		let currentMemo = memo;
		if (containerRef.current) {
			const { top, left } = currentMemo ?? containerRef.current.getBoundingClientRect();
			if (!currentMemo) {
				currentMemo = { top, left };
			}
			const { scaleX, scaleY } = pinchDelta(state);
			scale({
				scaleX,
				scaleY,
				point: { x: ox - left, y: oy - top },
			});
		}
		return currentMemo;
	}, [scale, pinchDelta]);

	const toString = useCallback(() => {
		const { translateX, translateY, scaleX, scaleY, skewX, skewY } = transformMatrix;
		return `matrix(${scaleX}, ${skewY}, ${skewX}, ${scaleY}, ${translateX}, ${translateY})`;
	}, [transformMatrix]);

	const center = useCallback(() => {
		const centerPoint = { x: width / 2, y: height / 2 };
		const inverseCentroid = applyInverseToPoint(centerPoint);
		translate({
			translateX: inverseCentroid.x - centerPoint.x,
			translateY: inverseCentroid.y - centerPoint.y,
		});
	}, [height, width, applyInverseToPoint, translate]);

	const clear = useCallback(() => {
		setTransformMatrix(identityMatrix());
	}, [setTransformMatrix]);

	useEffect(() => {
		const target = containerRef.current;
		if (!target || typeof window === 'undefined') return;

		const onPointerDown = (event: PointerEvent) => {
			pointerActiveRef.current = true;
			dragStart(event);
		};
		const onPointerMove = (event: PointerEvent) => {
			if (pointerActiveRef.current) dragMove(event);
		};
		const onPointerUp = () => {
			if (!pointerActiveRef.current) return;
			pointerActiveRef.current = false;
			dragEnd();
		};
		const onWheel = (event: WheelEvent) => handleWheel(event);
		const onTouchStart = (event: TouchEvent) => {
			if (event.touches.length !== 2) return;
			const [a, b] = [event.touches[0], event.touches[1]];
			lastPinchDistanceRef.current = Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY);
			pinchMemoRef.current = undefined;
			if (pointerActiveRef.current) {
				pointerActiveRef.current = false;
				dragEnd();
			}
		};
		const onTouchMove = (event: TouchEvent) => {
			if (event.touches.length !== 2) return;
			event.preventDefault();
			const [a, b] = [event.touches[0], event.touches[1]];
			const distance = Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY);
			pinchMemoRef.current = handlePinch({
				event,
				origin: [(a.clientX + b.clientX) / 2, (a.clientY + b.clientY) / 2],
				offset: [distance, 0],
				lastOffset: [lastPinchDistanceRef.current || distance, 0],
				memo: pinchMemoRef.current,
			});
			lastPinchDistanceRef.current = distance;
		};

		target.addEventListener('pointerdown', onPointerDown);
		target.addEventListener('wheel', onWheel, { passive: false });
		target.addEventListener('touchstart', onTouchStart, { passive: false });
		target.addEventListener('touchmove', onTouchMove, { passive: false });
		window.addEventListener('pointermove', onPointerMove);
		window.addEventListener('pointerup', onPointerUp);
		window.addEventListener('pointercancel', onPointerUp);
		return () => {
			target.removeEventListener('pointerdown', onPointerDown);
			target.removeEventListener('wheel', onWheel);
			target.removeEventListener('touchstart', onTouchStart);
			target.removeEventListener('touchmove', onTouchMove);
			window.removeEventListener('pointermove', onPointerMove);
			window.removeEventListener('pointerup', onPointerUp);
			window.removeEventListener('pointercancel', onPointerUp);
		};
	}, [dragEnd, dragMove, dragStart, handlePinch, handleWheel]);

	const zoom: ZoomType<ElementType> = {
		initialTransformMatrix,
		transformMatrix,
		isDragging,
		center,
		clear,
		scale,
		translate,
		translateTo,
		setTranslate,
		setTransformMatrix,
		reset,
		handleWheel,
		handlePinch,
		dragEnd,
		dragMove,
		dragStart,
		toString,
		invert,
		toStringInvert,
		applyToPoint,
		applyInverseToPoint,
		containerRef,
	};

	return <>
		{children(zoom)}
	</>;
}

export default Zoom
