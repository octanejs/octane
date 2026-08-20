import { useEffect, useState, MutableRefObject, useCallback } from 'react';
import { Bounds } from '@rive-app/canvas';
import { Dimensions, UseRiveOptions } from '../types';
import useDevicePixelRatio from './useDevicePixelRatio';
import useContainerSize from './useContainerSize';
import { getOptions } from '../utils';

interface UseResizeCanvasProps {
  /**
   * Whether or not Rive is loaded and renderer is associated with the canvas
   */
  riveLoaded: boolean;
  /**
   * Ref to the canvas element
   */
  canvasElem: HTMLCanvasElement | null;
  /**
   * Ref to the container element of the canvas
   */
  containerRef: MutableRefObject<HTMLElement | null>;
  /**
   * (Optional) Callback to be invoked after the canvas has been resized due to a resize
   * of its parent container. This is where you would want to reset the layout
   * dimensions for the Rive renderer to dictate the new min/max bounds of the
   * canvas.
   *
   * Using the high-level JS runtime, this might be a simple call to `rive.resizeToCanvas()`
   * Using the low-level JSruntime, this might be invoking the renderer's `.align()` method
   * with the Layout and min/max X/Y values of the canvas.
   *
   * @returns void
   */
  onCanvasHasResized?: () => void;
  /**
   * (Optional) Options passed to the useRive hook, including the shouldResizeCanvasToContainer option
   * which prevents the canvas element from resizing to its parent container
   */
  options?: Partial<UseRiveOptions>;
  /**
   * (Optional) AABB bounds of the artboard. If provided, the canvas will be sized to the artboard
   * height if the fitCanvasToArtboardHeight option is true.
   */
  artboardBounds?: Bounds;
}

/**
 * Helper hook to listen for changes in the <canvas> parent container size and size the <canvas>
 * to match. If a resize event has occurred, a supplied callback (onCanvasHasResized)
 * will be inokved to allow for any re-calculation needed (i.e. Rive layout on the canvas).
 *
 * This hook is useful if you are not intending to use the `useRive` hook yourself, but still
 * want to use the auto-sizing logic on the canvas/container.
 *
 * @param props - Object to supply necessary props to the hook
 */
export default function useResizeCanvas({
  riveLoaded = false,
  canvasElem,
  containerRef,
  options = {},
  onCanvasHasResized,
  artboardBounds,
}: UseResizeCanvasProps) {
  const presetOptions = getOptions(options);
  const [
    { height: lastContainerHeight, width: lastContainerWidth },
    setLastContainerDimensions,
  ] = useState<Dimensions>({
    height: 0,
    width: 0,
  });
  const [
    { height: lastCanvasHeight, width: lastCanvasWidth },
    setLastCanvasSize,
  ] = useState<Dimensions>({
    height: 0,
    width: 0,
  });

  const [isFirstSizing, setIsFirstSizing] = useState(true);

  const {
    fitCanvasToArtboardHeight,
    shouldResizeCanvasToContainer,
    useDevicePixelRatio: shouldUseDevicePixelRatio,
    customDevicePixelRatio,
  } = presetOptions;

  const containerSize = useContainerSize(
    containerRef,
    shouldResizeCanvasToContainer
  );
  const currentDevicePixelRatio = useDevicePixelRatio(customDevicePixelRatio);

  const { maxX, maxY } = artboardBounds ?? {};

  const getContainerDimensions = useCallback(() => {
    const width = containerRef.current?.clientWidth ?? 0;
    const height = containerRef.current?.clientHeight ?? 0;
    if (fitCanvasToArtboardHeight && artboardBounds) {
      const { maxY, maxX } = artboardBounds;
      return { width, height: width * (maxY / maxX) };
    }
    return {
      width,
      height,
    };
  }, [containerRef, fitCanvasToArtboardHeight, maxX, maxY]);

  useEffect(() => {
    // If Rive is not ready, the container is not ready, or the user supplies a flag
    // to not resize the canvas to the container, then return early
    if (
      !shouldResizeCanvasToContainer ||
      !containerRef.current ||
      !riveLoaded
    ) {
      return;
    }

    const { width, height } = getContainerDimensions();
    let hasResized = false;
    if (canvasElem) {
      // Check if the canvas parent container bounds have changed and set
      // new values accordingly
      const boundsChanged =
        width !== lastContainerWidth || height !== lastContainerHeight;
      if (presetOptions.fitCanvasToArtboardHeight && boundsChanged) {
        containerRef.current.style.height = height + 'px';
        hasResized = true;
      }
      if (presetOptions.useDevicePixelRatio) {
        // Check if devicePixelRatio may have changed and get new canvas
        // width/height values to set the size
        const canvasSizeChanged =
          width * currentDevicePixelRatio !== lastCanvasWidth ||
          height * currentDevicePixelRatio !== lastCanvasHeight;
        if (boundsChanged || canvasSizeChanged) {
          const newCanvasWidthProp = currentDevicePixelRatio * width;
          const newCanvasHeightProp = currentDevicePixelRatio * height;
          canvasElem.width = newCanvasWidthProp;
          canvasElem.height = newCanvasHeightProp;
          canvasElem.style.width = width + 'px';
          canvasElem.style.height = height + 'px';
          setLastCanvasSize({
            width: newCanvasWidthProp,
            height: newCanvasHeightProp,
          });
          hasResized = true;
        }
      } else if (boundsChanged) {
        canvasElem.width = width;
        canvasElem.height = height;
        setLastCanvasSize({
          width: width,
          height: height,
        });
        hasResized = true;
      }
      setLastContainerDimensions({ width, height });
    }

    // Callback to perform any Rive-related actions after resizing the canvas
    // (i.e., reset the Rive layout in the render loop)
    if (onCanvasHasResized && (isFirstSizing || hasResized)) {
      onCanvasHasResized && onCanvasHasResized();
    }
    isFirstSizing && setIsFirstSizing(false);
  }, [
    canvasElem,
    containerRef,
    containerSize,
    currentDevicePixelRatio,
    getContainerDimensions,
    isFirstSizing,
    setIsFirstSizing,
    lastCanvasHeight,
    lastCanvasWidth,
    lastContainerHeight,
    lastContainerWidth,
    onCanvasHasResized,
    shouldResizeCanvasToContainer,
    fitCanvasToArtboardHeight,
    shouldUseDevicePixelRatio,
    riveLoaded,
  ]);

  // Reset width and height values when the canvas changes
  useEffect(() => {
    setLastCanvasSize({
      width: 0,
      height: 0,
    });
  }, [canvasElem]);
}
