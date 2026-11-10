import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as Server from 'octane/server';
import { flushEffects, mount } from './_helpers.js';
import { loadCompiledFixtureSource } from './_server-fixture.js';
import {
	RenderingPhase,
	flushLayoutSync,
	flushSync,
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

const source = `
import { flushSync, useEffect, useLayoutEffect, useLayoutSnapshot, useState } from 'octane';

export function Phases(props) @{
	const [count, setCount] = useState(0);
	props.expose(setCount);
	props.note('render');
	useLayoutEffect(() => {
		props.note('layout effect');
		return () => props.note('layout cleanup');
	}, null);
	useEffect(() => {
		props.note('passive effect');
		if (props.value === 'nested' && count === 0) {
			// A commit inside the passive drain, then the rest of the drain.
			flushSync(() => setCount(1));
			props.note('passive after nested commit');
		}
		return () => props.note('passive cleanup');
	}, null);
	const measured = useLayoutSnapshot(
		() => {
			props.note('measurement');
			return props.value;
		},
		{ initial: 'initial' },
	);
	<div>
		<button
			ref={(element) => props.note(element ? 'ref attach' : 'ref detach')}
			onClick={() => props.note('click')}
		>
			{(measured + ' ' + count) as string}
		</button>
		<phase-probe data-value={props.value} data-count={count} />
	</div>
}
`;

// A custom element reacts while the commit applies its DOM mutations, before
// any ref or effect runs.
let noteMutation: (label: string) => void = () => {};
customElements.define(
	'phase-probe',
	class extends HTMLElement {
		static observedAttributes = ['data-value', 'data-count'];
		attributeChangedCallback(_name: string, previous: string | null) {
			if (previous !== null) noteMutation('mutation');
		}
	},
);

describe.each([true, false])('the phase of a commit (dev: %s)', (dev) => {
	const { Phases } = loadCompiledFixtureSource(source, {
		id: '/packages/octane/tests/_fixtures/layout-phases.tsrx',
		mode: 'client',
		compileOptions: { dev, hmr: false },
	});

	/** Mount Phases, recording the phases each kind of callback ran in. */
	function mountPhases() {
		const seen = new Map<string, Set<string>>();
		let setCount: (count: number) => void = () => {};
		const props = (value: string) => ({
			value,
			note(label: string) {
				let phases = seen.get(label);
				if (phases === undefined) seen.set(label, (phases = new Set()));
				phases.add(NAMES[getPhase()]);
			},
			expose(set: (count: number) => void) {
				setCount = set;
			},
		});
		const view = mount(Phases, props('first'));
		noteMutation = props('').note;
		return {
			view,
			seen,
			phasesOf: (label: string) => [...(seen.get(label) ?? [])],
			update: (value: string) => view.update(Phases, props(value)),
			setCount: (count: number) => setCount(count),
		};
	}

	it('reports WRITE for refs and layout effects, READ for measurements, IDLE elsewhere', () => {
		const { view, seen, phasesOf, update } = mountPhases();
		try {
			expect(view.find('button').textContent).toBe('first 0');
			flushEffects();
			// A second and third commit run every cleanup, and follow a passive
			// drain and a measurement pass that must each have ended their phase.
			update('second');
			flushEffects();
			update('third');
			flushEffects();
			(view.find('button') as HTMLButtonElement).click();
			expect(view.find('button').textContent).toBe('third 0');

			expect(phasesOf('mutation')).toEqual(['WRITE']);
			expect(phasesOf('ref attach')).toEqual(['WRITE']);
			expect(phasesOf('layout effect')).toEqual(['WRITE']);
			expect(phasesOf('layout cleanup')).toEqual(['WRITE']);
			expect(phasesOf('measurement')).toEqual(['READ']);
			expect(phasesOf('passive effect')).toEqual(['IDLE']);
			expect(phasesOf('passive cleanup')).toEqual(['IDLE']);
			expect(phasesOf('click')).toEqual(['IDLE']);
			expect(phasesOf('render')).toEqual(['IDLE']);
			expect(getPhase()).toBe(RenderingPhase.IDLE);
		} finally {
			view.unmount();
		}
		// Unmounting the root removes the tree, so its teardown is a write too.
		expect(phasesOf('ref detach')).toEqual(['WRITE']);
		expect(phasesOf('layout cleanup')).toEqual(['WRITE']);
		expect(getPhase()).toBe(RenderingPhase.IDLE);
	});

	it('reports WRITE for a commit nested in a passive effect, and IDLE around it', () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const { view, seen, phasesOf, update } = mountPhases();
		try {
			flushEffects();
			seen.clear();
			update('nested');
			flushEffects();
			expect(view.find('button').textContent).toBe('nested 1');
			expect(phasesOf('mutation')).toEqual(['WRITE']);
			expect(phasesOf('passive after nested commit')).toEqual(['IDLE']);
			expect(phasesOf('passive effect')).toEqual(['IDLE']);
			expect(phasesOf('layout effect')).toEqual(['WRITE']);
			expect(phasesOf('ref attach')).toEqual(['WRITE']);
			expect(phasesOf('measurement')).toEqual(['READ']);
		} finally {
			view.unmount();
		}
	});

	it('reports the queue phase from a queued task', () => {
		const { view } = mountPhases();
		try {
			const log: string[] = [];
			readLayout(() => log.push(NAMES[getPhase()]));
			writeLayout(() => log.push(NAMES[getPhase()]));
			flushLayoutSync();
			expect(log).toEqual(['READ', 'WRITE']);
		} finally {
			view.unmount();
		}
	});

	it('does not commit a flushSync from a queued read until the queue has run', async () => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		const { view, setCount } = mountPhases();
		try {
			const button = view.find('button');
			const log: string[] = [];
			readLayout(() => {
				flushSync(() => setCount(1));
				log.push(`read 1: ${button.textContent}`);
			});
			readLayout(() => log.push(`read 2: ${button.textContent}`));
			writeLayout(() => log.push(`write: ${button.textContent}`));
			flushLayoutSync();
			expect(log).toEqual(['read 1: first 0', 'read 2: first 0', 'write: first 0']);
			if (process.env['OCTANE_TEST_COMPILE_MODE'] !== 'prod') {
				expect(error).toHaveBeenCalledWith(expect.stringContaining('from a readLayout task'));
			}

			await Promise.resolve();
			expect(button.textContent).toBe('first 1');

			// Outside the queue, flushSync still commits before it returns.
			flushSync(() => setCount(2));
			expect(button.textContent).toBe('first 2');
		} finally {
			view.unmount();
		}
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
