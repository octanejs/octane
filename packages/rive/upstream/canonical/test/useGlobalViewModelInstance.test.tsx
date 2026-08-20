import { renderHook } from '@testing-library/react';

import useGlobalViewModelInstance from '../src/hooks/useGlobalViewModelInstance';
import { scheduleBind } from '../src/bindScheduler';

jest.mock('@rive-app/canvas', () => ({}));
jest.mock('../src/bindScheduler', () => ({ scheduleBind: jest.fn() }));

const mockScheduleBind = scheduleBind as jest.Mock;

const makeInstance = (name: string) => ({ name } as any);

function makeViewModel(overrides: Record<string, unknown> = {}) {
  return {
    name: 'VM',
    defaultInstance: jest.fn(() => makeInstance('default')),
    instance: jest.fn(() => makeInstance('new')),
    instanceByName: jest.fn((n: string) => makeInstance(n)),
    ...overrides,
  } as any;
}

function makeRive(overrides: Record<string, unknown> = {}) {
  return {
    setGlobalViewModelInstance: jest.fn(() => true),
    viewModelByName: jest.fn(() => makeViewModel()),
    ...overrides,
  } as any;
}

beforeEach(() => jest.clearAllMocks());

describe('useGlobalViewModelInstance', () => {
  it('returns null when there is nothing to resolve from', () => {
    const { result } = renderHook(() =>
      useGlobalViewModelInstance(null, 'Colors')
    );
    expect(result.current).toBeNull();
  });

  it('resolves the default instance with no resolution param', () => {
    const vm = makeViewModel();
    const { result } = renderHook(() =>
      useGlobalViewModelInstance(vm, 'Colors')
    );
    expect(vm.defaultInstance).toHaveBeenCalled();
    expect(result.current).toEqual({ name: 'default' });
  });

  it('resolves a new instance with { useNew }', () => {
    const vm = makeViewModel();
    const { result } = renderHook(() =>
      useGlobalViewModelInstance(vm, 'Colors', { useNew: true })
    );
    expect(vm.instance).toHaveBeenCalled();
    expect(result.current).toEqual({ name: 'new' });
  });

  it('resolves a named instance with { instanceName }', () => {
    const vm = makeViewModel();
    const { result } = renderHook(() =>
      useGlobalViewModelInstance(vm, 'Colors', { instanceName: 'Blue' })
    );
    expect(vm.instanceByName).toHaveBeenCalledWith('Blue');
    expect(result.current).toEqual({ name: 'Blue' });
  });

  it('registers the instance and schedules a bind when rive is provided', () => {
    const vm = makeViewModel();
    const rive = makeRive();
    renderHook(() => useGlobalViewModelInstance(vm, 'Colors', { rive }));
    expect(rive.setGlobalViewModelInstance).toHaveBeenCalledWith(
      'Colors',
      expect.objectContaining({ name: 'default' })
    );
    expect(mockScheduleBind).toHaveBeenCalledWith(rive);
  });

  it('does not schedule a bind when the name is not a global (set returns false)', () => {
    const vm = makeViewModel();
    const rive = makeRive({ setGlobalViewModelInstance: jest.fn(() => false) });
    renderHook(() => useGlobalViewModelInstance(vm, 'NotAGlobal', { rive }));
    expect(mockScheduleBind).not.toHaveBeenCalled();
  });

  it('registers a caller-supplied instance directly, without fetching a view model', () => {
    const rive = makeRive();
    const external = makeInstance('external');
    renderHook(() =>
      useGlobalViewModelInstance(null, 'Colors', { rive, instance: external })
    );
    expect(rive.viewModelByName).not.toHaveBeenCalled();
    expect(rive.setGlobalViewModelInstance).toHaveBeenCalledWith(
      'Colors',
      external
    );
  });

  it('waits (no fetch, no register) when viewModel is null and no instance is supplied', () => {
    const rive = makeRive();
    const { result } = renderHook(() =>
      useGlobalViewModelInstance(null, 'Colors', { rive })
    );
    expect(result.current).toBeNull();
    expect(rive.viewModelByName).not.toHaveBeenCalled();
    expect(rive.setGlobalViewModelInstance).not.toHaveBeenCalled();
    expect(mockScheduleBind).not.toHaveBeenCalled();
  });
});
