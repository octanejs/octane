import { describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { bridgeReport, detectVanillaCore, scanSource, KNOWN_BINDINGS } from './bridge.js';

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

describe('KNOWN_BINDINGS', () => {
	it('covers every published @octanejs binding', () => {
		expect(new Set(Object.values(KNOWN_BINDINGS))).toEqual(
			new Set([
				'@octanejs/zustand',
				'@octanejs/tanstack-query',
				'@octanejs/motion',
				'@octanejs/stylex',
				'@octanejs/tanstack-router',
				'@octanejs/lexical',
				'@octanejs/floating-ui',
				'@octanejs/radix',
			]),
		);
	});
});
