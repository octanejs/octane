import { scheduleBind } from '../src/bindScheduler';

// bindScheduler only imports Rive as a type; no runtime canvas dependency.
jest.mock('@rive-app/canvas', () => ({}));

// queueMicrotask callbacks drain before an awaited resolved promise.
const flushMicrotasks = () => Promise.resolve();

function makeRive() {
  return { bind: jest.fn() } as any;
}

describe('scheduleBind', () => {
  it('does not bind synchronously; coalesces same-tick calls into one bind()', async () => {
    const rive = makeRive();

    scheduleBind(rive);
    scheduleBind(rive);
    scheduleBind(rive);
    expect(rive.bind).not.toHaveBeenCalled();

    await flushMicrotasks();
    expect(rive.bind).toHaveBeenCalledTimes(1);
  });

  it('binds each Rive instance independently', async () => {
    const a = makeRive();
    const b = makeRive();

    scheduleBind(a);
    scheduleBind(b);
    await flushMicrotasks();

    expect(a.bind).toHaveBeenCalledTimes(1);
    expect(b.bind).toHaveBeenCalledTimes(1);
  });

  it('schedules a fresh bind after the microtask has flushed', async () => {
    const rive = makeRive();

    scheduleBind(rive);
    await flushMicrotasks();
    scheduleBind(rive);
    await flushMicrotasks();

    expect(rive.bind).toHaveBeenCalledTimes(2);
  });
});
