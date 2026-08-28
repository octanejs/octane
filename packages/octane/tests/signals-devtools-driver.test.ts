import { describe, expect, it } from 'vitest';
import { createScope } from 'octane/signals';
import type { Block, Scope } from '../src/runtime';
import { createNativeReadDriver } from '../src/signals/native-read-client';

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
		// This unit supplies only the host's ownership/capture boundary. Reads
		// and source metadata come from the real engine; runtime traversal is
		// exercised separately by signals-devtools.test.tsrx.
		const block = { disposed: false } as Block;
		const scope = { block } as Scope;
		const cleanups: Array<() => void> = [];
		let capture: object = {};
		let scheduled = 0;
		const driver = createNativeReadDriver({
			capture: () => capture,
			cleanup: (_scope, dispose) => cleanups.push(dispose),
			schedule: () => {
				scheduled++;
			},
			suspended: () => {},
		});
		const render = (read: () => void) => {
			driver.beginRender(block);
			const token = driver.beginScope(scope, block);
			try {
				read();
			} finally {
				driver.endScope(token);
				driver.endRender(block, true, false);
			}
		};
		try {
			render(() => {
				left$.get();
			});
			const pending = driver.inspectScope(scope)!;
			expect(pending.committed).toBeNull();
			expect(pending.pending[0].reads[0].source).toMatchObject({ key: 'left', status: 'ready' });
			driver.acceptCapture(capture);
			capture = {};
			render(() => {
				right$.get();
			});
			const next = driver.inspectScope(scope)!;
			expect(next.committed?.reads[0].source?.key).toBe('left');
			expect(next.pending[0].reads[0].source?.key).toBe('right');
			expect(evaluations).toBe(0);
			driver.discardCapture(capture);
			expect(driver.inspectScope(scope)?.pending).toEqual([]);
			left$.set(3);
			expect(scheduled).toBeGreaterThan(0);
			const accepted = driver.inspectScope(scope)!.committed!.reads[0];
			expect(accepted.observedVersion).toBeLessThan(accepted.currentVersion);
			expect(evaluations).toBe(0);
			for (const cleanup of cleanups) cleanup();
			expect(driver.inspectScope(scope)).toBeNull();
			expect(data.inspect().nodes.map((node) => node.subscribers)).toEqual([0, 0, 0]);
		} finally {
			for (const cleanup of cleanups) cleanup();
			data.dispose();
		}
	});
});
