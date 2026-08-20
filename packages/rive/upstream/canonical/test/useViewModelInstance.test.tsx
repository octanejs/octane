import { renderHook } from '@testing-library/react';

import useViewModelInstance from '../src/hooks/useViewModelInstance';
import { scheduleBind } from '../src/bindScheduler';

jest.mock('@rive-app/canvas', () => ({}));
jest.mock('../src/bindScheduler', () => ({ scheduleBind: jest.fn() }));

const mockScheduleBind = scheduleBind as jest.Mock;

const makeViewModel = (defaultInstance: unknown) =>
  ({ defaultInstance: jest.fn(() => defaultInstance) } as any);

const makeRive = (overrides: Record<string, unknown> = {}) =>
  ({ viewModelInstance: null, setViewModelInstance: jest.fn(), ...overrides } as any);

beforeEach(() => jest.clearAllMocks());

describe('useViewModelInstance binding', () => {
  it('sets the main instance and schedules a coalesced bind when rive is passed', () => {
    const instance = { name: 'default' };
    const vm = makeViewModel(instance);
    const rive = makeRive();

    renderHook(() => useViewModelInstance(vm, { rive }));

    expect(rive.setViewModelInstance).toHaveBeenCalledWith(instance);
    expect(mockScheduleBind).toHaveBeenCalledWith(rive);
  });

  it('does not bind when no rive is passed', () => {
    const vm = makeViewModel({ name: 'default' });
    renderHook(() => useViewModelInstance(vm));
    expect(mockScheduleBind).not.toHaveBeenCalled();
  });

  it('does not re-set/bind when the resolved instance is already the same as the bound main', () => {
    const instance = { name: 'default' };
    const vm = makeViewModel(instance);
    const rive = makeRive({ viewModelInstance: instance });

    renderHook(() => useViewModelInstance(vm, { rive }));

    expect(rive.setViewModelInstance).not.toHaveBeenCalled();
    expect(mockScheduleBind).not.toHaveBeenCalled();
  });
});
