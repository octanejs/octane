// @vitest-environment jsdom
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRoot } from 'octane';
import { renderToStaticMarkup } from 'octane/server';
import { createElement as reactElement, useState } from 'react';
import { renderToStaticMarkup as renderReact } from 'react-dom/server';
import { expect, it } from 'vitest';
import { loadCompiledFixtureSource } from '../../octane/tests/_server-fixture.js';

function migrate(source, files = {}) {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'linked-render-state-'));
	try {
		fs.symlinkSync(
			path.resolve(import.meta.dirname, '../node_modules'),
			path.join(root, 'node_modules'),
			'dir',
		);
		for (const [name, code] of Object.entries(files)) fs.writeFileSync(path.join(root, name), code);
		fs.writeFileSync(path.join(root, 'Probe.tsx'), source);
		const args = [
			path.resolve(import.meta.dirname, '../dist/bin.js'),
			'--strong',
			'--print',
			'--json',
			'Probe.tsx',
		];
		const result = JSON.parse(
			execFileSync(process.execPath, args, { cwd: root, encoding: 'utf8' }),
		);
		return result.files[0];
	} finally {
		fs.rmSync(root, { recursive: true, force: true });
	}
}

const property = `import {useState as initialState} from 'react';
export function Probe(model) {
	const [seen, mark] = initialState(!!model.open);
	if (model.open && !seen) { mark(true); }
	return seen ? <b/> : null;
}`;
const local = property
	.replace('const [seen', 'const open = model.app != null || model.id != null;\n const [seen')
	.replace('!!model.open', 'open')
	.replace('model.open &&', 'open &&');
const typedProperty = (type) =>
	property
		.replace('Probe(model)', `Probe(model: { open: ${type} })`)
		.replace('!!model.open', 'model.open');
const strict = {
	'tsconfig.json': JSON.stringify({
		compilerOptions: { strict: true, jsx: 'react-jsx', moduleResolution: 'bundler' },
	}),
};

it.each([
	['property', property],
	['local', local],
	['boolean property', typedProperty('boolean | null | undefined'), strict],
])('preserves the %s getter trace and initial value on the server', (kind, source, files) => {
	const migrated = migrate(source, files);
	expect(migrated.strong).toBe(true);
	const { Probe } = loadCompiledFixtureSource(migrated.code, { id: 'Probe.tsrx', mode: 'server' });
	function Reference({ model }) {
		const local = kind === 'local' && (model.app != null || model.id != null);
		const initial =
			kind === 'local' ? local : kind === 'boolean property' ? model.open : !!model.open;
		const [seen, mark] = useState(initial);
		if ((kind === 'local' ? local : model.open) && !seen) mark(true);
		return seen ? reactElement('b') : null;
	}
	function exercise(native, throwAt) {
		const log = [];
		function read(key) {
			log.push(key);
			if (log.length === throwAt) throw new Error('read failed');
			return log.length === 2 ? true : null;
		}
		const model = {
			get open() {
				return read('open');
			},
			get app() {
				return read('app');
			},
			get id() {
				return read('id');
			},
		};
		try {
			const html = native
				? renderToStaticMarkup(Probe, model).html
				: renderReact(reactElement(Reference, { model }));
			return { log, html };
		} catch (error) {
			return { log, error: error.message };
		}
	}
	for (const throwAt of [0, 1, 2, 3, 4])
		expect(exercise(true, throwAt)).toEqual(exercise(false, throwAt));
});

it('discards a latch when its replayed mount read suspends before publication', async () => {
	const migrated = await migrate(property);
	expect(migrated.strong).toBe(true);
	const { Probe } = loadCompiledFixtureSource(migrated.code, { id: 'Probe.tsrx', mode: 'client' });
	const { promise, resolve } = Promise.withResolvers();
	let settled = false,
		reads = 0;
	const model = {
		get open() {
			reads++;
			if (settled) return false;
			if (reads >= 3) throw promise;
			return reads === 2;
		},
	};
	const host = document.createElement('div');
	const root = createRoot(host);
	try {
		root.render(Probe, model);
		expect(reads).toBe(3);
		settled = true;
		resolve();
		await expect.poll(() => reads).toBeGreaterThan(3);
		expect(host.querySelector('b')).toBeNull();
	} finally {
		root.unmount();
	}
});

it.each([
	[
		'ordinary function call',
		property + ' export function Caller(){ return <p>{Probe({open:true})}</p>; }',
	],
	['component alias', property + ' export const Other = Probe;'],
	['untyped initializer', property.replace('!!model.open', 'model.open')],
	['callable initializer', typedProperty('() => boolean'), strict],
	['opaque setup', property.replace('const [seen', 'model.observe(); const [seen')],
	['different guard order', property.replace('model.open && !seen', '!seen && model.open')],
	['second setter use', property.replace('<b/>', '<b onClick={mark}/>')],
	['old-pass work', property.replace(': null;', ': model.report();')],
	['reassigned selector', local.replace('const open', 'let open')],
	['unrelated state hook', property.replace("from 'react'", "from './custom'")],
	['async owner', property.replace('function Probe', 'async function Probe')],
	['intervening comment', property.replace('if (model', '/* retain */ if (model')],
])('leaves %s outside the linked-state rewrite', (_name, source, files) => {
	const result = migrate(source, files);
	expect(result.code).not.toContain('useLinkedState');
});

it('keeps an ordinary JSX call to the migrated owner', async () => {
	const result = await migrate(property + ' export function Caller(){ return <Probe open/>; }');
	expect(result.strong).toBe(true);
	expect(result.code).toContain('useLinkedState');
});

it('keeps a locally resolved state hook out of the linked-state rewrite', () => {
	const result = migrate(property, {
		'tsconfig.json': JSON.stringify({
			compilerOptions: { moduleResolution: 'bundler', paths: { react: ['./alternative.ts'] } },
		}),
		'alternative.ts': 'export function useState(){ return [false, () => {}] as const; }',
	});
	expect(result.strong).toBe(false);
	expect(result.code).not.toContain('useLinkedState');
});
