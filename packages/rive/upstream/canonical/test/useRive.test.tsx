import React from 'react';
import { mocked } from 'jest-mock';
import { renderHook, act, render, waitFor } from '@testing-library/react';

import useRive from '../src/hooks/useRive';
import * as rive from '@rive-app/canvas';

jest.mock('@rive-app/canvas', () => ({
  Rive: jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    stop: jest.fn(),
  })),
  Layout: jest.fn(),
  Fit: {
    Cover: 'cover',
  },
  Alignment: {
    Center: 'center',
  },
  EventType: {
    Load: 'load',
  },
  StateMachineInputType: {
    Number: 1,
    Boolean: 2,
    Trigger: 3,
  },
}));

describe('useRive', () => {
  let controlledRiveloadCb: () => void;
  let baseRiveMock: Partial<rive.Rive>;

  beforeEach(() => {
    baseRiveMock = {
      on: (_: rive.EventType, cb: rive.EventCallback) =>
        ((controlledRiveloadCb as rive.EventCallback) = cb),
      stop: jest.fn(),
      stopRendering: jest.fn(),
      startRendering: jest.fn(),
      cleanup: jest.fn(),
      resizeToCanvas: jest.fn(),
    };
  });

  afterEach(() => {
    controlledRiveloadCb = () => {};
  });

  it('returns rive as null if no params are passed', () => {
    const { result } = renderHook(() => useRive());
    expect(result.current.rive).toBe(null);
    expect(result.current.canvas).toBe(null);
  });

  it('returns a rive object if the src object is set on the rive params and setCanvas is called', async () => {
    const params = {
      src: 'file-src',
    };

    // @ts-ignore
    mocked(rive.Rive).mockImplementation(() => baseRiveMock);

    const canvasSpy = document.createElement('canvas');
    const { result } = renderHook(() => useRive(params));

    await act(async () => {
      result.current.setCanvasRef(canvasSpy);
    });
    await waitFor(() => {
      expect(result.current.canvas).toBe(canvasSpy);
    });
    await act(async () => {
      controlledRiveloadCb();
    });
    expect(result.current.rive).toBe(baseRiveMock);
    expect(result.current.canvas).toBe(canvasSpy);
  });

  it('updates the bounds if the container ref is set', async () => {
    const params = {
      src: 'file-src',
    };

    const resizeToCanvasMock = jest.fn();

    const riveMock = {
      ...baseRiveMock,
      resizeToCanvas: resizeToCanvasMock,
    };

    // @ts-ignore
    mocked(rive.Rive).mockImplementation(() => riveMock);

    const canvasSpy = document.createElement('canvas');
    const containerSpy = document.createElement('div');
    const { result } = renderHook(() => useRive(params));

    await act(async () => {
      result.current.setCanvasRef(canvasSpy);
      result.current.setContainerRef(containerSpy);
    });
    await waitFor(() => {
      expect(result.current.canvas).toBe(canvasSpy);
    });
    await act(async () => {
      controlledRiveloadCb();
    });
    await act(async () => {
      jest.spyOn(containerSpy, 'clientWidth', 'get').mockReturnValue(500);
      jest.spyOn(containerSpy, 'clientHeight', 'get').mockReturnValue(500);
      containerSpy.dispatchEvent(new Event('resize'));
    });

    expect(result.current.rive).toBe(riveMock);
    expect(result.current.canvas).toBe(canvasSpy);

    expect(resizeToCanvasMock).toBeCalled();
  });

  it('calls cleanup on the rive object on unmount', async () => {
    const params = {
      src: 'file-src',
    };

    const cleanupMock = jest.fn();

    const riveMock = {
      ...baseRiveMock,
      cleanup: cleanupMock,
    };

    // @ts-ignore
    mocked(rive.Rive).mockImplementation(() => riveMock);

    const canvasSpy = document.createElement('canvas');
    const { result, unmount } = renderHook(() => useRive(params));

    await act(async () => {
      result.current.setCanvasRef(canvasSpy);
    });
    await waitFor(() => {
      expect(result.current.canvas).toBe(canvasSpy);
    });
    await act(async () => {
      controlledRiveloadCb();
    });

    unmount();

    expect(cleanupMock).toBeCalled();
  });

  it('sets the bounds with the devicePixelRatio by default', async () => {
    const params = {
      src: 'file-src',
    };

    global.devicePixelRatio = 2;

    // @ts-ignore
    mocked(rive.Rive).mockImplementation(() => baseRiveMock);

    const canvasSpy = document.createElement('canvas');
    const containerSpy = document.createElement('div');
    jest.spyOn(containerSpy, 'clientWidth', 'get').mockReturnValue(100);
    jest.spyOn(containerSpy, 'clientHeight', 'get').mockReturnValue(100);

    const { result } = renderHook(() => useRive(params));

    await act(async () => {
      result.current.setCanvasRef(canvasSpy);
      result.current.setContainerRef(containerSpy);
    });
    await waitFor(() => {
      expect(result.current.canvas).toBe(canvasSpy);
    });
    await act(async () => {
      controlledRiveloadCb();
    });

    // Height and width should be 2* the width and height returned from containers
    // bounding rect
    expect(canvasSpy).toHaveAttribute('height', '200');
    expect(canvasSpy).toHaveAttribute('width', '200');

    // Style height and width should be the same as returned from containers
    // bounding rect
    expect(canvasSpy).toHaveAttribute('style', 'width: 100px; height: 100px;');
  });

  it('sets the bounds with a specified customDevicePixelRatio if one is set', async () => {
    const params = {
      src: 'file-src',
    };

    global.devicePixelRatio = 2;

    // @ts-ignore
    mocked(rive.Rive).mockImplementation(() => baseRiveMock);

    const canvasSpy = document.createElement('canvas');
    const containerSpy = document.createElement('div');
    jest.spyOn(containerSpy, 'clientWidth', 'get').mockReturnValue(100);
    jest.spyOn(containerSpy, 'clientHeight', 'get').mockReturnValue(100);

    const { result } = renderHook(() =>
      useRive(params, { customDevicePixelRatio: 1 })
    );

    await act(async () => {
      result.current.setCanvasRef(canvasSpy);
      result.current.setContainerRef(containerSpy);
    });
    await waitFor(() => {
      expect(result.current.canvas).toBe(canvasSpy);
    });
    await act(async () => {
      controlledRiveloadCb();
    });

    // Height and width should be 2* the width and height returned from containers
    // bounding rect
    expect(canvasSpy).toHaveAttribute('height', '100');
    expect(canvasSpy).toHaveAttribute('width', '100');

    // Style height and width should be the same as returned from containers
    // bounding rect
    expect(canvasSpy).toHaveAttribute('style', 'width: 100px; height: 100px;');
  });

  it('sets the a bounds without the devicePixelRatio if useDevicePixelRatio is false', async () => {
    const params = {
      src: 'file-src',
    };
    const opts = {
      useDevicePixelRatio: false,
    };

    // @ts-ignore
    mocked(rive.Rive).mockImplementation(() => baseRiveMock);

    const canvasSpy = document.createElement('canvas');
    const containerSpy = document.createElement('div');
    jest.spyOn(containerSpy, 'clientWidth', 'get').mockReturnValue(100);
    jest.spyOn(containerSpy, 'clientHeight', 'get').mockReturnValue(100);

    const { result } = renderHook(() => useRive(params, opts));

    await act(async () => {
      result.current.setCanvasRef(canvasSpy);
      result.current.setContainerRef(containerSpy);
    });
    await waitFor(() => {
      expect(result.current.canvas).toBe(canvasSpy);
    });
    await act(async () => {
      controlledRiveloadCb();
    });

    // Height and width should be same as containers bounding rect
    expect(canvasSpy).toHaveAttribute('height', '100');
    expect(canvasSpy).toHaveAttribute('width', '100');
  });

  it('uses artboard height to set bounds if fitCanvasToArtboardHeight is true', async () => {
    const params = {
      src: 'file-src',
    };
    const opts = {
      useDevicePixelRatio: false,
      fitCanvasToArtboardHeight: true,
    };

    const riveMock = {
      ...baseRiveMock,
      bounds: {
        maxX: 100,
        maxY: 50,
      },
    };

    // @ts-ignore
    mocked(rive.Rive).mockImplementation(() => riveMock);

    const canvasSpy = document.createElement('canvas');
    const containerSpy = document.createElement('div');
    jest.spyOn(containerSpy, 'clientWidth', 'get').mockReturnValue(100);
    jest.spyOn(containerSpy, 'clientHeight', 'get').mockReturnValue(100);

    const { result } = renderHook(() => useRive(params, opts));

    await act(async () => {
      result.current.setContainerRef(containerSpy);
      result.current.setCanvasRef(canvasSpy);
    });
    await waitFor(() => {
      expect(result.current.canvas).toBe(canvasSpy);
    });
    await act(async () => {
      controlledRiveloadCb();
    });

    // Height and width should be same as containers bounding rect
    expect(canvasSpy).toHaveAttribute('height', '50');
    expect(canvasSpy).toHaveAttribute('width', '100');

    // Container should have style set to height
    expect(containerSpy).toHaveAttribute('style', 'height: 50px;');
  });

  it('updates the playing animations when the animations param changes', async () => {
    const params = {
      src: 'file-src',
      animations: 'light',
    };

    const playMock = jest.fn();
    const stopMock = jest.fn();

    const riveMock = {
      ...baseRiveMock,
      stop: stopMock,
      play: playMock,
      animationNames: ['light'],
      isPlaying: true,
    };

    // @ts-ignore
    mocked(rive.Rive).mockImplementation(() => riveMock);

    const canvasSpy = document.createElement('canvas');

    const { result, rerender } = renderHook((params) => useRive(params), {
      initialProps: params,
    });

    await act(async () => {
      result.current.setCanvasRef(canvasSpy);
    });
    await waitFor(() => {
      expect(result.current.canvas).toBe(canvasSpy);
    });
    await act(async () => {
      controlledRiveloadCb();
    });

    rerender({
      src: 'file-src',
      animations: 'dark',
    });

    expect(stopMock).toBeCalledWith(['light']);
    expect(playMock).toBeCalledWith('dark');
  });

  it('updates the paused animation when the animations param changes if the animation is paused', async () => {
    const params = {
      src: 'file-src',
      animations: 'light',
    };

    const playMock = jest.fn();
    const pauseMock = jest.fn();
    const stopMock = jest.fn();

    const riveMock = {
      ...baseRiveMock,
      stop: stopMock,
      play: playMock,
      pause: pauseMock,
      animationNames: ['light'],
      isPlaying: false,
      isPaused: true,
    };

    // @ts-ignore
    mocked(rive.Rive).mockImplementation(() => riveMock);

    const canvasSpy = document.createElement('canvas');

    const { result, rerender } = renderHook((params) => useRive(params), {
      initialProps: params,
    });

    await act(async () => {
      result.current.setCanvasRef(canvasSpy);
    });
    await waitFor(() => {
      expect(result.current.canvas).toBe(canvasSpy);
    });
    await act(async () => {
      controlledRiveloadCb();
    });

    rerender({
      src: 'file-src',
      animations: 'dark',
    });

    expect(stopMock).toBeCalledWith(['light']);
    expect(pauseMock).toBeCalledWith('dark');
    expect(playMock).not.toBeCalled();
  });

  it('does not set styles if className is passed in for the canvas container', async () => {
    const params = {
      src: 'file-src',
    };

    // @ts-ignore
    mocked(rive.Rive).mockImplementation(() => baseRiveMock);

    const canvasSpy = document.createElement('canvas');
    const { result } = renderHook(() => useRive(params));

    await act(async () => {
      result.current.setCanvasRef(canvasSpy);
    });
    await waitFor(() => {
      expect(result.current.canvas).toBe(canvasSpy);
    });
    await act(async () => {
      controlledRiveloadCb();
    });

    const { RiveComponent: RiveTestComponent } = result.current;
    const { container } = render(
      <RiveTestComponent className="rive-test-clas" style={{ width: '50%' }} />
    );
    expect(container.firstChild).not.toHaveStyle('width: 50%');
  });

  it('has a canvas size of 0 by default', async () => {
    const params = {
      src: 'file-src',
    };

    // @ts-ignore
    mocked(rive.Rive).mockImplementation(() => baseRiveMock);

    const canvasSpy = document.createElement('canvas');
    const { result } = renderHook(() => useRive(params));

    await act(async () => {
      result.current.setCanvasRef(canvasSpy);
    });
    await waitFor(() => {
      expect(result.current.canvas).toBe(canvasSpy);
    });
    await act(async () => {
      controlledRiveloadCb();
    });

    const { RiveComponent: RiveTestComponent } = result.current;
    const { container } = render(<RiveTestComponent />);
    expect(container.querySelector('canvas')).toHaveStyle('width: 0');
  });

  it('sets the canvas width and height after calculating the container size', async () => {
    const params = {
      src: 'file-src',
    };

    global.devicePixelRatio = 2;

    // @ts-ignore
    mocked(rive.Rive).mockImplementation(() => baseRiveMock);

    const canvasSpy = document.createElement('canvas');
    const containerSpy = document.createElement('div');
    jest.spyOn(containerSpy, 'clientWidth', 'get').mockReturnValue(100);
    jest.spyOn(containerSpy, 'clientHeight', 'get').mockReturnValue(100);

    const { result } = renderHook(() => useRive(params));

    await act(async () => {
      result.current.setCanvasRef(canvasSpy);
      result.current.setContainerRef(containerSpy);
    });
    await waitFor(() => {
      expect(result.current.canvas).toBe(canvasSpy);
    });
    await act(async () => {
      controlledRiveloadCb();
    });

    expect(canvasSpy).toHaveStyle('height: 100px');
    expect(canvasSpy).toHaveStyle('width: 100px');
  });

  it('updates the canvas dimensions and size if there is a new canvas size calculation', async () => {
    const params = {
      src: 'file-src',
    };

    window.devicePixelRatio = 2;

    // @ts-ignore
    mocked(rive.Rive).mockImplementation(() => baseRiveMock);

    const canvasSpy = document.createElement('canvas');
    const containerSpy = document.createElement('div');
    jest.spyOn(containerSpy, 'clientWidth', 'get').mockReturnValue(100);
    jest.spyOn(containerSpy, 'clientHeight', 'get').mockReturnValue(100);

    const { result } = renderHook(() => useRive(params));

    await act(async () => {
      result.current.setCanvasRef(canvasSpy);
      result.current.setContainerRef(containerSpy);
      jest.spyOn(containerSpy, 'clientWidth', 'get').mockReturnValue(200);
      jest.spyOn(containerSpy, 'clientHeight', 'get').mockReturnValue(200);
    });
    await waitFor(() => {
      expect(result.current.canvas).toBe(canvasSpy);
    });
    await act(async () => {
      controlledRiveloadCb();
    });

    await act(async () => {
      containerSpy.dispatchEvent(new Event('resize'));
    });

    expect(canvasSpy).toHaveAttribute('width', '400');
    expect(canvasSpy).toHaveAttribute('height', '400');
  });

  it('prevents resizing if shouldResizeCanvasToContainer option is false', async () => {
    const params = {
      src: 'file-src',
    };
    const options = {
      shouldResizeCanvasToContainer: false,
    };

    window.devicePixelRatio = 2;

    // @ts-ignore
    mocked(rive.Rive).mockImplementation(() => baseRiveMock);

    const canvasSpy = document.createElement('canvas');
    canvasSpy.width = 200;
    canvasSpy.height = 200;
    const containerSpy = document.createElement('div');

    const { result } = renderHook(() => useRive(params, options));

    await act(async () => {
      result.current.setCanvasRef(canvasSpy);
      result.current.setContainerRef(containerSpy);
    });

    await waitFor(() => {
      expect(result.current.canvas).toBe(canvasSpy);
    });
    await act(async () => {
      controlledRiveloadCb();
    });

    await act(async () => {
      jest.spyOn(containerSpy, 'clientWidth', 'get').mockReturnValue(500);
      jest.spyOn(containerSpy, 'clientHeight', 'get').mockReturnValue(500);
      containerSpy.dispatchEvent(new Event('resize'));
    });

    expect(canvasSpy.width).toBe(200);
    expect(canvasSpy.height).toBe(200);
  });
});
