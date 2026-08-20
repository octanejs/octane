// TODO move this
const observe = jest.fn();
const unobserve = jest.fn();
const disconnect = jest.fn();

jest.spyOn(globalThis, 'IntersectionObserver').mockImplementation(() => {
  return {
    observe,
    unobserve,
    disconnect,
    root: null,
    thresholds: [],
    rootMargin: '',
    takeRecords: () => [],
  };
});

import ElementObserver from '../src/hooks/elementObserver';

describe('elementObserver', () => {
  it('registers a callback and observes the element', () => {
    const observer = new ElementObserver();
    const element = document.createElement('li');
    observer.registerCallback(element, ()=>{});
    expect(observe).toHaveBeenCalled();
    expect(observe).toHaveBeenCalledWith(element);
  });
  
  it('unregisters a callback and unobserves the element', () => {
    const observer = new ElementObserver();
    const element = document.createElement('li');
    observer.removeCallback(element);
    expect(unobserve).toHaveBeenCalled();
    expect(unobserve).toHaveBeenCalledWith(element);
  });

});

jest.clearAllMocks();
