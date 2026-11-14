/**
 * @jest-environment jsdom
 */
import React from "react";
import { render } from "@testing-library/react";
import groovyWalk from "./assets/groovyWalk.json";

import Lottie from "../components/Lottie";
import { LottieRef, PartialLottieComponentProps } from "../types";
import useLottieInteractivity from "../hooks/useLottieInteractivity";

jest.mock("../hooks/useLottieInteractivity.tsx");

function renderLottie(props?: PartialLottieComponentProps) {
  const defaultProps = {
    animationData: groovyWalk,
  };

  return render(<Lottie {...defaultProps} {...props} />);
}

describe("<Lottie />", () => {
  test("should check if 'lottieRef' can be undefined", async () => {
    const component = renderLottie();
    expect(component.container).toBeDefined();
  });

  test("should check 'lottieRef' properties", async () => {
    const lottieRef: LottieRef = { current: null };

    renderLottie({ lottieRef });

    expect(Object.keys(lottieRef.current || {}).length).toBe(13);

    expect(lottieRef.current?.play).toBeDefined();
    expect(lottieRef.current?.stop).toBeDefined();
    expect(lottieRef.current?.pause).toBeDefined();
    expect(lottieRef.current?.setSpeed).toBeDefined();
    expect(lottieRef.current?.goToAndPlay).toBeDefined();
    expect(lottieRef.current?.goToAndStop).toBeDefined();
    expect(lottieRef.current?.setDirection).toBeDefined();
    expect(lottieRef.current?.playSegments).toBeDefined();
    expect(lottieRef.current?.setSubframe).toBeDefined();
    expect(lottieRef.current?.getDuration).toBeDefined();
    expect(lottieRef.current?.destroy).toBeDefined();
    expect(lottieRef.current?.animationLoaded).toBeDefined();
    expect(lottieRef.current?.animationItem).toBeDefined();
  });

  test("should pass HTML props to container <div>", () => {
    const { getByLabelText } = renderLottie({ "aria-label": "test" });
    expect(getByLabelText("test")).toBeTruthy();
  });

  test("should not pass non-HTML props to container <div>", () => {
    // TODO
  });

  test("should check if interactivity applied when passed as a prop", async () => {
    (useLottieInteractivity as jest.Mock).mockReturnValue(<div />);
    renderLottie({ interactivity: { actions: [], mode: "scroll" } });
    expect(useLottieInteractivity).toBeCalled();
  });
});
