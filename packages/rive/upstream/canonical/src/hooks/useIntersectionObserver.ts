import { useCallback } from 'react';
import ElementObserver from './elementObserver';

let observer: ElementObserver;
const getObserver = () => {
  if(!observer) {
    observer = new ElementObserver();
  }
  return observer;
}

/**
 * Hook to observe elements when they are intersecting with the viewport
 *
 * @returns - API to observer and unobserve elements
 */
export default function useIntersectionObserver() {
  const observe = useCallback((element: Element, callback: Function) => {
    const observer = getObserver();
    observer.registerCallback(element, callback);
  }, []);

  const unobserve = useCallback((element: Element) => {
    const observer = getObserver();
    observer.removeCallback(element);
  }, []);

  return {
    observe,
    unobserve,
  };
}
