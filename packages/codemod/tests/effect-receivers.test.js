// @vitest-environment jsdom
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { act, createElement, useEffect, useRef, useState } from 'react';
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

it('preserves a lazy mount value through effect updates and cleanup', async () => {
	const source = `import { useState as state, useEffect as effect } from 'react';
	export function Probe({ read, record, revision }) {
		const[value] = state(() => ({ read, revision }));
		effect(() => {
			const valueRef = { value };
			record('start', revision, valueRef.value, value.read());
			return () => record('stop', revision, value, value.read());
		}, [record, value, revision]);
		return revision ? <p data-revision={String(revision)}/> : null;
	}`;
	const migrated = migrate(source);
	expect(migrated.strong).toBe(true);
	const native = loadCompiledFixtureSource(migrated.code, { id: 'Probe.tsrx', mode: 'client' });
	function Reference({ read, record, revision }) {
		const [value] = useState(() => ({ read, revision }));
		useEffect(() => {
			record('start', revision, value, value.read());
			return () => record('stop', revision, value, value.read());
		}, [record, value, revision]);
		return createElement('p', null, String(revision));
	}
	async function exercise(react) {
		const log = [];
		const functions = new Set();
		const record = (phase, revision, value, unbound) => {
			functions.add(value);
			log.push([phase, revision, unbound]);
		};
		const root = react
			? reactRoot(document.createElement('div'))
			: createRoot(document.createElement('div'));
		try {
			for (const revision of [1, 1, 2]) {
				const props = {
					read() {
						return this.revision;
					},
					record,
					revision,
				};
				if (react) await act(() => root.render(createElement(Reference, props)));
				else {
					root.render(native.Probe, props);
					await flushEffects();
				}
			}
		} finally {
			if (react) await act(() => root.unmount());
			else {
				root.unmount();
				await flushEffects();
			}
		}
		return { log, values: functions.size };
	}
	const expected = await exercise(true);
	expect(expected.values).toBe(1);
	expect(expected.log[0]).toEqual(['start', 1, 1]);
	expect(expected.log.at(-1)).toEqual(['stop', 2, 1]);
	expect(await exercise(false)).toEqual(expected);
});

it.each([
	['eager initializer', '{ seed }', ''],
	['render read', '() => ({ seed })', 'observe(value);'],
	['custom hook', '() => ({ seed })', 'useOther(() => observe(value), [value]);'],
	[
		'nested owner',
		'() => ({ seed })',
		'function useNested() { useEffect(() => { observe(value); }, [value]); }',
	],
	['dependency expression', '() => ({ seed })', 'useEffect(() => {}, [value.seed]);'],
	['dynamic lookup', '() => ({ seed })', 'eval("value");'],
	[
		'nested element consumed by an opaque component',
		'() => ({ seed })',
		'return <Store><b/></Store>;',
	],
	['element in initializer', '() => ({ seed: <b/> })', ''],
	[
		'direct platform write',
		'() => ({ seed: Date.now() })',
		'Date.now = () => <b/> as unknown as number;',
	],
	[
		'reflective platform write',
		'() => ({ seed: Date.now() })',
		'',
		'',
		"Object.defineProperty(Date, 'now', { value: () => <b/> });",
	],
	[
		'element handed out inside the template',
		'() => ({ seed })',
		'return <p>{(seed.current = <b/>, null)}</p>;',
	],
	['local factory', '() => ({ seed: make() })', ''],
	['async factory', 'async () => ({ seed })', ''],
	['quoted prototype setter', '() => ({ "__proto__": seed })', ''],
	['element in effect', '() => ({ seed })', '', 'observe(<b>{value.seed}</b>);'],
	['helper in effect', '() => ({ seed })', '', 'observe(make());'],
	[
		'local JSX consumer',
		'() => ({ seed })',
		'',
		'',
		'export function Parent() { return <Probe seed={<b/>}/>; }',
	],
	['retained comment', '() => ({ seed })', '', '', '', '[/* keep */ value]'],
])(
	'keeps a read-only state diagnostic for %s',
	(_case, initial, extra, effect = '', suffix = '', binding = '[value]') => {
		const migrated = migrate(`import { useState, useEffect } from 'react';
		${(initial + effect).includes('make()') ? 'function make() { return <b/>; }' : ''}
		export function Probe({ seed, observe, useOther }) {
			const ${binding} = useState(${initial});
			useEffect(() => { observe(value); ${effect} }, [value, observe]);
			${extra}
			return <p/>;
		}
		${suffix}`);
		expect(migrated.diagnostics.map((d) => d.code)).toContain('OCTANE_STRONG_READ_ONLY_STATE');
	},
);

const helperSource = `import { useEffect, useRef } from 'react';
export function Probe({ value }) {
	const latest = useRef(0);
	const initial = useRef(value);
	const read = (add: number): number => Math.max(latest.current + add, initial.current);
	const record = () => { window.records.push(latest.current); };
	useEffect(() => {
		window.records.push(read(1));
		return () => { record(); };
	}, []);
	return <button onClick={() => { latest.current = value; window.records.push(read(1)); record(); }}>Record</button>;
}`;

it('preserves ref reads at setup, event and cleanup when local helpers are called from an effect', async () => {
	const migrated = migrate(helperSource);
	expect(migrated.strong).toBe(true);
	const native = loadCompiledFixtureSource(migrated.code, { id: 'Probe.tsrx', mode: 'client' });
	function Reference({ value }) {
		const latest = useRef(0);
		const initial = useRef(value);
		const read = (add) => Math.max(latest.current + add, initial.current);
		const record = () => {
			window.records.push(latest.current);
		};
		useEffect(() => {
			window.records.push(read(1));
			return () => {
				record();
			};
		}, []);
		return createElement(
			'button',
			{
				onClick() {
					latest.current = value;
					window.records.push(read(1));
					record();
				},
			},
			'Record',
		);
	}
	async function exercise(react) {
		const host = document.createElement('div');
		const root = react ? reactRoot(host) : createRoot(host);
		window.records = [];
		try {
			for (const value of [2, 7]) {
				if (react) await act(() => root.render(createElement(Reference, { value })));
				else {
					root.render(native.Probe, { value });
					flushEffects();
				}
				host.querySelector('button').click();
			}
		} finally {
			if (react) await act(() => root.unmount());
			else {
				root.unmount();
				flushEffects();
			}
		}
		return window.records;
	}
	const before = globalThis.IS_REACT_ACT_ENVIRONMENT;
	globalThis.IS_REACT_ACT_ENVIRONMENT = true;
	try {
		const expected = await exercise(true);
		expect(expected).toEqual([2, 3, 2, 8, 7, 7]);
		expect(await exercise(false)).toEqual(expected);
	} finally {
		globalThis.IS_REACT_ACT_ENVIRONMENT = before;
		delete window.records;
	}
});

it.each([
	['changing prop', 'window.records.push(value)'],
	['tagged template identity', 'window.records.push(latest.current\`token\`)'],
	['lexical arguments', 'window.records.push(arguments.length, latest.current)'],
	['direct eval', 'eval("window.records.push(latest.current)")'],
	['recursive binding', 'window.records.push(record, latest.current)'],
])('retains the dependency for a helper with %s', (_, body) => {
	const source = helperSource.replace('window.records.push(latest.current);', body + ';');
	expect(migrate(source).strong).toBe(false);
});

it.each([
	[
		'an effect-only helper',
		helperSource.replace(
			'window.records.push(read(1)); record();',
			'window.records.push(read(1));',
		),
	],
	[
		'a contextually typed declaration',
		helperSource.replace('const record =', 'const record: () => void ='),
	],
	[
		'an escaping helper identity',
		helperSource.replace(
			'return () => { record(); };',
			'window.original = record; return () => { record(); };',
		),
	],
	[
		'direct eval in the effect',
		helperSource.replace(
			'return () => { record(); };',
			'eval("record"); return () => { record(); };',
		),
	],
	[
		'a shadowed capture',
		helperSource.replace('useEffect(() => {', 'useEffect(() => { const latest = {current: 9};'),
	],
	[
		'a shadowed parameter type',
		helperSource
			.replace('export function Probe', 'type Step = number;\nexport function Probe')
			.replace('add: number', 'add: Step')
			.replace('useEffect(() => {', 'useEffect(() => { type Step = string;'),
	],
])('keeps an empty effect dependency list for %s', (_, input) => {
	expect(migrate(input).strong).toBe(false);
});
