/**
 * @jest-environment jsdom
 */
import React from "react";
import { render, fireEvent } from "@testing-library/react";
import { renderHook } from "@testing-library/react-hooks";

import useLottieInteractivity, {
  getContainerVisibility,
  getContainerCursorPosition,
  useInitInteractivity,
  InitInteractivity,
} from "../hooks/useLottieInteractivity";
import { InteractivityProps } from "../types";
import { act } from "react-dom/test-utils";

function renderUseLottieInteractivity(props: InteractivityProps) {
  return renderHook(() => useLottieInteractivity(props));
}

function renderUseInitInteractivity(props: InitInteractivity) {
  return renderHook(() => useInitInteractivity(props));
}

describe("useLottieInteractivity", () => {
  describe("General", () => {
    test("mounts with a div wrapper around lottie element", async () => {
      const hook = renderUseLottieInteractivity({
        lottieObj: {
          View: <span />,
        } as any,
        mode: "scroll",
        actions: [],
      });

      const result = render(hook.result.current);

      expect(result.container.innerHTML).toEqual("<div><span></span></div>");
    });
  });
});

describe("useInitInteractivity", () => {
  const result = render(<div role="test" />);

  const wrapperRef = {
    current: result.getByRole("test"),
  };
  wrapperRef.current.getBoundingClientRect = jest.fn();

  const animationItem = {
    stop: jest.fn(),
    play: jest.fn(),
    goToAndStop: jest.fn(),
    playSegments: jest.fn(),
    resetSegments: jest.fn(),
    firstFrame: 0,
    isPaused: false,
  };

  beforeEach(() => {
    (wrapperRef.current.getBoundingClientRect as jest.Mock<
      any,
      any
    >).mockClear();
    // Object.values(wrapperRef.current).forEach((f) => {
    //   f.mockClear();
    // });
    let { firstFrame, isPaused, ...itemMocks } = animationItem;

    Object.values(itemMocks).forEach((f) => {
      f.mockClear();
    });

    firstFrame = 0;
    isPaused = false;
  });

  describe("General", () => {
    test("does nothing if animationItem is not provided", () => {
      const stopSpy = jest.spyOn(animationItem, "stop");

      renderUseInitInteractivity({
        wrapperRef: wrapperRef as any,
        animationItem: undefined as any,
        mode: "scroll",
        actions: [],
      });

      expect(stopSpy).toHaveBeenCalledTimes(0);
    });

    test("calls animationItem.stop() when mounts", () => {
      const stopSpy = jest.spyOn(animationItem, "stop");

      renderUseInitInteractivity({
        wrapperRef: wrapperRef as any,
        animationItem: animationItem as any,
        mode: "scroll",
        actions: [],
      });

      expect(stopSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe("scroll mode", () => {
    beforeAll(() => {
      window = Object.assign(window, { innerHeight: 1 });
      (wrapperRef.current.getBoundingClientRect as jest.Mock<
        any,
        any
      >).mockReturnValue({
        top: 0,
        left: 0,
        width: 0,
        height: 1,
      });
      // currentPercent/containerVisibility => 0.5
    });

    beforeEach(() => {
      animationItem.isPaused = false;
    });

    test("attaches and detaches eventListeners", () => {
      const AddLSpy = jest.spyOn(document, "addEventListener");
      const RmLSpy = jest.spyOn(document, "removeEventListener");

      const hook = renderUseInitInteractivity({
        wrapperRef: wrapperRef as any,
        animationItem: animationItem as any,
        mode: "scroll",
        actions: [],
      });

      expect(AddLSpy).toHaveBeenCalledTimes(1);
      hook.unmount();
      expect(RmLSpy).toHaveBeenCalledTimes(1);
    });

    test("do not process if action does not match", () => {
      const goToAndStopSpy = jest.spyOn(animationItem, "goToAndStop");
      const playSegmentsSpy = jest.spyOn(animationItem, "playSegments");
      const resetSegmentsSpy = jest.spyOn(animationItem, "resetSegments");

      renderUseInitInteractivity({
        wrapperRef: wrapperRef as any,
        animationItem: animationItem as any,
        mode: "scroll",
        actions: [{ visibility: [0, 0.4], frames: [5, 10], type: "seek" }],
      });

      act(() => {
        fireEvent.scroll(document);
      });

      expect(goToAndStopSpy).toHaveBeenCalledTimes(0);
      expect(playSegmentsSpy).toHaveBeenCalledTimes(0);
      expect(resetSegmentsSpy).toHaveBeenCalledTimes(0);
    });

    test("handles `seek` type correctly", () => {
      // frameToGo = 10

      const goToAndStopSpy = jest.spyOn(animationItem, "goToAndStop");
      const goToAndStopArgMock = 10 - animationItem.firstFrame - 1;

      renderUseInitInteractivity({
        wrapperRef: wrapperRef as any,
        animationItem: animationItem as any,
        mode: "scroll",
        actions: [{ visibility: [0, 1], frames: [5, 10], type: "seek" }],
      });

      act(() => {
        fireEvent.scroll(document);
        fireEvent.scroll(document);
      });

      expect(goToAndStopSpy).toHaveBeenCalledTimes(2);
      expect(goToAndStopSpy).toHaveBeenCalledWith(goToAndStopArgMock, true);
    });

    test("handles `loop` type correctly", () => {
      const playSegmentsSpy = jest.spyOn(animationItem, "playSegments");

      renderUseInitInteractivity({
        wrapperRef: wrapperRef as any,
        animationItem: animationItem as any,
        mode: "scroll",
        actions: [
          { visibility: [0, 0.4], frames: [10, 15], type: "loop" },
          { visibility: [0.4, 1], frames: [5, 10], type: "loop" },
        ],
      });

      act(() => {
        fireEvent.scroll(document);
      });

      expect(playSegmentsSpy).toHaveBeenCalledTimes(1);
      expect(playSegmentsSpy).toHaveBeenCalledWith([5, 10], true);

      act(() => {
        fireEvent.scroll(document);
      });

      expect(playSegmentsSpy).toHaveBeenCalledTimes(1);

      // assignedSegment === action.frames
      animationItem.isPaused = true;

      act(() => {
        fireEvent.scroll(document);
      });

      expect(playSegmentsSpy).toHaveBeenCalledTimes(2);

      // container visibility => 0.2
      (wrapperRef.current.getBoundingClientRect as jest.Mock<
        any,
        any
      >).mockReturnValue({
        top: 0.6,
        left: 0,
        width: 0,
        height: 1,
      });

      act(() => {
        fireEvent.scroll(document);
      });

      expect(playSegmentsSpy).toHaveBeenCalledTimes(3);
    });

    test("handles `play` type correctly", () => {
      const playSpy = jest.spyOn(animationItem, "play");
      const resetSegmentsSpy = jest.spyOn(animationItem, "resetSegments");

      renderUseInitInteractivity({
        wrapperRef: wrapperRef as any,
        animationItem: animationItem as any,
        mode: "scroll",
        actions: [{ visibility: [0, 1], frames: [5, 10], type: "play" }],
      });

      expect(resetSegmentsSpy).toHaveBeenCalledTimes(0);
      expect(playSpy).toHaveBeenCalledTimes(0);

      act(() => {
        fireEvent.scroll(document);
      });

      animationItem.isPaused = true;

      act(() => {
        fireEvent.scroll(document);
      });

      expect(resetSegmentsSpy).toHaveBeenCalledTimes(1);
      expect(resetSegmentsSpy).toBeCalledWith(true);
      expect(playSpy).toHaveBeenCalledTimes(1);
    });

    test("handles `stop` type correctly", () => {
      const goToAndStopSpy = jest.spyOn(animationItem, "goToAndStop");
      const goToAndStopArgMock = 5 - animationItem.firstFrame - 1;

      renderUseInitInteractivity({
        wrapperRef: wrapperRef as any,
        animationItem: animationItem as any,
        mode: "scroll",
        actions: [{ visibility: [0, 1], frames: [5, 10], type: "stop" }],
      });

      act(() => {
        fireEvent.scroll(document);
      });

      expect(goToAndStopSpy).toHaveBeenCalledTimes(1);
      expect(goToAndStopSpy).toHaveBeenCalledWith(goToAndStopArgMock, true);
    });
  });

  describe("cursor mode", () => {
    beforeAll(() => {
      (wrapperRef.current.getBoundingClientRect as jest.Mock<
        any,
        any
      >).mockReturnValue({
        left: -1,
        top: -1,
        width: 2,
        height: 2,
      });
      // x = 0.5; y = 0.5
    });

    test("attaches and detaches eventListeners", () => {
      const wrapperAddLSpy = jest.spyOn(wrapperRef.current, "addEventListener");
      const wrapperRmLSpy = jest.spyOn(
        wrapperRef.current,
        "removeEventListener",
      );

      const hook = renderUseInitInteractivity({
        wrapperRef: wrapperRef as any,
        animationItem: animationItem as any,
        mode: "cursor",
        actions: [],
      });

      expect(wrapperAddLSpy).toHaveBeenCalledTimes(2);
      hook.unmount();
      expect(wrapperRmLSpy).toHaveBeenCalledTimes(2);
    });

    test("handles mouseout event correctly", () => {
      const goToAndStopSpy = jest.spyOn(animationItem, "goToAndStop");
      const playSegmentsSpy = jest.spyOn(animationItem, "playSegments");
      const resetSegmentsSpy = jest.spyOn(animationItem, "resetSegments");

      renderUseInitInteractivity({
        wrapperRef: wrapperRef as any,
        animationItem: animationItem as any,
        mode: "cursor",
        actions: [
          { position: { x: [0, 1], y: [0, 1] }, frames: [5, 10], type: "loop" },
        ],
      });

      act(() => {
        fireEvent.mouseOut(wrapperRef.current);
      });

      expect(goToAndStopSpy).toHaveBeenCalledTimes(0);
      expect(playSegmentsSpy).toHaveBeenCalledTimes(0);
      expect(resetSegmentsSpy).toHaveBeenCalledTimes(0);
    });

    test("do not process lottie if action does not match", () => {
      const goToAndStopSpy = jest.spyOn(animationItem, "goToAndStop");
      const playSegmentsSpy = jest.spyOn(animationItem, "playSegments");
      const resetSegmentsSpy = jest.spyOn(animationItem, "resetSegments");

      const commonProps = {
        wrapperRef: wrapperRef as any,
        animationItem: animationItem as any,
        mode: "cursor" as "cursor",
      };

      renderUseInitInteractivity({
        ...commonProps,
        actions: [
          { position: { x: [0, 1], y: [1, 0] }, frames: [5, 10], type: "seek" },
        ],
      });

      act(() => {
        fireEvent.mouseMove(wrapperRef.current);
      });

      expect(goToAndStopSpy).toHaveBeenCalledTimes(0);
      expect(playSegmentsSpy).toHaveBeenCalledTimes(0);
      expect(resetSegmentsSpy).toHaveBeenCalledTimes(0);

      renderUseInitInteractivity({
        ...commonProps,
        actions: [
          { position: { x: 0.5, y: 0.8 }, frames: [5, 10], type: "seek" },
        ],
      });

      act(() => {
        fireEvent.mouseMove(wrapperRef.current);
      });

      expect(goToAndStopSpy).toHaveBeenCalledTimes(0);
      expect(playSegmentsSpy).toHaveBeenCalledTimes(0);
      expect(resetSegmentsSpy).toHaveBeenCalledTimes(0);

      renderUseInitInteractivity({
        ...commonProps,
        actions: [
          { position: { x: 0.5, y: NaN }, frames: [5, 10], type: "seek" },
        ],
      });

      act(() => {
        fireEvent.mouseMove(wrapperRef.current);
      });

      expect(goToAndStopSpy).toHaveBeenCalledTimes(0);
      expect(playSegmentsSpy).toHaveBeenCalledTimes(0);
      expect(resetSegmentsSpy).toHaveBeenCalledTimes(0);
    });

    test("handles `seek` type correctly", () => {
      const playSegmentsSpy = jest.spyOn(animationItem, "playSegments");
      const goToAndStopSpy = jest.spyOn(animationItem, "goToAndStop");

      renderUseInitInteractivity({
        wrapperRef: wrapperRef as any,
        animationItem: animationItem as any,
        mode: "cursor",
        actions: [
          { position: { x: [0, 1], y: [0, 1] }, frames: [5, 10], type: "seek" },
        ],
      });

      act(() => {
        fireEvent.mouseMove(wrapperRef.current);
      });

      expect(goToAndStopSpy).toHaveBeenCalledTimes(1);
      expect(goToAndStopSpy).toHaveBeenCalledWith(3, true);

      expect(playSegmentsSpy).toHaveBeenCalledTimes(1);
      expect(playSegmentsSpy).toHaveBeenCalledWith([5, 10], true);
    });

    test("handles `loop` type correctly", () => {
      const playSegmentsSpy = jest.spyOn(animationItem, "playSegments");

      renderUseInitInteractivity({
        wrapperRef: wrapperRef as any,
        animationItem: animationItem as any,
        mode: "cursor",
        actions: [
          { position: { x: [0, 1], y: [0, 1] }, frames: [5, 10], type: "loop" },
        ],
      });

      act(() => {
        fireEvent.mouseMove(wrapperRef.current);
      });

      expect(playSegmentsSpy).toHaveBeenCalledTimes(1);
      expect(playSegmentsSpy).toHaveBeenCalledWith([5, 10], true);
    });

    test("handles `play` type correctly", () => {
      const resetSegmentsSpy = jest.spyOn(animationItem, "resetSegments");
      const playSegmentsSpy = jest.spyOn(animationItem, "playSegments");

      renderUseInitInteractivity({
        wrapperRef: wrapperRef as any,
        animationItem: animationItem as any,
        mode: "cursor",
        actions: [
          { position: { x: [0, 1], y: [0, 1] }, frames: [5, 10], type: "play" },
        ],
      });

      act(() => {
        fireEvent.mouseMove(wrapperRef.current);
      });

      expect(resetSegmentsSpy).toHaveBeenCalledTimes(0);
      expect(playSegmentsSpy).toHaveBeenCalledTimes(1);

      animationItem.isPaused = true;

      act(() => {
        fireEvent.mouseMove(wrapperRef.current);
      });

      expect(resetSegmentsSpy).toHaveBeenCalledTimes(1);
      expect(resetSegmentsSpy).toHaveBeenCalledWith(false);

      expect(playSegmentsSpy).toHaveBeenCalledTimes(2);
      expect(playSegmentsSpy).toHaveBeenCalledWith([5, 10]);
    });

    test("handles `stop` type correctly", () => {
      const goToAndStopSpy = jest.spyOn(animationItem, "goToAndStop");

      renderUseInitInteractivity({
        wrapperRef: wrapperRef as any,
        animationItem: animationItem as any,
        mode: "cursor",
        actions: [
          { position: { x: [0, 1], y: [0, 1] }, frames: [5, 10], type: "stop" },
        ],
      });

      act(() => {
        fireEvent.mouseMove(wrapperRef.current);
      });

      expect(goToAndStopSpy).toHaveBeenCalledTimes(1);
      expect(goToAndStopSpy).toHaveBeenCalledWith(5, true);
    });
  });

  describe("helpers", () => {
    test("getContainerVisbility does correct calculations", () => {
      const values = {
        top: 5,
        height: -10,
        innerHeight: 15,
        result: 2,
      };

      const wrapper = wrapperRef.current;

      (wrapper.getBoundingClientRect as jest.Mock<any, any>).mockReturnValue({
        top: values.top,
        height: values.height,
      });
      window = Object.assign(window, { innerHeight: values.innerHeight });

      const result = getContainerVisibility(wrapper as any);

      expect(wrapper.getBoundingClientRect).toHaveBeenCalledTimes(1);
      expect(result).toEqual(values.result);
    });

    test("getContainerCursorPosition does correct calculations", () => {
      const values = {
        left: 5,
        top: 5,
        width: 2,
        height: 2,
        cursorX: 15,
        cursorY: 15,
        result: { x: 5, y: 5 },
      };

      const wrapper = wrapperRef.current;

      (wrapper.getBoundingClientRect as jest.Mock<any, any>).mockReturnValue({
        top: values.top,
        left: values.left,
        width: values.width,
        height: values.height,
      });

      const result = getContainerCursorPosition(
        wrapper as any,
        values.cursorX,
        values.cursorY,
      );

      expect(wrapper.getBoundingClientRect).toHaveBeenCalledTimes(1);
      expect(result).toEqual(values.result);
    });
  });
});
