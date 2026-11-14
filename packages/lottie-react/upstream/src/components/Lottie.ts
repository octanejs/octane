import { useEffect } from "react";
import useLottie from "../hooks/useLottie";
import useLottieInteractivity from "../hooks/useLottieInteractivity";
import { LottieComponentProps } from "../types";

const Lottie = (props: LottieComponentProps) => {
  const { style, interactivity, ...lottieProps } = props;

  /**
   * Initialize the 'useLottie' hook
   */
  const {
    View,
    play,
    stop,
    pause,
    setSpeed,
    goToAndStop,
    goToAndPlay,
    setDirection,
    playSegments,
    setSubframe,
    getDuration,
    destroy,
    animationContainerRef,
    animationLoaded,
    animationItem,
  } = useLottie(lottieProps, style);

  /**
   * Make the hook variables/methods available through the provided 'lottieRef'
   */
  useEffect(() => {
    if (props.lottieRef) {
      props.lottieRef.current = {
        play,
        stop,
        pause,
        setSpeed,
        goToAndPlay,
        goToAndStop,
        setDirection,
        playSegments,
        setSubframe,
        getDuration,
        destroy,
        animationContainerRef,
        animationLoaded,
        animationItem,
      };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.lottieRef?.current]);

  return useLottieInteractivity({
    lottieObj: {
      View,
      play,
      stop,
      pause,
      setSpeed,
      goToAndStop,
      goToAndPlay,
      setDirection,
      playSegments,
      setSubframe,
      getDuration,
      destroy,
      animationContainerRef,
      animationLoaded,
      animationItem,
    },
    actions: interactivity?.actions ?? [],
    mode: interactivity?.mode ?? "scroll",
  });
};

export default Lottie;
