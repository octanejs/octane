// @vitest-environment node

import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { build } from 'esbuild';
import { expect, it } from 'vitest';

it('releases skipped effect callbacks while their native tree remains mounted', async () => {
	const source = `
import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers/promises';
import {
  createObjectContainer,
  createObjectDriver,
  createUniversalRoot,
  defineUniversalComponent,
  universalComponent,
  universalPlan,
  universalValue,
  useEffect,
} from 'octane/universal/native';

const renderer = 'native-effect-retention';
const plan = universalPlan(renderer, {
  kind: 'host',
  type: 'view',
  bindings: [['version', 0]],
});
const eventPlan = universalPlan(renderer, {
  kind: 'host',
  type: 'view',
  bindings: [['version', 0], ['onPress', 1]],
});
async function checkEffectCallbackRetention(nested) {
  const container = createObjectContainer(renderer);
  const root = createUniversalRoot(container, createObjectDriver(renderer));
  let weakIntermediate;
  let creates = 0;
  let cleanups = 0;
  let presses = 0;
  const onPress = () => { presses++; };
  const View = defineUniversalComponent(renderer, ({ version }) => {
    const marker = { version };
    if (version === 1) weakIntermediate = new WeakRef(marker);
    useEffect(() => {
      creates++;
      return () => {
        assert.equal(marker.version, 0);
        cleanups++;
      };
    }, [], 'view-effect');
    return nested
      ? universalValue(eventPlan, [version, onPress])
      : universalValue(plan, [version]);
  });
  const App = defineUniversalComponent(renderer, ({ version }) =>
    universalComponent(renderer, View, { version }),
  );
  const entry = nested ? App : View;

  root.render(entry, { version: 0 }).commitPassive();
  const host = container.children[0];
  assert.equal(creates, 1);
  root.render(entry, { version: 1 }).commitPassive();
  root.render(entry, { version: 2 }).commitPassive();
  assert.equal(container.children[0], host);
  assert.equal(host.props.version, 2);
  assert.equal(creates, 1);
  assert.equal(cleanups, 0);

  // A WeakRef keeps a dereferenced target alive for the rest of its JS job.
  // Move to another turn before collecting a callback that never ran.
  await setImmediate();
  for (let attempt = 0; attempt < 3; attempt++) {
    gc();
    await setImmediate();
  }
  assert.equal(weakIntermediate.deref(), undefined,
    'an ignored effect callback from an earlier render remains reachable (' +
    (nested ? 'nested' : 'root') + ')');
  assert.equal(container.children[0], host);
  assert.equal(host.props.version, 2);
  if (nested) {
    container.dispatchEvent(host, 'press', {});
    assert.equal(presses, 1);
  }
  root.unmount();
  root.flushPassiveTasks();
  assert.equal(cleanups, 1);
  assert.equal(container.children.length, 0);
}

await checkEffectCallbackRetention(false);
await checkEffectCallbackRetention(true);
`;
	const result = await build({
		stdin: {
			contents: source,
			resolveDir: resolve(import.meta.dirname, '..'),
			sourcefile: 'native-effect-retention-consumer.mjs',
		},
		bundle: true,
		define: { __OCTANE_PROFILE_ENABLED__: 'false' },
		format: 'esm',
		minify: true,
		platform: 'node',
		target: 'node22',
		write: false,
	});
	const directory = mkdtempSync(join(tmpdir(), 'octane-native-effect-retention-'));
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
