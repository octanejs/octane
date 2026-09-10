// @vitest-environment node

import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { build } from 'esbuild';
import { expect, it } from 'vitest';

it('releases a removed selector while another host shares its source', async () => {
	const source = `
import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers/promises';
import {
  createObjectContainer,
  createObjectDriver,
  createUniversalRoot,
  defineUniversalComponent,
  flushUniversalSync,
  universalHostBinding,
  universalPlan,
  universalValue,
} from 'octane/universal/native';

let current = 0;
const listeners = new Set();
const source = {
  get() { return current; },
  subscribe(notify) {
    listeners.add(notify);
    return () => listeners.delete(notify);
  },
  set(value) {
    current = value;
    for (const notify of [...listeners]) notify();
  },
};
const plan = universalPlan('object', {
  kind: 'host',
  type: 'row',
  bindings: [['active', 0]],
});
const survivingBinding = universalHostBinding(source, value => value);
let removedSelectorCapture;
const Scene = defineUniversalComponent('object', ({ includeFirst }) => [
  includeFirst ? (() => {
    const capture = { offset: 0, payload: new Uint8Array(1024 * 1024) };
    removedSelectorCapture = new WeakRef(capture);
    return universalValue(plan, [
      universalHostBinding(source, value => value + capture.offset),
    ], 'first');
  })() : null,
  universalValue(plan, [survivingBinding], 'second'),
]);

const container = createObjectContainer();
const root = createUniversalRoot(container, createObjectDriver());
root.render(Scene, { includeFirst: true });
assert.equal(listeners.size, 1);
const survivor = container.children[1];
root.render(Scene, { includeFirst: false });
assert.deepEqual(container.children, [survivor]);
assert.equal(listeners.size, 1);

// Move to another turn before collecting an object only held by a WeakRef.
await setImmediate();
for (let attempt = 0; attempt < 5; attempt++) {
  gc();
  await setImmediate();
}
assert.equal(removedSelectorCapture.deref() === undefined, true,
  'a removed selector remains reachable while a shared source is subscribed');
flushUniversalSync(() => source.set(2));
assert.equal(survivor.props.active, 2);
root.unmount();
assert.equal(listeners.size, 0);
`;
	const result = await build({
		stdin: {
			contents: source,
			resolveDir: resolve(import.meta.dirname, '..'),
			sourcefile: 'native-host-binding-retention-consumer.mjs',
		},
		bundle: true,
		define: { __OCTANE_PROFILE_ENABLED__: 'false' },
		format: 'esm',
		minify: true,
		platform: 'node',
		target: 'node22',
		write: false,
	});
	const directory = mkdtempSync(join(tmpdir(), 'octane-native-host-binding-retention-'));
	try {
		const entry = join(directory, 'consumer.mjs');
		writeFileSync(entry, result.outputFiles[0].text);
		const run = spawnSync(process.execPath, ['--expose-gc', entry], {
			encoding: 'utf8',
			timeout: 30_000,
		});
		expect(run.error).toBeUndefined();
		expect(run.status, run.stderr).toBe(0);
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
});
