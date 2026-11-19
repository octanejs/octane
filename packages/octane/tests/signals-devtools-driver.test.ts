import { describe, expect, it } from 'vitest';
import { createScope } from 'octane/signals';
import type { Block, Scope } from '../src/runtime';
import { createNativeReadDriver, rebaseNativeRead } from '../src/signals/native-read-client';
import {
	reportNativeRead,
	setNativeReadObserver,
	type NativeReadSource,
} from '../src/signals/read-protocol';

// This unit supplies only the host's ownership/capture boundary. Reads and
// source metadata come from the real engine; runtime traversal is exercised
// separately by signals-devtools.test.tsrx.
function harness() {
	const block = { disposed: false } as Block;
	const scope = { block } as Scope;
	const cleanups: Array<() => void> = [];
	let current: object = {};
	let scheduled = 0;
	const driver = createNativeReadDriver({
		capture: () => current,
		cleanup: (_scope, dispose) => cleanups.push(dispose),
		schedule: () => {
			scheduled++;
		},
		suspended: () => {},
		replayRefs: () => false,
		refDisposed: () => false,
	});
	/** One completed render of the scope into `capture`. */
	const render = (capture: object, read: () => void) => {
		current = capture;
		driver.beginRender(block);
		const token = driver.beginScope(scope, block);
		try {
			read();
		} finally {
			driver.endScope(token);
			driver.endRender(block, true, false);
		}
	};
	return { driver, block, scope, cleanups, render, scheduled: () => scheduled };
}

describe('native read inspection records', () => {
	it('keeps accepted and pending records separate without evaluating unobserved sources', () => {
		const data = createScope({ scopeKey: 'inspection-records' });
		const left$ = data.signal$('left', 1);
		const right$ = data.signal$('right', 2);
		let evaluations = 0;
		data.derived$('unused', () => {
			evaluations++;
			return 'secret';
		});
		const { driver, scope, cleanups, render, scheduled } = harness();
		let capture = {};
		try {
			render(capture, () => {
				left$.get();
			});
			const pending = driver.inspectScope!(scope)!;
			expect(pending.committed).toBeNull();
			expect(pending.pending[0].reads[0].source).toMatchObject({ key: 'left', status: 'ready' });
			driver.acceptCapture(capture);
			capture = {};
			render(capture, () => {
				right$.get();
			});
			const next = driver.inspectScope!(scope)!;
			expect(next.committed?.reads[0].source?.key).toBe('left');
			expect(next.pending[0].reads[0].source?.key).toBe('right');
			expect(evaluations).toBe(0);
			driver.discardCapture(capture);
			expect(driver.inspectScope!(scope)?.pending).toEqual([]);
			left$.set(3);
			expect(scheduled()).toBeGreaterThan(0);
			const accepted = driver.inspectScope!(scope)!.committed!.reads[0];
			expect(accepted.observedVersion).toBeLessThan(accepted.currentVersion);
			expect(evaluations).toBe(0);
			for (const cleanup of cleanups) cleanup();
			expect(driver.inspectScope!(scope)).toBeNull();
			expect(data.inspect().nodes.map((node) => node.subscribers)).toEqual([0, 0, 0]);
		} finally {
			for (const cleanup of cleanups) cleanup();
			data.dispose();
		}
	});
});

describe('native read attempts', () => {
	it('keeps accepted subscriptions and versions through discarded and concurrent attempts', () => {
		const data = createScope({ scopeKey: 'inspection-attempts' });
		const left$ = data.signal$('left', 1);
		const right$ = data.signal$('right', 2);
		const { driver, scope, cleanups, render, scheduled } = harness();
		const subscribers = () => data.inspect().nodes.map((node) => node.subscribers);
		const both = () => {
			left$.get();
			right$.get();
		};
		const attempt = (read: () => void) => {
			const capture = {};
			render(capture, read);
			return capture;
		};
		try {
			driver.acceptCapture(attempt(both));
			expect(subscribers()).toEqual([1, 1]);

			// A discarded attempt read both sources again, one at a newer version.
			left$.set(2);
			driver.discardCapture(attempt(both));
			expect(subscribers()).toEqual([1, 1]);
			expect(
				driver.inspectScope!(scope)!.committed!.reads.map(
					(read) => read.currentVersion - read.observedVersion! > 0,
				),
			).toEqual([true, false]);

			// A capture keeps one attempt per consumer: a later render into it
			// replaces the earlier one, whose stale read no longer counts.
			const repeated = attempt(both);
			right$.set(3);
			render(repeated, both);
			expect(driver.validateCapture(repeated)).toBe(true);
			driver.acceptCapture(repeated);
			expect(subscribers()).toEqual([1, 1]);

			// An attempt that stops reading `right` is accepted while another
			// that still reads it is pending.
			let held = attempt(both);
			driver.acceptCapture(attempt(() => left$.get()));
			expect(subscribers()).toEqual([1, 1]);
			const before = scheduled();
			right$.set(4);
			expect(scheduled()).toBeGreaterThan(before);
			expect(driver.validateCapture(held)).toBe(false);
			driver.discardCapture(held);
			expect(subscribers()).toEqual([1, 0]);

			// The pending attempt is accepted after the one that passed it.
			held = attempt(both);
			driver.acceptCapture(attempt(() => left$.get()));
			expect(driver.validateCapture(held)).toBe(true);
			driver.acceptCapture(held);
			expect(subscribers()).toEqual([1, 1]);
			const accepted = scheduled();
			right$.set(5);
			expect(scheduled()).toBeGreaterThan(accepted);

			for (const cleanup of cleanups) cleanup();
			expect(subscribers()).toEqual([0, 0]);
		} finally {
			for (const cleanup of cleanups) cleanup();
			data.dispose();
		}
	});

	it('rejects an attempt that saw one source at two revisions', () => {
		const { driver, cleanups, render } = harness();
		const source: NativeReadSource = { getVersion: () => 1, subscribe: () => () => {} };
		const read = () => reportNativeRead(source, 1);
		// Its first read is still current, but the output also holds another revision.
		const twice = () => {
			read();
			reportNativeRead(source, 2);
		};
		try {
			for (const committed of [false, true]) {
				const mixed = {};
				render(mixed, twice);
				expect(driver.validateCapture(mixed)).toBe(false);
				driver.discardCapture(mixed);
				if (committed) break;
				const clean = {};
				render(clean, read);
				expect(driver.validateCapture(clean)).toBe(true);
				driver.acceptCapture(clean);
			}
		} finally {
			for (const cleanup of cleanups) cleanup();
		}
	});

	it('releases the reads of a render that never ended when its ancestor fails', () => {
		const data = createScope({ scopeKey: 'inspection-abandoned' });
		const left$ = data.signal$('left', 1);
		const right$ = data.signal$('right', 2);
		const { driver, block, scope, cleanups } = harness();
		const child = { disposed: false } as Block;
		try {
			driver.beginRender(block);
			const token = driver.beginScope(scope, block);
			left$.get();
			// An exhausted native stack can stop a descendant before it ends.
			driver.beginRender(child);
			driver.beginScope({ block: child } as Scope, child);
			right$.get();
			expect(data.inspect().nodes.map((node) => node.subscribers)).toEqual([1, 1]);
			driver.endScope(token);
			driver.endRender(block, false, false);
			expect(data.inspect().nodes.map((node) => node.subscribers)).toEqual([0, 0]);
		} finally {
			for (const cleanup of cleanups) cleanup();
			data.dispose();
		}
	});

	it('demotes a hydrated live dependency while a transition still retains it', () => {
		const data = createScope({ scopeKey: 'watched-rebase-transition' });
		const log: string[] = [];
		const watched = (name: string) => () => {
			log.push(`watch ${name}`);
			return () => log.push(`unwatch ${name}`);
		};
		const left$ = data.signal$('left', 'left', { watched: watched('left') });
		const right$ = data.signal$('right', 'right', { watched: watched('right') });
		let live!: NativeReadSource;
		const previous = setNativeReadObserver((source) => (live = source));
		try {
			left$.get();
		} finally {
			setNativeReadObserver(previous);
		}
		let notify!: () => void;
		const historical: NativeReadSource = {
			getVersion: () => 1,
			subscribe(next) {
				notify = next;
				return () => {};
			},
		};
		const { driver, cleanups, render } = harness();
		const attempt = (read: () => void) => {
			const capture = {};
			render(capture, read);
			return capture;
		};
		try {
			driver.acceptCapture(attempt(() => reportNativeRead(historical, 1)));
			expect(
				rebaseNativeRead(notify, {
					historical,
					binding: false,
					successor: () => ({ live, version: live.getVersion() }),
				}),
			).toBe(true);
			expect([...log]).toEqual(['watch left']);
			const held = attempt(() => left$.get());
			driver.acceptCapture(attempt(() => right$.get()));
			expect([...log].sort()).toEqual(['watch left', 'unwatch left', 'watch right'].sort());
			driver.discardCapture(held);
			expect([...log].sort()).toEqual(['watch left', 'unwatch left', 'watch right'].sort());
		} finally {
			for (const cleanup of cleanups) cleanup();
			data.dispose();
		}
		expect([...log].sort()).toEqual(
			['watch left', 'unwatch left', 'watch right', 'unwatch right'].sort(),
		);
	});

	it('moves a released historical read to its live successor unless an attempt shares it', () => {
		const { driver, cleanups, render } = harness();
		const source = (version: number) => {
			const entry = {
				subscribers: 0,
				notify: undefined as (() => void) | undefined,
				getVersion: () => version,
				subscribe(notify: () => void) {
					entry.subscribers++;
					entry.notify = notify;
					return () => {
						entry.subscribers--;
					};
				},
			};
			return entry satisfies NativeReadSource;
		};
		const historical = source(1);
		const live = source(7);
		const release = { historical, binding: false, successor: () => ({ live, version: 7 }) };
		const subscribers = () => [historical.subscribers, live.subscribers];
		const attempt = (read: NativeReadSource) => {
			const capture = {};
			render(capture, () => reportNativeRead(read, read.getVersion()));
			return capture;
		};
		try {
			driver.acceptCapture(attempt(historical));
			// A pending attempt read it too, so the consumer renders again instead.
			const held = attempt(historical);
			expect(rebaseNativeRead(historical.notify!, release)).toBe(false);
			expect(subscribers()).toEqual([1, 0]);
			driver.discardCapture(held);
			expect(subscribers()).toEqual([1, 0]);

			expect(rebaseNativeRead(historical.notify!, release)).toBe(true);
			expect(subscribers()).toEqual([0, 1]);
			const moved = attempt(live);
			expect(driver.validateCapture(moved)).toBe(true);
			driver.acceptCapture(moved);
			expect(subscribers()).toEqual([0, 1]);
			for (const cleanup of cleanups) cleanup();
			expect(subscribers()).toEqual([0, 0]);
		} finally {
			for (const cleanup of cleanups) cleanup();
		}
	});
});
