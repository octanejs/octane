import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
  ComponentProps,
  RefCallback,
} from 'react';
import { Rive, EventType, Fit } from '@rive-app/canvas';
import { UseRiveParameters, UseRiveOptions, RiveState } from '../types';
import useResizeCanvas from './useResizeCanvas';
import useDevicePixelRatio from './useDevicePixelRatio';
import { getOptions } from '../utils';
import useIntersectionObserver from './useIntersectionObserver';

type RiveComponentProps = {
  setContainerRef: RefCallback<HTMLElement>;
  setCanvasRef: RefCallback<HTMLCanvasElement>;
};

function RiveComponent({
  setContainerRef,
  setCanvasRef,
  className = '',
  style,
  children,
  ...rest
}: RiveComponentProps & ComponentProps<'canvas'>) {
  const containerStyle = {
    width: '100%',
    height: '100%',
    ...style,
  };

  return (
    <div
      ref={setContainerRef}
      className={className}
      {...(!className && { style: containerStyle })}
    >
      <canvas
        ref={setCanvasRef}
        style={{ verticalAlign: 'top', width: 0, height: 0 }}
        {...rest}
      >
        {children}
      </canvas>
    </div>
  );
}

/**
 * Custom Hook for loading a Rive file.
 *
 * Waits until the load event has fired before returning it.
 * We can then listen for changes to this animation in other hooks to detect
 * when it has loaded.
 *
 * @param riveParams - Object containing parameters accepted by the Rive object
 *   in the rive-js runtime, with the exception of Canvas as that is attached
 *   via the ref callback `setCanvasRef`.
 *
 * @param opts - Optional list of options that are specific for this hook.
 * @returns {RiveAnimationState}
 */
export default function useRive(
  riveParams?: UseRiveParameters,
  opts: Partial<UseRiveOptions> = {}
): RiveState {
  const [canvasElem, setCanvasElem] = useState<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLElement | null>(null);
  const riveRef = useRef<Rive | null>(null);

  const [rive, setRive] = useState<Rive | null>(null);

  const isParamsLoaded = Boolean(riveParams);
  const options = getOptions(opts);

  const devicePixelRatio = useDevicePixelRatio();

  /**
   * When the canvas/parent container resize, reset the Rive layout to match the
   * new (0, 0, canvas.width, canvas.height) bounds in the render loop
   */
  const onCanvasHasResized = useCallback(() => {
    if (rive) {
      if (rive.layout && rive.layout.fit === Fit.Layout) {
        if (canvasElem) {
          const resizeFactor = devicePixelRatio * rive.layout.layoutScaleFactor;
          rive.devicePixelRatioUsed = devicePixelRatio;
          rive.artboardWidth = canvasElem?.width / resizeFactor;
          rive.artboardHeight = canvasElem?.height / resizeFactor;
        }
      }

      rive.startRendering();
      rive.resizeToCanvas();
    }
  }, [rive, devicePixelRatio]);

  // Watch the canvas parent container resize and size the canvas to match
  useResizeCanvas({
    riveLoaded: !!rive,
    canvasElem,
    containerRef,
    options,
    onCanvasHasResized,
    artboardBounds: rive?.bounds,
  });

  /**
   * Ref callback called when the canvas element mounts and unmounts.
   */
  const setCanvasRef: RefCallback<HTMLCanvasElement> = useCallback(
    (canvas: HTMLCanvasElement | null) => {
      if (canvas === null && canvasElem) {
        canvasElem.height = 0;
        canvasElem.width = 0;
      }

      setCanvasElem(canvas);
    },
    []
  );

  useEffect(() => {
    if (!canvasElem || !riveParams) {
      return;
    }
    let isLoaded = rive != null;
    let r: Rive | null;
    if (rive == null) {
      const { useOffscreenRenderer } = options;
      const { onRiveReady, ...restRiveParams } = riveParams;
      r = new Rive({
        useOffscreenRenderer,
        ...restRiveParams,
        canvas: canvasElem,
      });
      if (riveRef.current != null) {
        riveRef.current!.cleanup();
      }
      riveRef.current = r;
      r.on(EventType.Load, () => {
        isLoaded = true;

        if (onRiveReady) {
          onRiveReady(r!);
        }

        // Check if the component/canvas is mounted before setting state to avoid setState
        // on an unmounted component in some rare cases
        if (canvasElem) {
          setRive(r);
        } else {
          // If unmounted, cleanup the rive object immediately
          r!.cleanup();
        }
      });
    }
    return () => {
      if (!isLoaded) {
        r?.cleanup();
      }
    };
  }, [canvasElem, isParamsLoaded, rive]);
  /**
   * Ref callback called when the container element mounts
   */
  const setContainerRef: RefCallback<HTMLElement> = useCallback(
    (container: HTMLElement | null) => {
      containerRef.current = container;
    },
    []
  );

  /**
   * Set up IntersectionObserver to stop rendering if the animation is not in
   * view.
   */
  const { observe, unobserve } = useIntersectionObserver();

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout>;
    let isPaused = false;
    // This is a workaround to retest whether an element is offscreen or not.
    // There seems to be a bug in Chrome that triggers an intersection change when an element
    // is moved within the DOM using insertBefore.
    // For some reason, when this is called whithin the context of a React application, the
    // intersection callback is called only once reporting isIntersecting as false but never
    // triggered back with isIntersecting as true.
    // For this reason we retest after 10 millisecond whether the element is actually off the
    // viewport or not.
    const retestIntersection = () => {
      if (canvasElem && isPaused) {
        const size = canvasElem.getBoundingClientRect();
        const isIntersecting =
          size.width > 0 &&
          size.height > 0 &&
          size.top <
            (window.innerHeight || document.documentElement.clientHeight) &&
          size.bottom > 0 &&
          size.left <
            (window.innerWidth || document.documentElement.clientWidth) &&
          size.right > 0;
        if (isIntersecting) {
          rive?.startRendering();
          isPaused = false;
        }
      }
    };
    const onChange = (entry: IntersectionObserverEntry) => {
      entry.isIntersecting
        ? rive && rive.startRendering()
        : rive && rive.stopRendering();
      isPaused = !entry.isIntersecting;
      clearTimeout(timeoutId);
      if (!entry.isIntersecting && entry.boundingClientRect.width === 0) {
        timeoutId = setTimeout(retestIntersection, 10);
      }
    };
    if (canvasElem && options.shouldUseIntersectionObserver !== false) {
      observe(canvasElem, onChange);
    }
    return () => {
      if (canvasElem) {
        unobserve(canvasElem);
      }
    };
  }, [
    observe,
    unobserve,
    rive,
    canvasElem,
    options.shouldUseIntersectionObserver,
  ]);

  /**
   * On unmount, call cleanup to cleanup any WASM generated objects that need
   * to be manually destroyed.
   */
  useEffect(() => {
    return () => {
      if (rive) {
        rive.cleanup();
        setRive(null);
      }
    };
  }, [rive, canvasElem]);

  useEffect(() => {
    return () => {
      if (riveRef.current != null) {
        riveRef.current!.cleanup();
      }
    };
  }, []);

  /**
   * Listen for changes in the animations params
   */
  const animations = riveParams?.animations;
  useEffect(() => {
    if (rive && animations) {
      if (rive.isPlaying) {
        rive.stop(rive.animationNames);
        rive.play(animations);
      } else if (rive.isPaused) {
        rive.stop(rive.animationNames);
        rive.pause(animations);
      }
    }
  }, [animations, rive]);

  const Component = useCallback(
    (props: ComponentProps<'canvas'>): JSX.Element => {
      return (
        <RiveComponent
          setContainerRef={setContainerRef}
          setCanvasRef={setCanvasRef}
          {...props}
        />
      );
    },
    [setCanvasRef, setContainerRef]
  );

  return {
    canvas: canvasElem,
    container: containerRef.current,
    setCanvasRef,
    setContainerRef,
    rive,
    RiveComponent: Component,
  };
}
