import { describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
	bridgeReport,
	bridgeReportFromSource,
	detectVanillaCore,
	scanSource,
	KNOWN_BINDINGS,
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

	it('reports class components as needs-rework', async () => {
		const root = await mkdtemp(join(tmpdir(), 'octane-bridge-'));
		await writeFakePackage(root, 'classy', {
			'index.js': `
				import React from 'react';
				export class Panel extends React.Component { render() { return null; } }
			`,
		});
		const report = await bridgeReport({ packageName: 'classy', projectRoot: root });
		expect(report.classComponents).toBe(true);
		expect(report.verdict).toBe('needs-rework');
	});

	it('surfaces an existing official binding', async () => {
		const root = await mkdtemp(join(tmpdir(), 'octane-bridge-'));
		await writeFakePackage(root, 'zustand', { 'index.js': `export {};` });
		const report = await bridgeReport({ packageName: 'zustand', projectRoot: root });
		expect(report.existingBinding).toBe('@octanejs/zustand');
		expect(report.plan[0]).toContain('@octanejs/zustand');
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

	it('reports class components as needs-rework', () => {
		const report = bridgeReportFromSource(`
			import React from 'react';
			export class Panel extends React.Component { render() { return null; } }
		`);
		expect(report.classComponents).toBe(true);
		expect(report.verdict).toBe('needs-rework');
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
	it('maps every public Visx entry point to the aggregate Octane port', async () => {
		const packagesRoot = fileURLToPath(new URL('../..', import.meta.url));
		const manifest = JSON.parse(await readFile(join(packagesRoot, 'visx', 'package.json'), 'utf8'));
		const upstreamPackages = Object.keys(manifest.exports).map((entry) =>
			entry === '.' ? '@visx/visx' : `@visx/${entry.slice(2)}`,
		);
		expect(upstreamPackages).toHaveLength(49);
		expect(upstreamPackages.every((name) => KNOWN_BINDINGS[name] === '@octanejs/visx')).toBe(true);
	});

	it('covers every published @octanejs binding (derived from workspace manifests)', async () => {
		// The expected set is DERIVED from packages/*/package.json rather than
		// hand-maintained, so publishing a new binding without registering it in
		// KNOWN_BINDINGS fails here. Only genuinely-not-a-binding packages (the
		// core runtime, build/deploy infrastructure, this MCP server) are
		// excluded by name.
		const NON_BINDINGS = new Set([
			'octane',
			'@octanejs/app-core',
			'@octanejs/rspack-plugin',
			'@octanejs/rsbuild-plugin',
			'@octanejs/vite-plugin',
			'@octanejs/adapter-vercel',
			'@octanejs/mcp-server',
		]);
		const packagesRoot = fileURLToPath(new URL('../..', import.meta.url));
		const bindings = [];
		const bindingDirectories = [];
		for (const entry of await readdir(packagesRoot, { withFileTypes: true })) {
			if (!entry.isDirectory()) continue;
			let manifest;
			try {
				manifest = JSON.parse(
					await readFile(join(packagesRoot, entry.name, 'package.json'), 'utf8'),
				);
			} catch {
				continue; // not a package dir
			}
			if (manifest.private || NON_BINDINGS.has(manifest.name)) continue;
			bindings.push(manifest.name);
			bindingDirectories.push(entry.name);
		}
		expect(bindings.length).toBeGreaterThan(0);
		expect(new Set(Object.values(KNOWN_BINDINGS))).toEqual(new Set(bindings));
		expect(KNOWN_BINDING_PACKAGE_DIRS).toEqual(new Set(bindingDirectories));
	});
});
