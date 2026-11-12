// @vitest-environment jsdom
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { act, createElement, useEffect } from 'react';
import { createRoot as reactRoot } from 'react-dom/client';
import { Activity, createElement as octaneElement, createRoot } from 'octane';
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

const blockEffect = `() => {
		receiver.record('start', receiver.value);
		return () => receiver.record('stop', receiver.value);
	}`;
const source = `import { useEffect } from 'react';
export function Probe({ receiver, revision }) {
	useEffect(${blockEffect}, [receiver]);
	return <p>{String(revision)}</p>;
}`;

const propertySource = source
	.replace('{ receiver, revision }', '{ receiver, revision, trigger }')
	.replace('[receiver]', '[receiver, trigger.value, trigger.value, trigger.nested?.end]');

it.each([
	['block', false],
	['block', true],
	['expression', false],
	['expression', true],
	['properties', false],
])('matches React for a %s effect with revision dependency %s', async (form, withRevision) => {
	const withProperties = form === 'properties';
	const comment = form === 'expression' && withRevision ? '// keep with the expression\n' : '';
	const effect = form === 'expression' ? `() => ${comment}receiver.attach()` : blockEffect;
	const input = withProperties ? propertySource : source.replace(blockEffect, effect);
	const migrated = migrate(
		withRevision ? input.replace('[receiver]', '[receiver, revision]') : input,
	);
	expect(migrated.strong).toBe(true);
	if (comment) expect(migrated.code).toContain(comment.trim());
	const native = loadCompiledFixtureSource(migrated.code, { id: 'Probe.tsrx', mode: 'client' });
	function Reference({ receiver, revision, trigger }) {
		useEffect(
			form === 'expression'
				? () => receiver.attach()
				: () => {
						receiver.record('start', receiver.value);
						return () => receiver.record('stop', receiver.value);
					},
			withProperties
				? [receiver, trigger.value, trigger.value, trigger.nested?.end]
				: withRevision
					? [receiver, revision]
					: [receiver],
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
			attach() {
				this.record('start', this.value);
				return () => this.record('stop', this.value);
			}
		}
		const a = new Receiver('a'),
			b = new Receiver('b');
		const host = document.createElement('div');
		const root = react ? reactRoot(host) : createRoot(host);
		let value, optional, reads;
		const nested = {
			get end() {
				log.push('trigger end');
				return 'end';
			},
		};
		const trigger = {
			get value() {
				log.push('trigger value');
				return ++reads === 1 ? NaN : value;
			},
			get nested() {
				log.push('trigger nested');
				return optional ? nested : null;
			},
		};
		const render = async (receiver, revision, enabled = true) => {
			value = revision;
			optional = enabled;
			reads = 0;
			const props = { receiver, revision, trigger };
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
			if (withProperties) await render(a, -0, false);
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
		if (withProperties) {
			const optional = ['trigger value', 'trigger value', 'trigger nested'];
			const full = [...optional, 'trigger end'];
			expect(reference.filter((entry) => entry.startsWith('trigger'))).toEqual([
				...full,
				...full,
				...full,
				...full,
				...optional,
				...full,
			]);
		}
		expect(reference.filter((entry) => !entry.startsWith('trigger'))).toEqual([
			'read a',
			'start a 1',
			...(withRevision || withProperties ? [...restart, ...restart] : []),
			...(withProperties ? restart : []),
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

it('preserves property reads and the current layout setup when Activity reconnects', () => {
	const migrated = migrate(`import { useEffectEvent, useLayoutEffect } from 'react';
export function Probe({ receiver, revision, record }) {
	useLayoutEffect(() => {
		const value = receiver.value;
		record('setup', receiver.name, value, revision);
		return () => record('cleanup', receiver.name, value, revision);
	}, [receiver.value, receiver.value]);
	return <p>{String(revision)}</p>;
}`);
	expect(migrated.strong).toBe(true);
	const { Probe } = loadCompiledFixtureSource(migrated.code, { id: 'Probe.tsrx', mode: 'client' });
	const reads = [];
	const effects = [];
	const receiver = (name, value) => ({
		name,
		get value() {
			reads.push(name);
			return value;
		},
	});
	const a = receiver('a', 1);
	const b = receiver('b', 1);
	const c = receiver('c', 2);
	const record = (...entry) => effects.push(entry);
	const host = document.createElement('div');
	const root = createRoot(host);
	const render = (mode, receiver, revision) => {
		root.render(
			octaneElement(Activity, {
				mode,
				children: octaneElement(Probe, {
					receiver,
					revision,
					record,
				}),
			}),
		);
		flushEffects();
	};
	try {
		render('visible', a, 1);
		render('visible', b, 2);
		render('hidden', b, 3);
		render('visible', b, 4);
		expect(host.textContent).toBe('4');
		render('visible', c, 5);
	} finally {
		root.unmount();
		flushEffects();
	}
	expect(reads).toEqual(['a', 'a', 'a', 'b', 'b', 'b', 'b', 'b', 'b', 'b', 'c', 'c', 'c']);
	expect(effects).toEqual([
		['setup', 'a', 1, 1],
		['cleanup', 'a', 1, 1],
		['setup', 'b', 1, 4],
		['cleanup', 'b', 1, 4],
		['setup', 'c', 2, 5],
		['cleanup', 'c', 2, 5],
	]);
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
	['computed property', propertySource.replaceAll('trigger.value', "trigger['value']")],
	['property calls', propertySource.replaceAll('trigger.value', 'trigger.read()')],
	[
		'guarded hook expression',
		propertySource.replace('useEffect(() =>', 'revision && useEffect(() =>'),
	],
	[
		'property triggers in a concise body',
		propertySource.replace(blockEffect, '() => receiver.attach()'),
	],
	['dependency comment', propertySource.replace('trigger.nested', '/* keep */ trigger.nested')],
	[
		'statement directive',
		propertySource.replace('useEffect(() =>', '// @ts-expect-error preserve\nuseEffect(() =>'),
	],
	[
		'skipped switch initialization',
		propertySource
			.replace(
				'useEffect(() =>',
				'switch (revision) { case 1: const key = 1; break; case 2: { useEffect(() =>',
			)
			.replace('[receiver,', '[key, receiver,')
			.replace('return <p>', '} } return <p>'),
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
