// @vitest-environment jsdom
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';
import { flushSync, hydrateRoot } from 'octane';
import { renderToString } from 'octane/server';
import * as signals from 'octane/signals';
import { loadCompiledFixtureSource } from '../../octane/tests/_server-fixture.js';

const input = `import { useSyncExternalStore as useStore } from 'react';
import type { WritableSignal as Cell } from 'octane/signals';
export function Reading(props: { value: Cell<string> }) {
  const cell = props.value;
  const label = useStore(notify => cell.subscribe(notify), () => cell.get(), () => cell.get());
  return <p>{label}</p>;
}`;

function migrate(source, verify = true) {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'octane-signal-read-'));
	try {
		const file = path.join(root, 'Reading.tsx');
		fs.writeFileSync(file, source);
		fs.writeFileSync(path.join(root, 'package.json'), '{"type":"module"}');
		fs.writeFileSync(
			path.join(root, 'tsconfig.json'),
			'{"compilerOptions":{"strict":true,"moduleResolution":"bundler","module":"ESNext","jsx":"preserve"}}',
		);
		fs.symlinkSync(
			path.resolve(import.meta.dirname, '../node_modules'),
			path.join(root, 'node_modules'),
			'dir',
		);
		const bin = path.resolve(import.meta.dirname, '../dist/bin.js');
		const result = spawnSync(process.execPath, [bin, '--strong', '--print', '--json', file], {
			cwd: root,
			encoding: 'utf8',
		});
		expect(result.error).toBeUndefined();
		if (verify) expect(result.status, result.stdout + result.stderr).toBe(0);
		const { files } = JSON.parse(result.stdout);
		return files.find((entry) => entry.file === 'Reading.tsx');
	} finally {
		fs.rmSync(root, { recursive: true, force: true });
	}
}

it.each([
	['Strong', input, true],
	[
		'compatibility fallback',
		input
			.replace('useSyncExternalStore as useStore', 'useEffect, useSyncExternalStore as useStore')
			.replace('const label =', "useEffect(() => {}, [props['value']]);\n  const label ="),
		false,
	],
])(
	'follows the current signal through hydration, replacement and unmount in %s',
	(_mode, source, strong) => {
		const migrated = migrate("import 'octane/signals';\n" + source);
		expect(migrated.rules['native-signal-read']).toBe(1);
		expect(migrated.strong).toBe(strong);
		expect(migrated.code).not.toContain('useSyncExternalStore');
		const fixture = { id: 'Reading.tsrx', runtimeModules: { 'octane/signals': signals } };
		const server = loadCompiledFixtureSource(migrated.code, { ...fixture, mode: 'server' });
		const client = loadCompiledFixtureSource(migrated.code, { ...fixture, mode: 'client' });
		const owner = signals.createScope({ scopeKey: 'colors' });
		try {
			const first = owner.signal$('first', 'red');
			const next = owner.signal$('next', 'blue');
			const subscriptions = () => owner.inspect().nodes.map((node) => node.subscribers);
			const host = document.createElement('div');
			host.innerHTML = renderToString(server.Reading, { value: first }).html;
			const text = host.querySelector('p');
			expect(text.textContent).toBe('red');
			expect(subscriptions()).toEqual([0, 0]);
			first.set('live');
			const root = hydrateRoot(host, client.Reading, { value: first });
			try {
				flushSync(() => {});
				expect(host.querySelector('p')).toBe(text);
				expect(text.textContent).toBe('live');
				flushSync(() => first.set('green'));
				expect(text.textContent).toBe('green');
				flushSync(() => root.render(client.Reading, { value: next }));
				expect(subscriptions()).toEqual([0, 1]);
				flushSync(() => first.set('old'));
				expect(text.textContent).toBe('blue');
				flushSync(() => next.set('violet'));
				expect(host.querySelector('p')).toBe(text);
				expect(text.textContent).toBe('violet');
			} finally {
				root.unmount();
			}
			expect(subscriptions()).toEqual([0, 0]);
		} finally {
			owner.dispose();
		}
	},
);

it('uses the existing runtime import for a scalar declared in the same module', () => {
	const source = input
		.replace(
			"import type { WritableSignal as Cell } from 'octane/signals';",
			"import { signal$ as scalar, type WritableSignal as Cell } from 'octane/signals';",
		)
		.replace('const cell = props.value;', "const cell = scalar('red');")
		.replace(/\bcell\b/g, 'cell$');
	const migrated = migrate(source);
	expect(migrated.strong).toBe(true);
	expect(migrated.code).toContain('cell$.get()');
	expect(migrated.code).not.toContain('useSyncExternalStore');
	expect(migrated.code.match(/['"]octane\/signals['"]/g)).toHaveLength(1);
});

it.each(['import type { WritableSignal', 'import { WritableSignal'])(
	'does not opt sibling render reads in when %s is only used as a type',
	(spelling) => {
		const source =
			input.replace('import type { WritableSignal', spelling) +
			`
import { readCurrent } from './other';
export function Other() { return <p>{readCurrent()}</p>; }`;
		const migrated = migrate(source, false);
		expect(migrated.rules['native-signal-read']).toBeUndefined();
		expect(migrated.code).toContain('useSyncExternalStore');
		expect(migrated.code).not.toMatch(/import\s*['"]octane\/signals['"]/);
	},
);

it.each([
	['a different server snapshot', input.replace('() => cell.get());', "() => 'server');")],
	['a client-only subscription', input.replace(', () => cell.get());', ');')],
	[
		'an external store',
		input.replace('Cell<string>', '{get(): string; subscribe(cb: () => void): () => void}'),
	],
	[
		'a deferred read',
		input
			.replace('const label = useStore', 'const getLabel = () => useStore')
			.replace('{label}', '{getLabel()}'),
	],
	[
		'a same-named user type',
		input.replace(
			"import type { WritableSignal as Cell } from 'octane/signals';",
			'interface WritableSignal<T> {get(): T; subscribe(cb: () => void): () => void}; type Cell<T> = WritableSignal<T>;',
		),
	],
	['mixed handles', input.replace('() => cell.get());', '() => props.value.get());')],
	['an annotated callback', input.replace('notify =>', '(notify: () => void) =>')],
	['an annotated read', input.replace('() => cell.get()', '(): string => cell.get()')],
	['a generic callback', input.replace('notify =>', '<T,>(notify: T) =>')],
	['an unbound method', input.replace('notify => cell.subscribe(notify)', 'cell.subscribe')],
	['a reassignable receiver', input.replace('const cell =', 'let cell =')],
])('preserves %s', (_name, source) => {
	// The retained get callbacks can still require the signals runtime in Strong source.
	const migrated = migrate("import 'octane/signals';\n" + source);
	expect(migrated.rules['native-signal-read']).toBeUndefined();
	expect(migrated.code).toContain('useSyncExternalStore');
});
