import { describe, expect, it } from 'vitest';
import { compile } from 'octane/compiler';
import { mount } from './_helpers.js';
// Client compile of a fixture using every affected path: importing it at all
// proves the emission is valid JS (an unescaped newline would be a module-load
// SyntaxError).
import { SpreadHost, PropChip } from './_fixtures/multiline-string-attr.tsrx';

// JSX string ATTRIBUTES may legally span lines (multi-line class strings are
// common in Tailwind-heavy React code — tanstack.com's homepage has several).
// The raw JSX slice of such a literal is NOT a valid JS string literal; three
// emission paths sliced raw source and produced unparseable output: the
// hostValue/spread binding path (printExpr), the createElement de-opt path,
// and the SSR warm-child plan. Found porting tanstack.com (Phase 2c).
describe('multi-line JSX string attributes', () => {
	const MULTILINE =
		'export function App(props: any) {\n\treturn (\n\t\t<div {...props.rest} class="one\n\t\ttwo" />\n\t);\n}\n';
	const PROP =
		'function Chip(props: any) { return <span>{props.title as string}</span>; }\nexport function App() {\n\treturn <Chip title="one\n\ttwo" />;\n}\n';

	it('client + server compiles emit loadable JS for every affected path', () => {
		for (const src of [MULTILINE, PROP]) {
			for (const mode of [undefined, 'server'] as const) {
				const { code } = compile(src, 'App.tsrx', mode ? { mode } : {});
				// The literal must appear escaped, never as a raw line break
				// inside a quoted string.
				expect(code).not.toMatch(/"one\n/);
				expect(code).not.toMatch(/'one\n/);
			}
		}
	});

	it('the multi-line value round-trips to the DOM intact', () => {
		const mounted = mount(SpreadHost as any, { rest: { 'data-x': '1' } });
		try {
			expect(mounted.find('div').getAttribute('class')).toBe('one\n\t\ttwo');
		} finally {
			mounted.unmount();
		}
	});

	it('component props carry the multi-line string intact', () => {
		const mounted = mount(PropChip as any, {});
		try {
			expect(mounted.find('span').textContent).toBe('one\n\t\ttwo');
		} finally {
			mounted.unmount();
		}
	});
});

// Sibling warm-plan emission bug found in the same integration pass: warm-child
// prop KEYS printed as bare Identifiers, so aria-*/data-* props emitted
// `aria-hidden:` (a parse error). Keys must quote when non-identifier.
describe('warm-child plans quote non-identifier prop keys', () => {
	it('server emit with aria-/data- props parses', () => {
		const src = [
			"import { Loader2 } from '@octanejs/lucide';",
			'export function Spinner() {',
			'\treturn <Loader2 aria-hidden="true" data-testid="spin" class="animate-spin" />;',
			'}',
			'',
		].join('\n');
		const { code } = compile(src, 'Spinner.tsrx', { mode: 'server' });
		expect(code).not.toMatch(/[^"']aria-hidden:/);
		expect(code).toMatch(/"aria-hidden"/);
	});
});
