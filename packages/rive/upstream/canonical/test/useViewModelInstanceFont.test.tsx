import { act, renderHook } from '@testing-library/react';

import useViewModelInstanceFont from '../src/hooks/useViewModelInstanceFont';

jest.mock('@rive-app/canvas', () => ({}));

function makeFontProperty() {
  let value: unknown = undefined;
  return {
    on: jest.fn(),
    off: jest.fn(),
    set value(next: unknown) {
      value = next;
    },
    get value() {
      return value;
    },
  };
}

function makeViewModelInstance(fontProperty: ReturnType<typeof makeFontProperty>) {
  return {
    font: jest.fn(() => fontProperty),
  } as any;
}

beforeEach(() => jest.clearAllMocks());

describe('useViewModelInstanceFont', () => {
  it('looks up the font property by path and exposes setValue', () => {
    const fontProperty = makeFontProperty();
    const viewModelInstance = makeViewModelInstance(fontProperty);

    const { result } = renderHook(() =>
      useViewModelInstanceFont('fontProperty', viewModelInstance)
    );

    expect(viewModelInstance.font).toHaveBeenCalledWith('fontProperty');
    expect(typeof result.current.setValue).toBe('function');
  });

  it('sets the decoded font on the property', () => {
    const fontProperty = makeFontProperty();
    const viewModelInstance = makeViewModelInstance(fontProperty);
    const decodedFont = { nativeFont: {}, unref: jest.fn() };

    const { result } = renderHook(() =>
      useViewModelInstanceFont('titleFont', viewModelInstance)
    );

    act(() => {
      result.current.setValue(decodedFont as any);
    });

    expect(fontProperty.value).toBe(decodedFont);
  });

  it('clears the font when setValue is called with null', () => {
    const fontProperty = makeFontProperty();
    const viewModelInstance = makeViewModelInstance(fontProperty);
    const decodedFont = { nativeFont: {}, unref: jest.fn() };

    const { result } = renderHook(() =>
      useViewModelInstanceFont('fontProperty', viewModelInstance)
    );

    act(() => {
      result.current.setValue(decodedFont as any);
      result.current.setValue(null);
    });

    expect(fontProperty.value).toBeNull();
  });

  it('supports nested property paths', () => {
    const fontProperty = makeFontProperty();
    const viewModelInstance = makeViewModelInstance(fontProperty);

    renderHook(() =>
      useViewModelInstanceFont('group/titleFont', viewModelInstance)
    );

    expect(viewModelInstance.font).toHaveBeenCalledWith('group/titleFont');
  });

  it('does not throw when setValue is called without a view model instance', () => {
    const { result } = renderHook(() =>
      useViewModelInstanceFont('fontProperty', null)
    );

    expect(() => {
      act(() => {
        result.current.setValue(null);
      });
    }).not.toThrow();
  });

  it('subscribes to property changes and cleans up on unmount', () => {
    const fontProperty = makeFontProperty();
    const viewModelInstance = makeViewModelInstance(fontProperty);

    const { unmount } = renderHook(() =>
      useViewModelInstanceFont('fontProperty', viewModelInstance)
    );

    expect(fontProperty.on).toHaveBeenCalled();

    unmount();

    expect(fontProperty.off).toHaveBeenCalled();
  });
});
