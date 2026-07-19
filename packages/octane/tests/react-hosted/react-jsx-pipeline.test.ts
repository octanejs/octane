/**
 * Mixed-toolchain pipeline proof for `requireDirective`
 * (react-hosted-octane-compat-plan.md — build integration).
 *
 * A React host module goes through the REAL automatic-runtime JSX transform
 * (TypeScript's `react-jsx` emit — the same `jsx(type, props, key)` element
 * output esbuild, swc, and babel produce), while the Octane island it renders
 * is compiled by the Octane compiler. One page, two compilers: a project
 * `.tsrx` is Octane's by extension, and an Octane-owned `.tsx` opts in with a
 * leading `@jsxImportSource octane` pragma:
 *
 *  - the Octane compiler (requireDirective) passes the host `.tsx` through
 *    untouched and compiles the island;
 *  - the transpiled host evaluates against real `react/jsx-runtime` and
 *    mounts the island through `OctaneCompat`, staying live across host
 *    re-renders and unmounting cleanly.
 */
import { describe, expect, it } from 'vitest';
import * as React from 'react';
import * as ReactJsxRuntime from 'react/jsx-runtime';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import ts from 'typescript';
import { OctaneCompat } from 'octane/react';
import * as OctaneReactModule from 'octane/react';
import { createOctaneCompiler } from '../../src/compiler/bundler.js';
import { BadgeIsland } from './_fixtures/islands.tsrx';
import { reactAct } from './_react-host.js';

/** The React host, exactly as an app would author it in a plain `.tsx` file. */
const HOST_SOURCE = `
import * as React from 'react';
import { OctaneCompat } from 'octane/react';
import { BadgeIsland } from './islands';

export function HostApp(props: { label: string }) {
	const [shown, setShown] = React.useState(true);
	return (
		<main className="react-host">
			<button className="toggle" onClick={() => setShown(!shown)}>toggle</button>
			{shown ? (
				<OctaneCompat>
					<BadgeIsland label={props.label} />
				</OctaneCompat>
			) : (
				<p className="empty">no island</p>
			)}
		</main>
	);
}
`;

function transpileWithReactJsx(source: string): string {
	const out = ts.transpileModule(source, {
		compilerOptions: {
			jsx: ts.JsxEmit.ReactJSX,
			module: ts.ModuleKind.CommonJS,
			target: ts.ScriptTarget.ES2022,
			esModuleInterop: true,
		},
		fileName: 'HostApp.tsx',
	});
	return out.outputText;
}

function evaluateHostModule(code: string): { HostApp: React.ComponentType<{ label: string }> } {
	const modules: Record<string, unknown> = {
		react: React,
		'react/jsx-runtime': ReactJsxRuntime,
		'octane/react': OctaneReactModule,
		'./islands': { BadgeIsland },
	};
	const exportsObject: Record<string, unknown> = {};
	const moduleObject = { exports: exportsObject };
	const requireShim = (request: string) => {
		if (request in modules) return modules[request];
		throw new Error(`Unexpected host-module import: ${request}`);
	};
	new Function('require', 'module', 'exports', code)(requireShim, moduleObject, exportsObject);
	return moduleObject.exports as { HostApp: React.ComponentType<{ label: string }> };
}

describe('React JSX transform + Octane compiler in one pipeline (requireDirective)', () => {
	it('routes host .tsx to React and the island to Octane', () => {
		const compiler = createOctaneCompiler({
			root: resolve('/project'),
			requireDirective: true,
		});
		// Octane leaves the React host module to the host toolchain, untouched.
		expect(compiler.transform(HOST_SOURCE, '/project/src/HostApp.tsx')).toBeNull();
		// The island .tsrx compiles by extension — no marker needed.
		const islandSource = readFileSync(
			join(process.cwd(), 'packages/octane/tests/react-hosted/_fixtures/islands.tsrx'),
			'utf8',
		);
		expect(compiler.transform(islandSource, '/project/src/islands.tsrx')?.kind).toBe('compile');
		// Octane-in-.tsx authoring opts in with the leading pragma instead.
		const pragmaTsx = compiler.transform(
			"/** @jsxImportSource octane */\nexport function Badge() @{ <p>{'badge'}</p> }\n",
			'/project/src/Badge.tsx',
		);
		expect(pragmaTsx?.kind).toBe('compile');
	});

	it('renders an Octane island from a host compiled by the real React JSX transform', async () => {
		const hostJs = transpileWithReactJsx(HOST_SOURCE);
		// The host really went through the automatic runtime — no
		// createElement, no Octane codegen.
		expect(hostJs).toContain('react/jsx-runtime');
		const { HostApp } = evaluateHostModule(hostJs);
		expect(typeof HostApp).toBe('function');

		const { createRoot } = await import('react-dom/client');
		const container = document.createElement('div');
		document.body.appendChild(container);
		const root = createRoot(container);
		try {
			await reactAct(async () => {
				root.render(React.createElement(HostApp, { label: 'pipeline' }));
			});
			expect(container.querySelector('.badge')?.textContent).toBe('badge:pipeline');

			// Host state drives the island's lifecycle like any React child.
			await reactAct(async () => {
				(container.querySelector('.toggle') as HTMLButtonElement).click();
			});
			expect(container.querySelector('.badge')).toBeNull();
			expect(container.querySelector('.empty')?.textContent).toBe('no island');
			await reactAct(async () => {
				(container.querySelector('.toggle') as HTMLButtonElement).click();
			});
			expect(container.querySelector('.badge')?.textContent).toBe('badge:pipeline');

			// Host prop updates flow into the mounted island (§10 update path).
			await reactAct(async () => {
				root.render(React.createElement(HostApp, { label: 'updated' }));
			});
			expect(container.querySelector('.badge')?.textContent).toBe('badge:updated');
		} finally {
			await reactAct(async () => root.unmount());
			container.remove();
		}
		expect(document.querySelector('.badge')).toBeNull();
	});

	it('sanity: OctaneCompat consumed here is the shipped public export', () => {
		// The evaluated host module received the same OctaneCompat binding the
		// rest of the suite exercises — the runtime proof above covers the
		// public island contract, not a test-local shim.
		expect(OctaneReactModule.OctaneCompat).toBe(OctaneCompat);
	});
});
