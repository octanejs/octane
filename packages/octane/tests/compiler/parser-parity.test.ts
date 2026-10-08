// @vitest-environment node

import { afterEach, describe, expect, it, vi } from 'vitest';
import { DIAGNOSTIC_CODES } from '@tsrx/core/diagnostics';
import { parseModule as parseNativeModule } from '@tsrx/oxc/tsrx-core-compat';
import { compile } from '../../src/compiler/index.js';
import { parseModule as parseBrowserModule } from '../../src/compiler/parser.browser.js';

// Octane parses with `@tsrx/oxc` on Node, and with `@tsrx/core` in the browser
// compiler and whenever `@tsrx/oxc` rejects a file on Node. The same source must
// compile to the same output with either parser.
vi.mock('@tsrx/oxc/tsrx-core-compat', async (importOriginal) => {
	const actual = await importOriginal<typeof import('@tsrx/oxc/tsrx-core-compat')>();
	return { ...actual, parseModule: vi.fn(actual.parseModule) };
});

afterEach(() => {
	vi.mocked(parseNativeModule).mockReset();
});

type Mode = 'client' | 'server';

function compileWith(parser: 'oxc' | 'core', source: string, mode: Mode): string {
	if (parser === 'core') {
		vi.mocked(parseNativeModule).mockImplementation(() => {
			throw new SyntaxError('parse with @tsrx/core');
		});
	}
	try {
		return compile(source, 'App.tsrx', { mode, hmr: false }).code;
	} finally {
		vi.mocked(parseNativeModule).mockReset();
	}
}

/** Compiles `source` with both parsers in `mode` and returns the one output. */
function compileBoth(source: string, mode: Mode): string {
	const oxc = compileWith('oxc', source, mode);
	expect(compileWith('core', source, mode)).toBe(oxc);
	return oxc;
}

const SOURCES: Record<string, { source: string; client: string; server: string }> = {
	// #1327: an attribute string is decoded once.
	'a double-encoded reference in an attribute': {
		source: `export function App() @{\n\t<div title="a &amp;lt;b&amp;gt;">x</div>\n}`,
		client: 'title=\\"a &amp;lt;b&amp;gt;\\"',
		server: 'title="a &amp;lt;b&amp;gt;"',
	},
	// `@tsrx/oxc` rejects a `>` in text, so on Node this file always parses with core.
	'a double-encoded attribute beside a > in text': {
		source: `export function App() @{\n\t<div title="a &amp;lt;b&amp;gt;">1 > 0</div>\n}`,
		client: 'title=\\"a &amp;lt;b&amp;gt;\\">1 &gt; 0',
		server: 'title="a &amp;lt;b&amp;gt;">${`1 &gt; 0`}',
	},
	// #1330: text is decoded once, and JSX's whitespace rule applies to the
	// decoded text, as Babel applies it.
	'a double-encoded reference in text': {
		source: `export function App() @{\n\t<p>&amp;lt;b&amp;gt; &amp;amp;</p>\n}`,
		client: '<p>&amp;lt;b&amp;gt; &amp;amp;</p>',
		server: '<p>${`&amp;lt;b&amp;gt; &amp;amp;`}</p>',
	},
	'text that is only a reference': {
		source: `export function App() @{\n\t<p>&nbsp;</p>\n}`,
		client: '<p>\u00a0</p>',
		server: '<p>${`\u00a0`}</p>',
	},
	'an encoded line break at the end of a line': {
		source: `export function App() @{\n\t<p>a&#10;\n\t\tb</p>\n}`,
		client: '<p>a b</p>',
		server: '<p>${`a b`}</p>',
	},
	// JSX decodes the XHTML named references only, so a later HTML name is text.
	'a named reference JSX does not define': {
		source: `export function App() @{\n\t<p title="&check;">&check; &hellip;</p>\n}`,
		client: '<p title=\\"&amp;check;\\">&amp;check; \u2026</p>',
		server: '<p title="&amp;check;">${`&amp;check; \u2026`}</p>',
	},
	'CRLF line breaks in text': {
		source: 'export function App() @{\r\n\t<p>\r\n\t\ta &quot;b&quot;\r\n\t\tc\r\n\t</p>\r\n}',
		client: '<p>a \\"b\\" c</p>',
		server: '<p>${`a "b" c`}</p>',
	},
	// #1328, #1338: a comment between template texts renders like `{/* */}` in TSX.
	'a line comment between template texts': {
		source: `export function App() @{\n\t<p>\n\t\ta\n\t\t// note\n\t\tb\n\t</p>\n}`,
		client: '<p>ab</p>',
		server: '<p>${`ab`}</p>',
	},
	'a block comment in the text of plain-function JSX': {
		source: `export function App() {\n\treturn <p>a /* note */ b</p>;\n}`,
		client: '<p>a  b</p>',
		server: '<p>${`a  b`}</p>',
	},
	'the space after a comment before an element': {
		source: `export function App() @{\n\t<div>\n\t\t<b>t</b>\n\t\t/* c */ <i />\n\t</div>\n}`,
		client: '<b>t</b> <i></i>',
		server: '`<b>${`t`}</b>`} ${`<i></i>`}',
	},
	'slashes that touch other text': {
		source: `export function App() @{\n\t<p>see https://x.dev and a//b</p>\n}`,
		client: '<p>see https://x.dev and a//b</p>',
		server: 'see https://x.dev and a//b',
	},
	// #1330: a `>` in an element inside a container is text.
	'a > in an element inside a container': {
		source: `export function App({ c }) @{\n\t<main>{c && <b>{c} a > b</b>}</main>\n}`,
		client: "' a > b'",
		server: "' a > b'",
	},
	// #1353, #1355: layout text and an empty arm's comment render nothing.
	'layout text, comment children, and an empty arm': {
		source: `export function App({ k }) @{
	<ul>
		// items
		<li>one</li>
		@switch (k) {
			@case 1: {
				<li>two</li>
			}
			@default: {
				// nothing
			}
		}
	</ul>
}`,
		client: '<ul><li>one</li><!></ul>',
		server: '<li>${`one`}</li>',
	},
	// #1354: a type parameter's name is an Identifier in both trees.
	'type parameters': {
		source: `type Keys<X> = { [K in keyof X]: X[K] };
type Item<X> = X extends Array<infer U> ? U : never;
export function Pick<const T extends string>(props: { value: T; keys?: Keys<{ a: 1 }>; item?: Item<T[]> }) @{
	<b>{props.value as string}</b>
}`,
		client: '<b> </b>',
		server: '<b>',
	},
};

describe('Node and browser parsers compile the same output', () => {
	for (const [name, { source, client, server }] of Object.entries(SOURCES)) {
		it(name, () => {
			expect(compileBoth(source, 'client')).toContain(client);
			expect(compileBoth(source, 'server')).toContain(server);
		});
	}

	// #1329: JSX inside a dynamic tag is an error, not invalid output.
	it.each([
		['an arrow function', '<{() => <b>x</b>} />'],
		['a conditional', "<{c ? () => <b>x</b> : 'i'} />"],
		['a logical expression', '<{c || <b>x</b>} />'],
		['a @{ } body', '<{() => @{ <b>x</b> }} />'],
	])('rejects %s in a dynamic tag', (_name, element) => {
		const source = `export function App({ c }) @{\n\t<div>${element}</div>\n}`;
		const rejection = expect.objectContaining({
			message: expect.stringMatching(/dynamic tag expression must be/),
		});
		for (const mode of ['client', 'server'] as const) {
			expect(() => compileWith('oxc', source, mode)).toThrow(rejection);
		}
		// When both parsers reject a file, the Node entry reports `@tsrx/oxc`'s error,
		// so the browser compiler's parser is checked directly.
		expect(() => parseBrowserModule(source, 'App.tsrx')).toThrow(
			expect.objectContaining({ code: DIAGNOSTIC_CODES.DYNAMIC_TAG_EXPRESSION }),
		);
	});

	// Build tools show these fields: Vite takes the code frame from `pos` and the
	// position from `loc`. A syntax error is Acorn's, its zero-based position on
	// `loc` and at the end of its message; a template diagnostic is core's plain
	// `Error` with a `loc` range.
	it.each([
		[
			'a syntax error',
			'export function App() @{\n\t<div>{1 +}</div>\n}',
			{
				name: 'SyntaxError',
				message: 'Unexpected token (2:10)',
				code: 'TS1012',
				pos: 35,
				loc: { line: 2, column: 10 },
			},
		],
		[
			'an unclosed tag',
			'export function App() @{\n\t<div>\n\t\t<span>hi</span>\n}',
			{
				name: 'SyntaxError',
				message: "Unclosed tag '<div>'. Expected '</div>' before end of template. (4:0)",
				code: 'TSRX1001',
				pos: 50,
				loc: { line: 4, column: 0 },
			},
		],
		[
			'two outputs in one code block',
			'export function App() @{\n\t<div />\n\t<span />\n}',
			{
				name: 'Error',
				message:
					"A code block renders a single node; wrap multiple nodes or text in a fragment '<>…</>'.",
				code: DIAGNOSTIC_CODES.CODE_BLOCK_SINGLE_OUTPUT,
				pos: 35,
				loc: { start: { line: 3, column: 1 }, end: { line: 3, column: 9 } },
			},
		],
	])('reports %s at its position, as the browser compiler does', (_name, source, expected) => {
		const reported = (compileSource: () => unknown) => {
			try {
				compileSource();
			} catch (error) {
				const { name, message, code, pos, loc } = error as Error & Record<string, unknown>;
				return { name, message, code, pos, loc };
			}
			throw new Error('expected the source to be rejected');
		};
		expect(reported(() => parseBrowserModule(source, 'App.tsrx'))).toEqual(expected);
		for (const mode of ['client', 'server'] as const) {
			expect(reported(() => compileWith('oxc', source, mode))).toEqual(expected);
		}
	});
});
