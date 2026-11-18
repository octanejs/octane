// @vitest-environment node

// `octane` and `octane/server` expose only public API. Compiler-emitted
// helpers come from `octane/internal/client` and `octane/internal/server`, so
// compiled output must never import anything else from a public entry.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseModule } from '@tsrx/core';
import { describe, expect, it } from 'vitest';
import * as client from '../../src/index.js';
import * as internalClient from '../../src/internal/client.js';
import * as internalServer from '../../src/internal/server.js';
import * as server from '../../src/server/index.js';
import { compile } from '../../src/compiler/compile.js';
import {
	CLIENT_PUBLIC_RUNTIME_EXPORTS,
	SERVER_PUBLIC_RUNTIME_EXPORTS,
} from '../../src/compiler/public-runtime-exports.js';
import { slotHooks } from '../../src/compiler/slot-hooks.js';

const PUBLIC = new Map<string, ReadonlySet<string>>([
	['octane', CLIENT_PUBLIC_RUNTIME_EXPORTS],
	['octane/server', SERVER_PUBLIC_RUNTIME_EXPORTS],
]);
const ANY_PUBLIC = new Set([...CLIENT_PUBLIC_RUNTIME_EXPORTS, ...SERVER_PUBLIC_RUNTIME_EXPORTS]);
const INTERNAL = new Map<string, ReadonlySet<string>>([
	['octane/internal/client', new Set(Object.keys(internalClient))],
	['octane/internal/server', new Set(Object.keys(internalServer))],
]);

/** Every non-public name on a public entry, and every missing internal name. */
function runtimeImportViolations(code: string): string[] {
	const violations: string[] = [];
	for (const statement of parseModule(code, 'compiled.js').body as any[]) {
		if (statement.type !== 'ImportDeclaration' && statement.type !== 'ExportNamedDeclaration')
			continue;
		const request = statement.source?.value;
		const publicNames = PUBLIC.get(request);
		const internalNames = INTERNAL.get(request);
		if (!publicNames && !internalNames) continue;
		for (const specifier of statement.specifiers ?? []) {
			if (specifier.type !== 'ImportSpecifier' && specifier.type !== 'ExportSpecifier') continue;
			if (statement.importKind === 'type' || specifier.importKind === 'type') continue;
			const imported = specifier.imported?.name ?? specifier.local?.name;
			// A fixture may author a client-only API into a server compile; the
			// compiler's own helpers must be public on the entry they import from.
			const emitted = specifier.local?.name?.startsWith('_$');
			if (publicNames && !(emitted ? publicNames : ANY_PUBLIC).has(imported))
				violations.push(`${imported} from ${request}`);
			if (internalNames && emitted && !internalNames.has(imported))
				violations.push(`${imported} missing from ${request}`);
		}
	}
	return violations;
}

describe('public runtime entries', () => {
	it('lists exactly the value exports of octane and octane/server', () => {
		expect([...CLIENT_PUBLIC_RUNTIME_EXPORTS].sort()).toEqual(Object.keys(client).sort());
		expect([...SERVER_PUBLIC_RUNTIME_EXPORTS].sort()).toEqual(Object.keys(server).sort());
	});

	it('keeps compiler-emitted helpers off the public entries', () => {
		const fixtures = join(import.meta.dirname, '../_fixtures');
		let compiled = 0;
		const violations = new Set<string>();
		for (const file of readdirSync(fixtures).filter((name) => name.endsWith('.tsrx'))) {
			const source = readFileSync(join(fixtures, file), 'utf8');
			for (const options of [
				{ mode: 'client', dev: false, hmr: false },
				{ mode: 'client', dev: true, hmr: false },
				{ mode: 'server' },
			] as const) {
				let code: string;
				try {
					code = compile(source, file, options).code;
				} catch {
					continue; // Fixtures that pin compile errors.
				}
				compiled++;
				for (const violation of runtimeImportViolations(code))
					violations.add(`${file} (${options.mode}): ${violation}`);
			}
		}
		expect(compiled).toBeGreaterThan(500);
		expect([...violations]).toEqual([]);
	}, 120_000);

	it('leaves universal renderers to resolve bare octane themselves', () => {
		// An inferred method dependency emits `__methodDep`, which universal
		// runtimes re-export from bare `octane` rather than the DOM internal entry.
		const source = `import { useMemo } from 'octane';
			export function Panel(props) @{
				const value = useMemo(() => props.format(props.value));
				<view>{value as string}</view>
			}`;
		const renderer = { id: 'native', module: 'custom-native-runtime', target: 'universal' };
		const { code } = compile(source, 'panel.tsrx', { dev: false, hmr: false, renderer });
		const requests = (parseModule(code, 'panel.js').body as any[])
			.filter((statement) => statement.type === 'ImportDeclaration')
			.map((statement) => statement.source.value);
		expect(code).toContain('__methodDep');
		expect(requests).not.toContain('octane/internal/client');
	});

	it('keeps plain-module hook helpers off the public entries', () => {
		const source = `
			import { use, useMemo, useState } from 'octane';
			export function useCounter(promise, step) {
				const [count, setCount, getCount] = useState(0);
				const value = use(promise);
				const double = useMemo(() => count * step, [count, step]);
				return { count, setCount, getCount, value, double };
			}
		`;
		for (const environment of ['client', 'server'] as const) {
			for (const inlineHookMemo of [false, true]) {
				const out = slotHooks(source, 'use-counter.ts', { environment, inlineHookMemo });
				// Bare `octane` is retargeted for server builds after this pass.
				const code = out!.code;
				expect(code).toContain(`from 'octane/internal/${environment}'`);
				expect(runtimeImportViolations(code)).toEqual([]);
			}
		}
	});
});
