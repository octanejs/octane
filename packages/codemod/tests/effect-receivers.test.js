// @vitest-environment jsdom
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { act, createElement, useEffect } from 'react';
import { createRoot as reactRoot } from 'react-dom/client';
import { createRoot } from 'octane';
import { expect, it } from 'vitest';
import { loadCompiledFixtureSource } from '../../octane/tests/_server-fixture.js';
import { flushEffects } from '../../octane/tests/_helpers.js';

function migrate(source) {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'effect-receivers-'));
	try {
		fs.writeFileSync(path.join(root, 'package.json'), '{"type":"module"}');
		fs.writeFileSync(path.join(root, 'Probe.tsx'), source);
		fs.symlinkSync(
			path.resolve(import.meta.dirname, '../node_modules'),
			path.join(root, 'node_modules'),
			'dir',
		);
		const bin = path.resolve(import.meta.dirname, '../dist/bin.js');
		const result = execFileSync(
			process.execPath,
			[bin, '--strong', '--print', '--json', 'Probe.tsx'],
			{ cwd: root, encoding: 'utf8' },
		);
		return JSON.parse(result).files[0];
	} finally {
		fs.rmSync(root, { recursive: true, force: true });
	}
}

const source = `import { useEffect } from 'react';
export function Probe({ receiver, revision }) {
	useEffect(() => {
		receiver.record('start', receiver.value);
		return () => receiver.record('stop', receiver.value);
	}, [receiver]);
	return <p>{String(revision)}</p>;
}`;

it.each([false, true])('matches React with revision dependency %s', async (withRevision) => {
	const migrated = migrate(
		withRevision ? source.replace('[receiver]', '[receiver, revision]') : source,
	);
	expect(migrated.strong).toBe(true);
	const native = loadCompiledFixtureSource(migrated.code, { id: 'Probe.tsrx', mode: 'client' });
	function Reference({ receiver, revision }) {
		useEffect(
			() => {
				receiver.record('start', receiver.value);
				return () => receiver.record('stop', receiver.value);
			},
			withRevision ? [receiver, revision] : [receiver],
		);
		return createElement('p', null, String(revision));
	}
	async function exercise(react) {
		const log = [];
		class Receiver {
			x = 1;
			constructor(name) {
				this.name = name;
			}
			get value() {
				log.push('read ' + this.name);
				return this.x;
			}
			record(kind, value) {
				log.push(kind + ' ' + this.name + ' ' + value);
			}
		}
		const a = new Receiver('a'),
			b = new Receiver('b');
		const host = document.createElement('div');
		const root = react ? reactRoot(host) : createRoot(host);
		const render = async (receiver, revision) => {
			const props = { receiver, revision };
			if (react) await act(() => root.render(createElement(Reference, props)));
			else {
				root.render(native.Probe, props);
				flushEffects();
			}
			expect(host.textContent).toBe(String(revision));
		};
		try {
			await render(a, NaN);
			a.x = 2;
			await render(a, NaN);
			await render(a, 0);
			await render(a, -0);
			b.x = 2;
			await render(b, -0);
			b.x = 3;
		} finally {
			if (react) await act(() => root.unmount());
			else {
				root.unmount();
				flushEffects();
			}
		}
		return log;
	}
	const before = globalThis.IS_REACT_ACT_ENVIRONMENT;
	globalThis.IS_REACT_ACT_ENVIRONMENT = true;
	try {
		const reference = await exercise(true);
		const restart = ['read a', 'stop a 2', 'read a', 'start a 2'];
		expect(reference).toEqual([
			'read a',
			'start a 1',
			...(withRevision ? [...restart, ...restart] : []),
			'read a',
			'stop a 2',
			'read b',
			'start b 2',
			'read b',
			'stop b 3',
		]);
		expect(await exercise(false)).toEqual(reference);
	} finally {
		globalThis.IS_REACT_ACT_ENVIRONMENT = before;
	}
});

it.each([
	[
		'mutable parameter',
		source.replace('useEffect(() =>', 'if (revision) receiver = revision; useEffect(() =>'),
	],
	[
		'destructuring write',
		source.replace('useEffect(() =>', 'if (revision) ({receiver} = revision); useEffect(() =>'),
	],
	[
		'foreign binding',
		source
			.replace(
				'export function Probe({ receiver, revision }) {',
				"import { receiver } from './foreign'; export function Probe({ revision }) {",
			)
			.replace('[receiver]', '[receiver, revision]'),
	],
	[
		'declared later',
		source
			.replace('{ receiver, revision }', '{ input, revision }')
			.replace('return <p>', 'const receiver = input; return <p>'),
	],
	[
		'mixed getter dependencies',
		source
			.replace('{ receiver, revision }', '{ receiver, revision, other }')
			.replace("receiver.record('start'", "void other.value; receiver.record('start'")
			.replace('[receiver]', '[receiver, other.value, other.value]'),
	],
	['member dependency', source.replace('[receiver]', '[receiver.value]')],
	[
		'indirectly spelled direct eval',
		source.replace('useEffect(() =>', "(eval)('receiver = revision'); useEffect(() =>"),
	],
	['spread dependency list', source.replace('[receiver]', '[receiver, ...revision]')],
	[
		'reassigned trigger',
		source
			.replace('useEffect(() =>', 'revision++; useEffect(() =>')
			.replace('[receiver]', '[receiver, revision]'),
	],
	[
		'missing dependency',
		source
			.replace('{ receiver, revision }', '{ receiver, revision, label }')
			.replace("receiver.record('start'", 'receiver.record(label')
			.replace('[receiver]', '[receiver, revision]'),
	],
])('keeps the original effect when it cannot prove the %s case', async (_case, input) => {
	const migrated = migrate(input);
	expect(migrated.strong).toBe(false);
	expect(migrated.code).not.toContain('const currentReceiver');
	expect(migrated.diagnostics.some((d) => d.code === 'OCTANE_STRONG_EXPLICIT_DEPENDENCIES')).toBe(
		true,
	);
});

it('respects local shadows, fresh alias names and comments', async () => {
	const migrated = migrate(
		source
			.replaceAll('revision', 'currentReceiverValue')
			.replace('[receiver]', '[receiver, currentReceiverValue]')
			.replace(
				"receiver.record('start', receiver.value);",
				'const currentReceiver = [1].map(receiver => receiver.toString()); /* keep */\nreceiver.record(currentReceiver, receiver.value);',
			),
	);
	expect(migrated.strong).toBe(true);
	expect(migrated.code).toContain('receiver => receiver.toString()');
	expect(migrated.code).toContain('const currentReceiverValueValue = receiver;');
	expect(migrated.code).toContain('/* keep */');
});
