/**
 * @jest-environment jsdom
 */
import React, { CSSProperties } from "react";
import { render } from "@testing-library/react";
import { renderHook } from "@testing-library/react-hooks";
import groovyWalk from "./assets/groovyWalk.json";

import useLottie from "../hooks/useLottie";
import { PartialLottieOptions } from "../types";

function initUseLottie(props?: PartialLottieOptions, style?: CSSProperties) {
  const defaultProps = {
    animationData: groovyWalk,
  };

  return renderHook(
    (rerenderProps?) =>
      useLottie(
        {
          ...defaultProps,
          ...props,
          ...rerenderProps,
        },
        style,
      ),
    {
      initialProps: defaultProps as PartialLottieOptions,
    },
  );
}

/**
 * We need to render the returned 'View', otherwise the container's 'ref'
 * will remain 'null' so the animation will never be initialized
 * TODO: check if we can avoid a manual rerender
 */
function renderUseLottie(hook: any, props?: PartialLottieOptions) {
  render(hook.result.current.View);

  /*
   * We need to manually trigger a rerender for the ref to be updated
   * by providing different props
   */
  hook.rerender({
    loop: true,
    ...props,
  });
}

describe("useLottie(...)", () => {
  describe("General", () => {
    test("should check the returned object", async () => {
      const { result } = initUseLottie();

      expect(Object.keys(result.current).length).toBe(14);

      expect(result.current.View).toBeDefined();
      expect(result.current.play).toBeDefined();
      expect(result.current.stop).toBeDefined();
      expect(result.current.pause).toBeDefined();
      expect(result.current.setSpeed).toBeDefined();
      expect(result.current.goToAndStop).toBeDefined();
      expect(result.current.goToAndPlay).toBeDefined();
      expect(result.current.setDirection).toBeDefined();
      expect(result.current.playSegments).toBeDefined();
      expect(result.current.setSubframe).toBeDefined();
      expect(result.current.getDuration).toBeDefined();
      expect(result.current.destroy).toBeDefined();
      expect(result.current.animationLoaded).toBeDefined();
      expect(result.current.animationItem || true).toBeDefined();
    });
  });

  describe("w/o animationInstanceRef", () => {
    test("should check the interaction methods", async () => {
      const { result } = initUseLottie();

      expect(result.current.play()).toBeUndefined();
      expect(result.current.stop()).toBeUndefined();
      expect(result.current.pause()).toBeUndefined();
      expect(result.current.setSpeed(1)).toBeUndefined();
      expect(result.current.goToAndStop(1)).toBeUndefined();
      expect(result.current.goToAndPlay(1)).toBeUndefined();
      expect(result.current.setDirection(1)).toBeUndefined();
      expect(result.current.playSegments([])).toBeUndefined();
      expect(result.current.setSubframe(true)).toBeUndefined();
      expect(result.current.getDuration()).toBeUndefined();
      expect(result.current.destroy()).toBeUndefined();

      expect(result.current.animationLoaded).toBe(false);
    });

    test("shouldn't return error when adding event listener", async () => {
      const hookFactory = () =>
        initUseLottie({
          onComplete: () => {},
        });

      expect(hookFactory).not.toThrow();
    });
  });

  describe("w/ animationInstanceRef", () => {
    test("should check the interaction methods", async () => {
      const hook = initUseLottie();

      renderUseLottie(hook);

      expect(hook.result.current.play()).toBeUndefined();
      expect(hook.result.current.stop()).toBeUndefined();
      expect(hook.result.current.pause()).toBeUndefined();
      expect(hook.result.current.setSpeed(1)).toBeUndefined();
      expect(hook.result.current.goToAndStop(1)).toBeUndefined();
      expect(hook.result.current.goToAndPlay(1)).toBeUndefined();
      expect(hook.result.current.setDirection(1)).toBeUndefined();
      expect(hook.result.current.playSegments([])).toBeUndefined();
      expect(hook.result.current.setSubframe(true)).toBeUndefined();
      expect(hook.result.current.getDuration()).not.toBeNaN();
      expect(hook.result.current.destroy()).toBeUndefined();

      expect(hook.result.current.animationLoaded).toBe(true);
    });

    test("should destroy the previous animation instance", async () => {
      const hook = initUseLottie();

      renderUseLottie(hook);

      expect(hook.result.current.animationItem).toBeDefined();

      if (hook.result.current.animationItem) {
        const mock = jest.spyOn(hook.result.current.animationItem, "destroy");

        renderUseLottie(hook, {
          loop: false,
        });

        expect(mock).toBeCalledTimes(1);
      }
    });

    test("should add event listener", async () => {
      const hook = initUseLottie();

      renderUseLottie(hook);

      expect(hook.result.current.animationItem).toBeDefined();

      if (hook.result.current.animationItem) {
        const mock = jest.spyOn(
          hook.result.current.animationItem,
          "addEventListener",
        );

        renderUseLottie(hook, {
          onComplete: () => {},
        });

        expect(mock).toBeCalledTimes(1);
      }
    });

    test("shouldn't add an undefined event listener type", async () => {
      const hook = initUseLottie();

      renderUseLottie(hook);

      expect(hook.result.current.animationItem).toBeDefined();

      if (hook.result.current.animationItem) {
        const mock = jest.spyOn(
          hook.result.current.animationItem,
          "addEventListener",
        );

        renderUseLottie(hook, {
          // @ts-ignore
          notDefined: () => {},
        });

        expect(mock).toBeCalledTimes(0);
      }
    });

    test("shouldn't add event listener w/ the handler as 'undefined'", async () => {
      const hook = initUseLottie();

      renderUseLottie(hook);

      expect(hook.result.current.animationItem).toBeDefined();

      if (hook.result.current.animationItem) {
        const mock = jest.spyOn(
          hook.result.current.animationItem,
          "addEventListener",
        );

        renderUseLottie(hook, {
          onComplete: undefined,
        });

        expect(mock).not.toBeCalled();
      }
    });
  });
});
