import { mocked } from 'jest-mock';
import { renderHook } from '@testing-library/react';

import useStateMachineInput from '../src/hooks/useStateMachineInput';
import { Rive, StateMachineInput } from '@rive-app/canvas';

jest.mock('@rive-app/canvas', () => ({
  Rive: jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    stop: jest.fn(),
    stateMachineInputs: jest.fn(),
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

function getRiveMock({
  smiInputs,
}: {
  smiInputs?: null | StateMachineInput[];
} = {}) {
  const riveMock = new Rive({
    canvas: undefined as unknown as HTMLCanvasElement,
  });
  if (smiInputs) {
    riveMock.stateMachineInputs = jest.fn().mockReturnValue(smiInputs);
  }

  return riveMock;
}

describe('useStateMachineInput', () => {
  it('returns null if there is null rive object passed', () => {
    const { result } = renderHook(() => useStateMachineInput(null));
    expect(result.current).toBeNull();
  });

  it('returns null if there is no state machine name', () => {
    const riveMock = getRiveMock();

    mocked(Rive).mockImplementation(() => riveMock);

    const { result } = renderHook(() =>
      useStateMachineInput(riveMock, '', 'testInput')
    );
    expect(result.current).toBeNull();
  });

  it('returns null if there is no state machine input name', () => {
    const riveMock = getRiveMock();

    const { result } = renderHook(() =>
      useStateMachineInput(riveMock, 'smName', '')
    );
    expect(result.current).toBeNull();
  });

  it('returns null if there are no inputs for the state machine', () => {
    const riveMock = getRiveMock({ smiInputs: [] });

    mocked(Rive).mockImplementation(() => riveMock);

    const { result } = renderHook(() =>
      useStateMachineInput(riveMock as Rive, 'smName', '')
    );
    expect(result.current).toBeNull();
  });

  it('returns null if the input has no association to the inputs of the state machine', () => {
    const smInput = {
      name: 'boolInput',
    } as StateMachineInput;
    const riveMock = getRiveMock({ smiInputs: [smInput] });

    mocked(Rive).mockImplementation(() => riveMock);

    const { result } = renderHook(() =>
      useStateMachineInput(riveMock, 'smName', 'numInput')
    );
    expect(result.current).toBeNull();
  });

  it('returns a selected input if the input requested is part of the state machine', () => {
    const smInput = {
      name: 'boolInput',
    } as StateMachineInput;
    const riveMock = getRiveMock({ smiInputs: [smInput] });

    mocked(Rive).mockImplementation(() => riveMock);

    const { result } = renderHook(() =>
      useStateMachineInput(riveMock, 'smName', 'boolInput')
    );
    expect(result.current).toBe(smInput);
  });

  it('returns a selected input with an initial value if the input requested is part of the state machine', () => {
    const smInput = {
      name: 'boolInput',
      value: false,
    } as StateMachineInput;
    const riveMock = getRiveMock({ smiInputs: [smInput] });
    mocked(Rive).mockImplementation(() => riveMock);

    const { result } = renderHook(() =>
      useStateMachineInput(riveMock, 'smName', 'boolInput', true)
    );
    expect(result.current).toStrictEqual({
      ...smInput,
      value: true,
    });
  });
});
