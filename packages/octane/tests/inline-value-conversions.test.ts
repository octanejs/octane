import { describe, expect, it } from 'vitest';
import { createRoot, flushSync, hydrateRoot } from 'octane';
import { renderToString } from 'octane/server';
import { createScope } from 'octane/signals';
import * as client from './_fixtures/inline-value-conversions.tsrx';
import { loadCompiledFixtureSource, loadServerFixture } from './_server-fixture.js';

const server = loadServerFixture<typeof client>(
	'packages/octane/tests/_fixtures/inline-value-conversions.tsrx',
	{ compileOptions: { dev: process.env.OCTANE_TEST_COMPILE_MODE !== 'prod', hmr: false } },
);
const mutations: client.Mutation[] = [
	'cast',
	'nonNull',
	'satisfies',
	'optionalCall',
	'optionalReceiver',
	'extracted',
	'receiverAlias',
	'destructured',
	'assignment',
	'assign',
	'getter',
	'prototype',
];

function restoreGlobals(run: () => void) {
	const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'String')!;
	const prototype = Object.getPrototypeOf(globalThis);
	try {
		run();
	} finally {
		Object.setPrototypeOf(globalThis, prototype);
		Object.defineProperty(globalThis, 'String', descriptor);
	}
}

describe.each(mutations)('inline conversion after visible %s mutation', (mutation) => {
	it('renders the real handle on the server and adopts its draft before live updates', () => {
		const scope = createScope({ scopeKey: 'inline-value-conversion' });
		const value$ = scope.signal$('value', 'first');
		const builtin = String;
		const replacement = (value: unknown) => (value === value$ ? value : builtin(value));
		// DOM implementations also use String's static conversion methods. Keep
		// that preparation outside the authored component's mutation proof.
		Object.setPrototypeOf(replacement, builtin);
		const prototype = Object.create(Object.getPrototypeOf(globalThis));
		Object.defineProperty(prototype, 'String', { value: replacement, configurable: true });
		const props = { mutation, method: 'set' as const, value$, replacement, prototype };
		const host = document.createElement('div');
		document.body.append(host);
		let root: ReturnType<typeof createRoot> | undefined;
		try {
			restoreGlobals(() => {
				host.innerHTML = renderToString(server.InlineValue, props).html;
			});
			const output = host.querySelector('output')!;
			const input = host.querySelector('input')!;
			expect([output.textContent, output.title, input.value]).toEqual(['first', 'first', 'first']);
			input.value = 'typed draft';
			input.focus();
			input.setSelectionRange(2, 6);
			restoreGlobals(() => {
				flushSync(() => {
					root = hydrateRoot(host, client.InlineValue, props);
				});
			});
			expect(host.querySelector('output')).toBe(output);
			expect(host.querySelector('input')).toBe(input);
			expect(document.activeElement).toBe(input);
			expect([input.value, input.selectionStart, input.selectionEnd]).toEqual([
				'typed draft',
				2,
				6,
			]);
			flushSync(() => scope.set(value$, 'next'));
			expect([output.textContent, output.title, input.value]).toEqual(['next', 'next', 'next']);
			expect(host.querySelector('output')).toBe(output);
			expect(document.activeElement).toBe(input);
			root!.unmount();
			root = undefined;
			expect(host.childNodes.length).toBe(0);
			flushSync(() => scope.set(value$, 'retired'));
			expect([output.textContent, output.title, input.value]).toEqual(['next', 'next', 'next']);
		} finally {
			root?.unmount();
			scope.dispose();
			host.remove();
		}
	});
});

// Each replacement reaches the global object through an alias no receiver
// pattern names: a mutable binding, a parameter, a self-reference, a returned
// value, or an array element. None of them may keep a builtin text proof.
const aliasedMutations: Record<string, string> = {
	letAlias: 'let g: any = globalThis; g.String = props.replacement;',
	parameterAlias:
		'const install = (g: any) => { g.String = props.replacement; }; install(globalThis);',
	selfReference: '(globalThis as any).globalThis.String = props.replacement;',
	returnedGlobal: 'const getG = () => globalThis as any; getG().String = props.replacement;',
	escapedTarget:
		"const target = [globalThis][0]; Reflect.set(target, 'String', props.replacement);",
	letNamespace:
		"let R: any = Reflect; const g = globalThis; R.set(g, 'String', props.replacement);",
};

describe.each(Object.entries(aliasedMutations))(
	'inline conversion after %s mutation',
	(_, code) => {
		it.each([
			['inline', '<output>{String(props.value$) as string}</output>'],
			['local', '<output>{local}</output>'],
		])('renders the real handle on the server (%s)', (_, use) => {
			const source = `import type { SignalHandle } from 'octane/signals';
export function View(props: { value$: SignalHandle<string>; replacement: any }) @{
	${code}
	const local = String(props.value$);
	${use}
}`;
			for (const dev of [false, true]) {
				const { View } = loadCompiledFixtureSource<{ View: any }>(source, {
					id: '/project/AliasedIntrinsicMutation.tsrx',
					mode: 'server',
					compileOptions: { dev, hmr: false },
				});
				const scope = createScope({ scopeKey: 'aliased-inline-conversion' });
				const value$ = scope.signal$('value', 'first');
				const builtin = String;
				const replacement = (value: unknown) => (value === value$ ? value : builtin(value));
				Object.setPrototypeOf(replacement, builtin);
				let html = '';
				try {
					restoreGlobals(() => {
						html = renderToString(View, { value$, replacement }).html;
					});
				} finally {
					scope.dispose();
				}
				expect(html).toMatch(/<output>(?:<!--\[-->)?first(?:<!--\]-->)?<\/output>/);
			}
		});
	},
);
