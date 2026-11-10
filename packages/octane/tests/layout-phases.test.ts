import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as Server from 'octane/server';
import {
	RenderingPhase,
	flushLayoutSync,
	getPhase,
	readLayout,
	writeLayout,
} from '../src/index.js';

const NAMES = ['IDLE', 'READ', 'WRITE'];

/** Queue tasks that log their label and the phase they ran in. */
function logging() {
	const log: string[] = [];
	const task = (label: string, then?: () => void) => () => {
		log.push(`${label}:${NAMES[getPhase()]}`);
		then?.();
	};
	return { log, task };
}

/** Replace the frame clock with one the test steps by hand. */
function fakeFrames() {
	let frames: Array<() => void> = [];
	const request = vi.fn((callback: () => void) => {
		frames.push(callback);
		return frames.length;
	});
	vi.stubGlobal('requestAnimationFrame', request);
	return {
		request,
		frame() {
			const due = frames;
			frames = [];
			for (const callback of due) callback();
		},
	};
}

let frames: ReturnType<typeof fakeFrames>;

beforeEach(() => {
	frames = fakeFrames();
});

afterEach(() => {
	// Leave no queued work or armed frame for the next test.
	frames.frame();
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe('layout read and write phases', () => {
	it('runs every read before every write, whatever the queue order', () => {
		const { log, task } = logging();
		writeLayout(task('write 1'));
		readLayout(task('read 1'));
		writeLayout(task('write 2'));
		readLayout(task('read 2'));
		expect(log).toEqual([]);
		expect(getPhase()).toBe(RenderingPhase.IDLE);

		flushLayoutSync();
		expect(log).toEqual(['read 1:READ', 'read 2:READ', 'write 1:WRITE', 'write 2:WRITE']);
		expect(getPhase()).toBe(RenderingPhase.IDLE);
	});

	it('runs a write queued by a read in the same flush, after the other reads', () => {
		const { log, task } = logging();
		readLayout(task('read 1', () => writeLayout(task('write 1'))));
		readLayout(task('read 2', () => writeLayout(task('write 2'))));
		flushLayoutSync();
		expect(log).toEqual(['read 1:READ', 'read 2:READ', 'write 1:WRITE', 'write 2:WRITE']);
	});

	it('runs a read queued by a write in a second pass of the same flush', () => {
		const { log, task } = logging();
		writeLayout(task('write', () => readLayout(task('read again'))));
		readLayout(task('read'));
		flushLayoutSync();
		expect(log).toEqual(['read:READ', 'write:WRITE', 'read again:READ']);
	});

	it('runs queued work in the next frame, with one frame for any number of tasks', () => {
		const { log, task } = logging();
		readLayout(task('read'));
		readLayout(task('read 2'));
		writeLayout(task('write'));
		expect(frames.request).toHaveBeenCalledTimes(1);
		expect(log).toEqual([]);

		frames.frame();
		expect(log).toEqual(['read:READ', 'read 2:READ', 'write:WRITE']);

		// Reads alone still run: nothing waits for a write to arrive.
		readLayout(task('later read'));
		expect(frames.request).toHaveBeenCalledTimes(2);
		frames.frame();
		expect(log.at(-1)).toBe('later read:READ');
	});

	it('keeps one frame armed across a manual flush', () => {
		const { log, task } = logging();
		readLayout(task('read'));
		flushLayoutSync();
		expect(log).toEqual(['read:READ']);

		readLayout(task('read 2'));
		expect(frames.request).toHaveBeenCalledTimes(1);
		frames.frame();
		expect(log).toEqual(['read:READ', 'read 2:READ']);
	});

	it('uses a host task when the page is hidden', async () => {
		vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
		const { log, task } = logging();
		readLayout(task('read'));
		expect(frames.request).not.toHaveBeenCalled();
		await vi.waitFor(() => expect(log).toEqual(['read:READ']));
	});

	it('does not run cancelled work, including work cancelled earlier in its batch', () => {
		const { log, task } = logging();
		const cancelRead = readLayout(task('cancelled read'));
		const cancelWrite = writeLayout(task('cancelled write'));
		let cancelLater = () => {};
		readLayout(task('read', () => cancelLater()));
		cancelLater = readLayout(task('cancelled by read'));
		cancelRead();
		cancelWrite();
		flushLayoutSync();
		expect(log).toEqual(['read:READ']);
	});

	it('finishes the batch when a task throws, then rethrows the first error', () => {
		const { log, task } = logging();
		readLayout(() => {
			throw new Error('first');
		});
		readLayout(task('read'));
		writeLayout(() => {
			throw new Error('second');
		});
		writeLayout(task('write'));
		expect(() => flushLayoutSync()).toThrow('first');
		expect(log).toEqual(['read:READ', 'write:WRITE']);
		expect(getPhase()).toBe(RenderingPhase.IDLE);

		// The queue still works afterwards.
		readLayout(task('read after'));
		flushLayoutSync();
		expect(log.at(-1)).toBe('read after:READ');
	});

	it('ignores a nested flush and keeps the running phase', () => {
		const { log, task } = logging();
		writeLayout(
			task('write', () => {
				readLayout(task('read queued in write'));
				flushLayoutSync();
				log.push(`after nested flush:${NAMES[getPhase()]}`);
			}),
		);
		flushLayoutSync();
		expect(log).toEqual(['write:WRITE', 'after nested flush:WRITE', 'read queued in write:READ']);
	});

	it('stops a read and write that keep queueing each other and resumes next frame', () => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		let reads = 0;
		const read = () => {
			reads++;
			writeLayout(write);
		};
		const write = () => {
			if (reads < 120) readLayout(read);
		};
		readLayout(read);
		frames.frame();
		expect(reads).toBe(50);
		if (process.env['OCTANE_TEST_COMPILE_MODE'] !== 'prod') {
			expect(error).toHaveBeenCalledWith(expect.stringContaining('did not settle after 50 passes'));
		}

		frames.frame();
		expect(reads).toBe(100);
		frames.frame();
		expect(reads).toBe(120);
		expect(getPhase()).toBe(RenderingPhase.IDLE);
	});
});

describe('layout phases on the server', () => {
	it('never runs queued work and stays idle', () => {
		const task = vi.fn();
		const cancelRead = Server.readLayout(task);
		const cancelWrite = Server.writeLayout(task);
		Server.flushLayoutSync();
		cancelRead();
		cancelWrite();
		expect(task).not.toHaveBeenCalled();
		expect(Server.getPhase()).toBe(Server.RenderingPhase.IDLE);
	});
});
