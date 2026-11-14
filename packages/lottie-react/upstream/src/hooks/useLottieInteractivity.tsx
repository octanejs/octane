import { AnimationSegment } from "lottie-web";
import React, { useEffect, ReactElement } from "react";
import { InteractivityProps } from "../types";

// helpers
export function getContainerVisibility(container: Element): number {
  const { top, height } = container.getBoundingClientRect();

  const current = window.innerHeight - top;
  const max = window.innerHeight + height;
  return current / max;
}

export function getContainerCursorPosition(
  container: Element,
  cursorX: number,
  cursorY: number,
): { x: number; y: number } {
  const { top, left, width, height } = container.getBoundingClientRect();

  const x = (cursorX - left) / width;
  const y = (cursorY - top) / height;

  return { x, y };
}

export type InitInteractivity = {
  wrapperRef: React.RefObject<HTMLDivElement>;
  animationItem: InteractivityProps["lottieObj"]["animationItem"];
  actions: InteractivityProps["actions"];
  mode: InteractivityProps["mode"];
};

export const useInitInteractivity = ({
  wrapperRef,
  animationItem,
  mode,
  actions,
}: InitInteractivity) => {
  useEffect(() => {
    const wrapper = wrapperRef.current;

    if (!wrapper || !animationItem || !actions.length) {
      return;
    }

    animationItem.stop();

    const scrollModeHandler = () => {
      let assignedSegment: number[] | null = null;

      const scrollHandler = () => {
        const currentPercent = getContainerVisibility(wrapper);
        // Find the first action that satisfies the current position conditions
        const action = actions.find(
          ({ visibility }) =>
            visibility &&
            currentPercent >= visibility[0] &&
            currentPercent <= visibility[1],
        );

        // Skip if no matching action was found!
        if (!action) {
          return;
        }

        if (
          action.type === "seek" &&
          action.visibility &&
          action.frames.length === 2
        ) {
          // Seek: Go to a frame based on player scroll position action
          const frameToGo =
            action.frames[0] +
            Math.ceil(
              ((currentPercent - action.visibility[0]) /
                (action.visibility[1] - action.visibility[0])) *
                action.frames[1],
            );

          //! goToAndStop must be relative to the start of the current segment
          animationItem.goToAndStop(
            frameToGo - animationItem.firstFrame - 1,
            true,
          );
        }

        if (action.type === "loop") {
          // Loop: Loop a given frames
          if (assignedSegment === null) {
            // if not playing any segments currently. play those segments and save to state
            animationItem.playSegments(action.frames as AnimationSegment, true);
            assignedSegment = action.frames;
          } else {
            // if playing any segments currently.
            //check if segments in state are equal to the frames selected by action
            if (assignedSegment !== action.frames) {
              // if they are not equal. new segments are to be loaded
              animationItem.playSegments(
                action.frames as AnimationSegment,
                true,
              );
              assignedSegment = action.frames;
            } else if (animationItem.isPaused) {
              // if they are equal the play method must be called only if lottie is paused
              animationItem.playSegments(
                action.frames as AnimationSegment,
                true,
              );
              assignedSegment = action.frames;
            }
          }
        }

        if (action.type === "play" && animationItem.isPaused) {
          // Play: Reset segments and continue playing full animation from current position
          animationItem.resetSegments(true);
          animationItem.play();
        }

        if (action.type === "stop") {
          // Stop: Stop playback
          animationItem.goToAndStop(
            action.frames[0] - animationItem.firstFrame - 1,
            true,
          );
        }
      };

      document.addEventListener("scroll", scrollHandler);

      return () => {
        document.removeEventListener("scroll", scrollHandler);
      };
    };

    const cursorModeHandler = () => {
      const handleCursor = (_x: number, _y: number) => {
        let x = _x;
        let y = _y;

        // Resolve cursor position if cursor is inside container
        if (x !== -1 && y !== -1) {
          // Get container cursor position
          const pos = getContainerCursorPosition(wrapper, x, y);

          // Use the resolved position
          x = pos.x;
          y = pos.y;
        }

        // Find the first action that satisfies the current position conditions
        const action = actions.find(({ position }) => {
          if (
            position &&
            Array.isArray(position.x) &&
            Array.isArray(position.y)
          ) {
            return (
              x >= position.x[0] &&
              x <= position.x[1] &&
              y >= position.y[0] &&
              y <= position.y[1]
            );
          }

          if (
            position &&
            !Number.isNaN(position.x) &&
            !Number.isNaN(position.y)
          ) {
            return x === position.x && y === position.y;
          }

          return false;
        });

        // Skip if no matching action was found!
        if (!action) {
          return;
        }

        // Process action types:
        if (
          action.type === "seek" &&
          action.position &&
          Array.isArray(action.position.x) &&
          Array.isArray(action.position.y) &&
          action.frames.length === 2
        ) {
          // Seek: Go to a frame based on player scroll position action
          const xPercent =
            (x - action.position.x[0]) /
            (action.position.x[1] - action.position.x[0]);
          const yPercent =
            (y - action.position.y[0]) /
            (action.position.y[1] - action.position.y[0]);

          animationItem.playSegments(action.frames as AnimationSegment, true);
          animationItem.goToAndStop(
            Math.ceil(
              ((xPercent + yPercent) / 2) *
                (action.frames[1] - action.frames[0]),
            ),
            true,
          );
        }

        if (action.type === "loop") {
          animationItem.playSegments(action.frames as AnimationSegment, true);
        }

        if (action.type === "play") {
          // Play: Reset segments and continue playing full animation from current position
          if (animationItem.isPaused) {
            animationItem.resetSegments(false);
          }
          animationItem.playSegments(action.frames as AnimationSegment);
        }

        if (action.type === "stop") {
          animationItem.goToAndStop(action.frames[0], true);
        }
      };

      const mouseMoveHandler = (ev: MouseEvent) => {
        handleCursor(ev.clientX, ev.clientY);
      };

      const mouseOutHandler = () => {
        handleCursor(-1, -1);
      };

      wrapper.addEventListener("mousemove", mouseMoveHandler);
      wrapper.addEventListener("mouseout", mouseOutHandler);

      return () => {
        wrapper.removeEventListener("mousemove", mouseMoveHandler);
        wrapper.removeEventListener("mouseout", mouseOutHandler);
      };
    };

    switch (mode) {
      case "scroll":
        return scrollModeHandler();
      case "cursor":
        return cursorModeHandler();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, animationItem]);
};

const useLottieInteractivity = ({
  actions,
  mode,
  lottieObj,
}: InteractivityProps): ReactElement => {
  const { animationItem, View, animationContainerRef } = lottieObj;

  useInitInteractivity({
    actions,
    animationItem,
    mode,
    wrapperRef: animationContainerRef,
  });

  return View;
};

export default useLottieInteractivity;
