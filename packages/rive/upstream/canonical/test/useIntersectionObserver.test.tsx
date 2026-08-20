import { renderHook, act } from '@testing-library/react';
import ElementObserver from '../src/hooks/elementObserver';
jest.mock('../src/hooks/elementObserver');

import useIntersectionObserver from '../src/hooks/useIntersectionObserver';

describe('useIntersectionObserver', () => {
  it('returns an object on initialization', () => {
    const { result } = renderHook(() => useIntersectionObserver());
    expect(result.current).toBeDefined();
  });

  it('registers a callback', () => {
    const { result } = renderHook(() => useIntersectionObserver());
    const element = document.createElement('li');
    const callback = () => {};
    act(() => {
      result.current.observe(element, callback);
    });
    const mockElementObserver = (ElementObserver as jest.Mock).mock
      .instances[0];
    const registerCallback = mockElementObserver.registerCallback;
    expect(registerCallback.mock.calls.length).toBe(1);
    expect(registerCallback.mock.calls[0].length).toBe(2);
    expect(registerCallback.mock.calls[0][0]).toBe(element);
    expect(registerCallback.mock.calls[0][1]).toBe(callback);
  });

  it('unregisters a callback', () => {
    const { result } = renderHook(() => useIntersectionObserver());
    const element = document.createElement('li');
    act(() => {
      result.current.unobserve(element);
    });
    const mockElementObserver = (ElementObserver as jest.Mock).mock
      .instances[0];
    const removeCallback = mockElementObserver.removeCallback;
    expect(removeCallback.mock.calls.length).toBe(1);
    expect(removeCallback.mock.calls[0].length).toBe(1);
    expect(removeCallback.mock.calls[0][0]).toBe(element);
  });
});
