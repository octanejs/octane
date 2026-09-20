import { describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getBindingPackages } from '../../../scripts/workspace-packages.mjs';
import {
	bridgeReport,
	bridgeReportFromSource,
	detectVanillaCore,
	scanSource,
	KNOWN_BINDINGS,
	KNOWN_VANILLA_CORES,
	KNOWN_NATIVE_BINDINGS,
	KNOWN_BINDING_PACKAGE_DIRS,
} from './bridge.js';

describe('scanSource', () => {
	it('collects React API usage counts and import specifiers', () => {
		const source = `
			import { forwardRef, useState, useEffect } from 'react';
			import { createPortal } from 'react-dom';
			export const X = forwardRef((props, ref) => {
				const [n, setN] = useState(0);
				useEffect(() => {}, [n]);
				return createPortal(null, document.body);
			});
		`;
		const { apis, imports, classComponent } = scanSource(source);
		expect(apis.get('forwardRef')).toBe(2);
		expect(apis.get('useState')).toBe(2);
		expect(apis.get('useEffect')).toBe(2);
		expect(apis.get('createPortal')).toBe(2);
		expect(imports.has('react')).toBe(true);
		expect(imports.has('react-dom')).toBe(true);
		expect(classComponent).toBe(false);
	});

	it('detects class components', () => {
		expect(scanSource('class Boundary extends React.Component {}').classComponent).toBe(true);
		expect(scanSource('class Memoish extends PureComponent {}').classComponent).toBe(true);
	});

	it('classifies symbol-kind exports without requiring the corresponding renderer', () => {
		const report = bridgeReportFromSource(`
			var REACT_PROFILER_TYPE = Symbol.for('react.profiler');
			exports.Profiler = REACT_PROFILER_TYPE;
			exports.isProfiler = value => value.type === REACT_PROFILER_TYPE;
		`);
		expect(report.apis.find((row) => row.name === 'Profiler').status).toBe('rewrite');
		expect(report.verdict).toBe('bridgeable-with-rewrites');
		const renderer = bridgeReportFromSource(`
			import { Profiler } from 'react';
			var REACT_PROFILER_TYPE = Symbol.for('react.profiler');
			exports.Profiler = REACT_PROFILER_TYPE;
			export const View = () => <Profiler />;
		`);
		expect(renderer.verdict).toBe('needs-rework');
	});

	it('ignores API names inside string literals and comments', () => {
		const report = bridgeReportFromSource(`
			const TAG_NAMES = { 18: 'Suspense', 19: 'SuspenseList', 30: 'ViewTransition' };
			const KNOWN = new Set(['Suspense', 'Fragment', 'StrictMode', 'Profiler', 'SuspenseList']);
			// SuspenseList and Profiler tags map to labels; they are never rendered.
			const fiberName = tag => TAG_NAMES[tag] ?? \`Unknown\`;
			export const describe = fiber => KNOWN.has(fiberName(fiber.tag)) ? fiberName(fiber.tag) : 'Anonymous';
		`);
		expect(report.apis.find((row) => row.name === 'SuspenseList')).toBeUndefined();
		expect(report.apis.find((row) => row.name === 'Profiler')).toBeUndefined();
		expect(report.verdict).toBe('bridgeable');
	});

	it.each([
		[
			'template interpolation',
			'import React from "react"; export const html = `prefix ${renderToString(React.createElement(React.Profiler, { id: "work" }, null))}`;',
		],
		[
			'nested template interpolation',
			'import React from "react"; export const html = `prefix ${`nested ${renderToString(React.createElement(React.Profiler, { id: "work" }, null))}`}`;',
		],
		[
			'template interpolation with nested braces and inert delimiters',
			'import React from "react"; export const html = `prefix ${(() => { const config = { label: "}" }; const pattern = /[{}]/; /* } Profiler */ // } SuspenseList\nreturn renderToString(React.createElement(React.Profiler, { id: config.label }, null)); })()}`;',
		],
		[
			'JSX following a closing element',
			'import React from "react"; export const App = () => <div><span></span><React.Profiler id="work" /></div>;',
		],
		[
			'JSX inside a template interpolation',
			'import React from "react"; export const html = `<main>${renderToString(<div><span></span><React.Profiler id="work" /></div>)}</main>`;',
		],
		[
			'JSX following postfix division',
			'import React from "react"; const ratio = count++ / 2; export const App = () => <React.Profiler id="work" />;',
		],
		[
			'JSX following a fragment and member closing tag',
			'import React from "react"; export const App = () => <><UI.Panel></UI.Panel><React.Profiler /></>;',
		],
		[
			'JSX following a self-closing element',
			'import React from "react"; export const App = () => <><span /><React.Profiler /></>;',
		],
		[
			'JSX with a nested element in an attribute expression',
			'import React from "react"; export const App = () => <span data-label={<i></i>}><React.Profiler /></span>;',
		],
		[
			'JSX rendered by a TypeScript generic arrow',
			'import React from "react"; export const View = <T extends unknown>(value: T) => <React.Profiler />;',
			'view.tsx',
		],
		[
			'JSX following literal parenthesized text',
			'import React from "react"; export const App = () => <span>(text)<React.Profiler /></span>;',
		],
		[
			'JSX in a generic parameter default and arrow body',
			'import React from "react"; export const View = <T extends unknown>(value: unknown = <span>(text)</span>) => <React.Profiler />;',
			'view.tsx',
		],
		[
			'JSX rendered by an annotated generic arrow',
			'import React from "react"; export const View = <T extends unknown>(value: T): unknown => <React.Profiler />;',
			'view.tsx',
		],
		[
			'JSX rendered with a generic function-type constraint',
			'import React from "react"; export const View = <T extends (...args: unknown[]) => unknown>(value: T) => <React.Profiler />;',
			'view.tsx',
		],
		[
			'JSX rendered with a generic parameter type argument',
			'import React from "react"; export const View = <T extends unknown>(value: Array<T>) => <React.Profiler />;',
			'view.tsx',
		],
		[
			'JSX rendered with a nested generic constraint',
			'import React from "react"; export const View = <T extends Array<string>>(value: T) => <React.Profiler />;',
			'view.tsx',
		],
		[
			'JSX after genuine parenthesized JSX text containing nested elements',
			'import React from "react"; export const App = () => <span>(text<i></i>)</span>; export const View = () => <React.Profiler />;',
			'app.tsx',
		],
		[
			'JSX after attributes and genuine parenthesized JSX text',
			'import React from "react"; export const App = () => <span title="safe">(text<i></i>)</span>; export const View = () => <React.Profiler />;',
			'app.tsx',
		],
		[
			'JSX rendered with a generic type-parameter default',
			'import React from "react"; export const View = <T = unknown>(value: T) => <React.Profiler />;',
			'view.tsx',
		],
		[
			'JSX after parenthesized arrow-like text',
			'import React from "react"; export const App = () => <span>(text) => text</span>; export const View = () => <React.Profiler />;',
		],
		[
			'JSX after typed-looking arrow text',
			'import React from "react"; export const App = () => <span>(value: T) => text</span>; export const View = () => <React.Profiler />;',
		],
	])('reports unsupported rendering in %s', (_, source, sourcePath) => {
		const report = bridgeReportFromSource(source, { sourcePath });
		expect(report.apis.find((row) => row.name === 'Profiler')?.status).toBe('unsupported');
		expect(report.verdict).toBe('needs-rework');
	});

	it.each([
		'export const labels = `Profiler ${`nested ${"SuspenseList"}`}`;',
		'export const label = `prefix ${(() => { const config = { label: "} Profiler" }; const pattern = /[{}]SuspenseList/; /* } Profiler */ // } SuspenseList\nreturn config.label + pattern.source; })()}`;',
		'export const label = `literal \\${React.Profiler}`;',
		'export const pattern = /[\\/]Profiler|SuspenseList/gi;',
		'import React from "react"; export const App = () => <span title="Profiler">text</span>;',
		'export const match = 1 < /Profiler>/.test(value);',
		'export const html = `prefix ${1 < /Profiler>/.test(value)}`;',
		'import React from "react"; export const App = () => <span>{1 < /span>Profiler/.test(value)}</span>;',
	])('keeps inert template, regex and attribute labels out of the report: %s', (source) => {
		const report = bridgeReportFromSource(source);
		expect(report.apis.find((row) => row.name === 'Profiler')).toBeUndefined();
		expect(report.apis.find((row) => row.name === 'SuspenseList')).toBeUndefined();
		expect(report.verdict).toBe('bridgeable');
	});

	it.each([
		'export const match = <T>(value: T) => 1 < /T>Profiler/.test(value);',
		'export const match = <T>(value: T) => 1</T>Profiler/.test(value);',
		'export const match = (<T>value) < /T>Profiler/.test(value);',
	])('keeps a typed angle expression comparison regex inert: %s', (source) => {
		const report = bridgeReportFromSource(source, { sourcePath: 'match.ts' });
		expect(report.apis.find((row) => row.name === 'Profiler')).toBeUndefined();
		expect(report.verdict).toBe('bridgeable');
	});

	it.each([
		'export const match = <T extends unknown>(value: T) => 1 < /T>Profiler/.source.length;',
		'export const match = <T extends unknown>(value: T): boolean => 1 < /T>Profiler/.source.length;',
		'export const match = <T extends (...args: unknown[]) => unknown>(value: T) => 1 < /T>Profiler/.source.length;',
		'export const match = <T extends unknown>(value: Array<T>) => 1 < /T>Profiler/.source.length;',
		'export const match = <T extends Array<string>>(value: T) => 1 < /T>Profiler/.source.length;',
		'export const match = <T extends unknown>(value: boolean = 1 < /T>Profiler/.source.length) => value;',
		'export const match = <T = unknown>(value: T) => 1 < /T>Profiler/.source.length;',
		'export const match = <T /* default type */ = unknown>(value: T) => 1 < /T>Profiler/.source.length;',
	])('keeps a generic code comparison regex inert in TSX: %s', (source) => {
		const report = bridgeReportFromSource(source, { sourcePath: 'match.tsx' });
		expect(report.apis.find((row) => row.name === 'Profiler')).toBeUndefined();
		expect(report.verdict).toBe('bridgeable');
	});

	it('targets only React-style text-host onChange wiring', () => {
		const source = `
			function Demo(props) {
				return <>
					<input onChange={(event) => props.edit(event.currentTarget.value)} />
					<textarea onChangeCapture={props.capture} />
					<input type="checkbox" onChange={props.toggle} />
					<input type={props.type} onChange={props.dynamic} />
					<input {...props.field} onChange={props.dynamic} />
					<input onInput={props.input} onChange={props.commit} />
					<input onInput={null} onChange={props.edit} />
					<input onChange={null} />
					<input onChange={props.commit} suppressNativeChangeWarning />
					<input onChange={props.commit} suppressNativeChangeWarning={true} />
					<input onChange={props.edit} suppressNativeChangeWarning={false} />
					<input onChange={props.edit} suppressNativeChangeWarning="false" />
					<input onChange={props.edit} suppressNativeChangeWarning="true" />
					<textarea onChange={props.commit} readOnly />
					<textarea onChange={props.commit} disabled="disabled" />
					<select onChange={props.select}><option>one</option></select>
					<Input onChange={props.value} />
					<Field onChange={props.value} />
				</>;
			}
		`;
		expect(scanSource(source).apis.get('onChange')).toBe(6);
		const report = bridgeReportFromSource(source);
		expect(report.plan.join('\n')).toContain('standard text host');
	});
});

describe('detectVanillaCore', () => {
	it('prefers the known-core table', () => {
		expect(detectVanillaCore('@apollo/client', {})).toBe('@apollo/client');
		expect(detectVanillaCore('@tanstack/react-query', {})).toBe('@tanstack/query-core');
		expect(detectVanillaCore('zustand', {})).toBe('zustand/vanilla');
	});

	it('finds a vanilla export subpath', () => {
		expect(
			detectVanillaCore('somelib', { exports: { '.': './index.js', './vanilla': './vanilla.js' } }),
		).toBe('somelib/vanilla');
	});

	it('falls back to a -core dependency', () => {
		expect(detectVanillaCore('somelib', { dependencies: { '@somelib/core': '1.0.0' } })).toBe(
			'@somelib/core',
		);
		expect(detectVanillaCore('somelib', { dependencies: { '@babel/core': '7.0.0' } })).toBe(null);
	});
});

describe('bridgeReport', () => {
	async function writeFakePackage(root, name, files, packageJson = {}) {
		const dir = join(root, 'node_modules', ...name.split('/'));
		await mkdir(dir, { recursive: true });
		await writeFile(
			join(dir, 'package.json'),
			JSON.stringify({ name, version: '1.2.3', ...packageJson }),
		);
		for (const [file, content] of Object.entries(files)) {
			await writeFile(join(dir, file), content);
		}
		return dir;
	}

	it('reports a same-name-hooks package as bridgeable', async () => {
		const root = await mkdtemp(join(tmpdir(), 'octane-bridge-'));
		await writeFakePackage(root, 'tiny-store', {
			'index.js': `
				import { useSyncExternalStore } from 'react';
				export function useStore(api, selector) {
					return useSyncExternalStore(api.subscribe, () => selector(api.getState()));
				}
			`,
		});
		const report = await bridgeReport({ packageName: 'tiny-store', projectRoot: root });
		expect(report.version).toBe('1.2.3');
		expect(report.filesScanned).toBe(1);
		expect(report.verdict).toBe('bridgeable');
		expect(report.apis.find((row) => row.name === 'useSyncExternalStore').status).toBe('same');
		expect(report.plan.length).toBeGreaterThan(0);
	});

	it.each(['ts', 'mts', 'cts', 'tsx'])(
		'keeps an authored .%s generic comparison regex inert',
		async (extension) => {
			const root = await mkdtemp(join(tmpdir(), 'octane-bridge-'));
			const expression =
				extension === 'tsx'
					? '<T extends unknown>(value: T) => 1 < /T>Profiler/.source.length'
					: '<T>(value: T) => 1</T>Profiler/.source.length';
			await writeFakePackage(root, 'generic-regex', {
				[`index.${extension}`]:
					(extension === 'tsx' ? '' : 'type T = unknown; declare const value: unknown;') +
					`export const match = ${expression};` +
					(extension === 'tsx'
						? 'export const annotated = <T extends unknown>(value: T): boolean => 1 < /T>Profiler/.source.length;' +
							'export const constrained = <T extends (...args: unknown[]) => unknown>(value: T) => 1 < /T>Profiler/.source.length;' +
							'export const parameterType = <T extends unknown>(value: Array<T>) => 1 < /T>Profiler/.source.length;' +
							'export const nested = <T extends Array<string>>(value: T) => 1 < /T>Profiler/.source.length;' +
							'export const defaulted = <T extends unknown>(value: boolean = 1 < /T>Profiler/.source.length) => value;' +
							'export const typeDefault = <T /* default type */ = unknown>(value: T) => 1 < /T>Profiler/.source.length;'
						: 'export const asserted = (<T>value) < /T>Profiler/.source.length;'),
			});
			const report = await bridgeReport({ packageName: 'generic-regex', projectRoot: root });
			expect(report.filesScanned).toBe(1);
			expect(report.apis.find((row) => row.name === 'Profiler')).toBeUndefined();
			expect(report.verdict).toBe('bridgeable');
		},
	);

	it('retains actual JSX rendering after typed-looking text in authored .jsx', async () => {
		const root = await mkdtemp(join(tmpdir(), 'octane-bridge-'));
		await writeFakePackage(root, 'jsx-text', {
			'index.jsx':
				'import React from "react"; export const App = () => <span>(value: T) => text</span>; export const View = () => <React.Profiler />;',
		});
		const report = await bridgeReport({ packageName: 'jsx-text', projectRoot: root });
		expect(report.filesScanned).toBe(1);
		expect(report.apis.find((row) => row.name === 'Profiler')?.status).toBe('unsupported');
		expect(report.verdict).toBe('needs-rework');
	});

	it.each(['tsx', 'jsx'])(
		'keeps a numeric comparison regex inert in authored .%s',
		async (extension) => {
			const root = await mkdtemp(join(tmpdir(), 'octane-bridge-'));
			await writeFakePackage(root, 'safe-regex', {
				[`index.${extension}`]:
					'const safe = 1 < /Profiler>/.source.length; export default function View(){return null;}',
			});
			const report = await bridgeReport({ packageName: 'safe-regex', projectRoot: root });
			expect(report.filesScanned).toBe(1);
			expect(report.apis.find((row) => row.name === 'Profiler')).toBeUndefined();
			expect(report.verdict).toBe('bridgeable');
		},
	);

	it('reports forwardRef usage as bridgeable-with-rewrites', async () => {
		const root = await mkdtemp(join(tmpdir(), 'octane-bridge-'));
		await writeFakePackage(root, 'ref-lib', {
			'index.js': `
				import { forwardRef } from 'react';
				export const Thing = forwardRef((props, ref) => null);
			`,
		});
		const report = await bridgeReport({ packageName: 'ref-lib', projectRoot: root });
		expect(report.verdict).toBe('bridgeable-with-rewrites');
		expect(report.plan.join('\n')).toContain('forwardRef');
	});

	it('lazy plus Suspense stays bridgeable', async () => {
		const root = await mkdtemp(join(tmpdir(), 'octane-bridge-'));
		await writeFakePackage(root, 'lazy-lib', {
			'index.js': `
				import { lazy, Suspense } from 'react';
				export const Panel = lazy(() => import('./panel.js'));
				export { Suspense };
			`,
		});
		const report = await bridgeReport({ packageName: 'lazy-lib', projectRoot: root });
		expect(report.apis.find((row) => row.name === 'lazy').status).toBe('same');
		expect(report.verdict).toBe('bridgeable');
	});

	it('routes streaming SSR entry points to octane/server as a rewrite', async () => {
		const root = await mkdtemp(join(tmpdir(), 'octane-bridge-'));
		await writeFakePackage(root, 'streamer', {
			'index.js': `
				import { renderToPipeableStream } from 'react-dom/server';
				export const ssr = (el) => renderToPipeableStream(el);
			`,
		});
		const report = await bridgeReport({ packageName: 'streamer', projectRoot: root });
		expect(report.apis.find((row) => row.name === 'renderToPipeableStream').status).toBe('rewrite');
		expect(report.verdict).toBe('bridgeable-with-rewrites');
		expect(report.plan.join('\n')).toContain('octane/server');
	});

	it('reports class components as bridgeable with mandatory rewrites', async () => {
		const root = await mkdtemp(join(tmpdir(), 'octane-bridge-'));
		await writeFakePackage(root, 'classy', {
			'index.js': `
				import React from 'react';
				export class Panel extends React.Component { render() { return null; } }
			`,
		});
		const report = await bridgeReport({ packageName: 'classy', projectRoot: root });
		expect(report.classComponents).toBe(true);
		expect(report.apis.find((row) => row.name === 'Component').status).toBe('rewrite');
		expect(report.verdict).toBe('bridgeable-with-rewrites');
	});

	it('reserves needs-rework for a public React API with no Octane rewrite', async () => {
		const root = await mkdtemp(join(tmpdir(), 'octane-bridge-'));
		await writeFakePackage(root, 'profiler-lib', {
			'index.js': `
				import { Profiler } from 'react';
				export { Profiler };
			`,
		});
		const report = await bridgeReport({ packageName: 'profiler-lib', projectRoot: root });
		expect(report.apis.find((row) => row.name === 'Profiler').status).toBe('unsupported');
		expect(report.verdict).toBe('needs-rework');
	});

	it('surfaces an existing official binding', async () => {
		const root = await mkdtemp(join(tmpdir(), 'octane-bridge-'));
		await writeFakePackage(root, 'zustand', { 'index.js': `export {};` });
		const report = await bridgeReport({ packageName: 'zustand', projectRoot: root });
		expect(report.existingBinding).toBe('@octanejs/zustand');
		expect(report.plan[0]).toContain('@octanejs/zustand');
	});

	it('tells the caller to bridge from a pinned copy of the upstream source', async () => {
		const root = await mkdtemp(join(tmpdir(), 'octane-bridge-'));
		await writeFakePackage(root, 'widgets', {
			'index.js': `
				import { useState } from 'react';
				export function useWidget() { return useState(0); }
			`,
		});
		const report = await bridgeReport({ packageName: 'widgets', projectRoot: root });
		expect(report.plan.join('\n')).toContain('Pin the upstream version');
	});

	it('errors clearly when the package is not installed', async () => {
		const root = await mkdtemp(join(tmpdir(), 'octane-bridge-'));
		const report = await bridgeReport({ packageName: 'missing-lib', projectRoot: root });
		expect(report.error).toContain('missing-lib');
	});

	it('scans a bare path without a package name', async () => {
		const root = await mkdtemp(join(tmpdir(), 'octane-bridge-'));
		await writeFile(
			join(root, 'component.jsx'),
			`import { useState } from 'react';
			export function C() { const [n] = useState(0); return n; }`,
		);
		const report = await bridgeReport({ path: root });
		expect(report.filesScanned).toBe(1);
		expect(report.verdict).toBe('bridgeable');
	});
});

describe('bridgeReportFromSource', () => {
	it('produces the same verdict and plan as bridgeReport without touching the filesystem', () => {
		const report = bridgeReportFromSource(`
			import { forwardRef, useState } from 'react';
			export const Thing = forwardRef((props, ref) => {
				const [n] = useState(0);
				return n;
			});
		`);
		expect(report.target).toBe('pasted-source');
		expect(report.reactImports).toContain('react');
		expect(report.verdict).toBe('bridgeable-with-rewrites');
		expect(report.apis.find((row) => row.name === 'forwardRef').status).toBe('rewrite');
		expect(report.plan.join('\n')).toContain('forwardRef');
	});

	it('reports class components as bridgeable with mandatory rewrites', () => {
		const report = bridgeReportFromSource(`
			import React from 'react';
			export class Panel extends React.Component { render() { return null; } }
		`);
		expect(report.classComponents).toBe(true);
		expect(report.verdict).toBe('bridgeable-with-rewrites');
		expect(report.plan.join('\n')).toContain('function component');
	});

	it('surfaces the official binding and vanilla core when a package name is given', () => {
		const report = bridgeReportFromSource(`export {};`, {
			packageName: '@tanstack/react-query',
		});
		expect(report.target).toBe('@tanstack/react-query');
		expect(report.existingBinding).toBe('@octanejs/tanstack-query');
		expect(report.vanillaCore).toBe('@tanstack/query-core');
		expect(report.plan[0]).toContain('@octanejs/tanstack-query');
	});

	it('routes the React Monaco adapter to its framework-neutral editor core', () => {
		const report = bridgeReportFromSource(`export {};`, {
			packageName: '@monaco-editor/react',
		});
		expect(report.existingBinding).toBe('@octanejs/monaco-editor');
		expect(report.vanillaCore).toBe('monaco-editor');
		expect(report.plan[0]).toContain('@octanejs/monaco-editor');
	});

	it('same-name hook usage stays bridgeable', () => {
		const report = bridgeReportFromSource(`
			import { useSyncExternalStore } from 'react';
			export function useStore(api, selector) {
				return useSyncExternalStore(api.subscribe, () => selector(api.getState()));
			}
		`);
		expect(report.verdict).toBe('bridgeable');
	});
});

describe('KNOWN_BINDINGS', () => {
	it('maps react-alien-signals to the Octane binding and vanilla core', () => {
		expect(KNOWN_BINDINGS['react-alien-signals']).toBe('@octanejs/alien-signals');
		expect(KNOWN_VANILLA_CORES['react-alien-signals']).toBe('alien-signals');
	});

	it('maps react-textarea-autosize to the exact Octane binding', () => {
		expect(KNOWN_BINDINGS['react-textarea-autosize']).toBe('@octanejs/textarea-autosize');
	});

	it('maps react-select to the exact Octane binding', () => {
		expect(KNOWN_BINDINGS['react-select']).toBe('@octanejs/select');
	});

	it('maps react-window to its exact official Octane binding', () => {
		expect(KNOWN_BINDINGS['react-window']).toBe('@octanejs/window');
	});

	it('maps TanStack React DB to the Octane binding and framework-neutral core', () => {
		expect(KNOWN_BINDINGS['@tanstack/react-db']).toBe('@octanejs/tanstack-db');
		expect(KNOWN_VANILLA_CORES['@tanstack/react-db']).toBe('@tanstack/db');
	});

	it('maps XYFlow React to the Octane binding and framework-neutral system core', () => {
		expect(KNOWN_BINDINGS['@xyflow/react']).toBe('@octanejs/xyflow');
		expect(KNOWN_VANILLA_CORES['@xyflow/react']).toBe('@xyflow/system');
	});

	it('maps Streamdown and every official plugin package to the consolidated binding', () => {
		const upstreamPackages = [
			'streamdown',
			'@streamdown/code',
			'@streamdown/math',
			'@streamdown/mermaid',
			'@streamdown/cjk',
		];
		expect(upstreamPackages.every((name) => KNOWN_BINDINGS[name] === '@octanejs/streamdown')).toBe(
			true,
		);
	});

	it('maps every public Visx entry point to the aggregate Octane port', async () => {
		const packagesRoot = fileURLToPath(new URL('../..', import.meta.url));
		const manifest = JSON.parse(await readFile(join(packagesRoot, 'visx', 'package.json'), 'utf8'));
		const upstreamPackages = Object.keys(manifest.exports).map((entry) =>
			entry === '.' ? '@visx/visx' : `@visx/${entry.slice(2)}`,
		);
		expect(upstreamPackages).toHaveLength(49);
		expect(upstreamPackages.every((name) => KNOWN_BINDINGS[name] === '@octanejs/visx')).toBe(true);
	});

	it('covers every published @octanejs binding (derived from workspace manifests)', () => {
		// Use the same role classification as the generated package inventory so
		// metaframeworks and infrastructure cannot drift into the binding catalog.
		const bindings = getBindingPackages();
		expect(bindings.length).toBeGreaterThan(0);
		expect(new Set([...Object.values(KNOWN_BINDINGS), ...KNOWN_NATIVE_BINDINGS])).toEqual(
			new Set(bindings.map(({ name }) => name)),
		);
		expect(KNOWN_BINDING_PACKAGE_DIRS).toEqual(new Set(bindings.map(({ dir }) => dir)));
	});
});
