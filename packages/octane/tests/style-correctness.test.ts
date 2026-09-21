import { describe, expect, it } from 'vitest';
import { compile } from '../src/compiler/compile.js';
import { compileToVolarMappings } from '../src/compiler/volar.js';

const FILE = '/src/App.tsrx';
const UNKNOWN = 'octane-css-unknown-property';
const CLASH = 'octane-css-shorthand-longhand-clash';
const UNUSED = 'octane-css-unused-selector';

function octaneDiagnostics(source: string, options: Record<string, unknown> = {}) {
	return (compile(source, FILE, options as any).diagnostics as any[]).filter((diagnostic) =>
		String(diagnostic.code).startsWith('octane-css-'),
	);
}

function octaneVolarDiagnostics(source: string) {
	return ((compileToVolarMappings(source, FILE) as any).diagnostics as any[]).filter((diagnostic) =>
		String(diagnostic.code).startsWith('octane-css-'),
	);
}

function codes(source: string, options: Record<string, unknown> = {}) {
	return octaneDiagnostics(source, options).map((diagnostic) => diagnostic.code);
}

describe('octane-css-unknown-property', () => {
	it('reports a misspelled property inside a scoped block', () => {
		const source = `export function App() @{
  <div>
    <style>.a { colorr: red; }</style>
    <span class="a">hi</span>
  </div>
}`;
		const found = octaneDiagnostics(source);
		expect(found).toHaveLength(1);
		expect(found[0]).toMatchObject({
			code: UNKNOWN,
			severity: 'error',
			filename: FILE,
		});
		expect(found[0].start.offset).toBe(source.indexOf('colorr'));
		expect(found[0].message).toContain('colorr');
		expect(found[0].message).toContain('color');
	});

	it('accepts custom properties, var() values, and vendor-prefixed properties', () => {
		const source = `export function App() @{
  <div>
    <style>
      .a {
        --tone: red;
        color: var(--tone);
        -webkit-mask-image: none;
      }
    </style>
    <span class="a">hi</span>
  </div>
}`;
		expect(codes(source)).toEqual([]);
	});

	it('checks declarations in nested rules and @media', () => {
		const source = `export function App() @{
  <div>
    <style>
      .a { &:hover { colr: red; } }
      @media (min-width: 100px) { .a { colur: blue; } }
    </style>
    <span class="a">hi</span>
  </div>
}`;
		expect(codes(source)).toEqual([UNKNOWN, UNKNOWN]);
	});

	it('does not treat @font-face descriptors as properties', () => {
		const source = `export function App() @{
  <div>
    <style>@font-face { font-family: X; src: url(x.woff2); font-display: swap; }</style>
    <span>hi</span>
  </div>
}`;
		expect(codes(source)).toEqual([]);
	});
});

describe('octane-css-shorthand-longhand-clash', () => {
	it('flags a shorthand that resets an earlier longhand in the same rule', () => {
		const source = `export function App() @{
  <div>
    <style>.a { border-top-color: red; border: 1px solid blue; }</style>
    <span class="a">hi</span>
  </div>
}`;
		const found = octaneDiagnostics(source);
		expect(found).toHaveLength(1);
		expect(found[0]).toMatchObject({ code: CLASH, severity: 'error' });
		expect(found[0].message).toContain('border');
		expect(found[0].message).toContain('border-top-color');
		expect(found[0].start.offset).toBe(source.indexOf('border: 1px'));
	});

	it('accepts the idiomatic longhand-after-shorthand order', () => {
		const source = `export function App() @{
  <div>
    <style>.a { border: 1px solid blue; border-top-color: red; }</style>
    <span class="a">hi</span>
  </div>
}`;
		expect(codes(source)).toEqual([]);
	});

	it('flags merged rules in one block when the shorthand wins', () => {
		const source = `export function App() @{
  <div>
    <style>
      .a { border-top-color: red; }
      .b { border: 1px solid blue; }
    </style>
    <span class="a b">hi</span>
  </div>
}`;
		const found = octaneDiagnostics(source);
		expect(found).toHaveLength(1);
		expect(found[0].code).toBe(CLASH);
	});

	it('does not flag merged rules when the longhand wins by specificity', () => {
		const source = `export function App() @{
  <div>
    <style>
      .a:hover { border-top-color: red; }
      div { border: 1px solid blue; }
    </style>
    <span class="a">hi</span>
  </div>
}`;
		expect(codes(source)).toEqual([]);
	});

	it('flags a clashing pair across a same-module apply edge', () => {
		const source = `const theme = <style>
  .a { border-top-color: red; }
</style>;
export function App() @{
  <div>
    <style apply={theme}>.b { border: 1px solid blue; }</style>
    <span class="a b">hi</span>
  </div>
}`;
		const found = octaneDiagnostics(source);
		expect(found.map((d) => d.code)).toEqual([CLASH]);
	});

	it('flags a clashing pair across a nested scope chain', () => {
		const source = `export function App() @{
  <div>
    <style>.a { border-top-color: red; }</style>
    <section>
      <style>.b { border: 1px solid blue; }</style>
      <span class="a b">hi</span>
    </section>
  </div>
}`;
		expect(codes(source)).toEqual([CLASH]);
	});

	it('does not flag selectors that cannot match the same element', () => {
		const source = `export function App() @{
  <div>
    <style>
      div { border-top-color: red; }
      span { border: 1px solid blue; }
    </style>
    <span>hi</span>
  </div>
}`;
		expect(codes(source)).toEqual([]);
	});

	it('flags an !important shorthand that beats a later longhand', () => {
		const source = `export function App() @{
  <div>
    <style>
      .a { border: 1px solid blue !important; }
      .b { border-top-color: red; }
    </style>
    <span class="a b">hi</span>
  </div>
}`;
		expect(codes(source)).toEqual([CLASH]);
	});
});

describe('octane-css-unused-selector', () => {
	it('warns for a scoped selector that matches nothing', () => {
		const source = `export function App() @{
  <div>
    <style>.gone { color: red; }</style>
    <span>hi</span>
  </div>
}`;
		const found = octaneDiagnostics(source);
		expect(found).toHaveLength(1);
		expect(found[0]).toMatchObject({ code: UNUSED, severity: 'warning' });
		expect(found[0].message).toContain('.gone');
	});

	it('stays quiet for a selector that matches', () => {
		const source = `export function App() @{
  <div>
    <style>.live { color: red; }</style>
    <span class="live">hi</span>
  </div>
}`;
		expect(codes(source)).toEqual([]);
	});

	it('warns once for a fully dead rule and per unused selector in a mixed list', () => {
		const source = `export function App() @{
  <div>
    <style>
      .gone-a, .gone-b { color: red; }
      .live, .dead { color: blue; }
    </style>
    <span class="live">hi</span>
  </div>
}`;
		const found = octaneDiagnostics(source).filter((d) => d.code === UNUSED);
		expect(found).toHaveLength(2);
	});

	it('does not warn for designed class-map pruning', () => {
		const source = `const map = <style>
  span { color: red; }
  .a { color: blue; }
</style>;
export function App() @{
  <div class={map.a}>hi</div>
}`;
		expect(codes(source)).toEqual([]);
	});

	it('does not warn inside theme blocks', () => {
		const source = `export const theme = <style>.never { color: red; }</style>;
export function App() @{
  <div>hi</div>
}`;
		expect(codes(source)).toEqual([]);
	});

	it('does not warn for :global selectors', () => {
		const source = `export function App() @{
  <div>
    <style>
      :global(.far) { color: red; }
      :global { .deep { color: blue; } }
    </style>
    <span>hi</span>
  </div>
}`;
		expect(codes(source)).toEqual([]);
	});

	it('does not warn for selectors that only maybe-match a dynamic element', () => {
		const source = `export function App(props) @{
  <div>
    <style>article { color: red; }</style>
    <{props.tag}>hi</{props.tag}>
  </div>
}`;
		expect(codes(source)).toEqual([]);
	});
});

describe('suppression', () => {
	it('suppresses a diagnostic via a CSS octane-ignore comment', () => {
		const source = `export function App() @{
  <div>
    <style>
      /* octane-ignore octane-css-unknown-property */
      .a { colorr: red; }
    </style>
    <span class="a">hi</span>
  </div>
}`;
		expect(codes(source)).toEqual([]);
	});

	it('suppresses a diagnostic via a JS octane-ignore comment above the block', () => {
		const source = `export function App() @{
  <div>
    {/* octane-ignore octane-css-unused-selector */}
    <style>.gone { color: red; }</style>
    <span>hi</span>
  </div>
}`;
		expect(codes(source)).toEqual([]);
	});

	it('does not suppress other codes', () => {
		const source = `export function App() @{
  <div>
    <style>
      /* octane-ignore octane-css-unused-selector */
      .a { colorr: red; }
    </style>
    <span class="a">hi</span>
  </div>
}`;
		expect(codes(source)).toEqual([UNKNOWN]);
	});
});

describe('integration', () => {
	const SOURCE = `const theme = <style>
  .a { border-top-color: red; }
</style>;
export function App() @{
  <div>
    <style apply={theme}>
      .b { border: 1px solid blue; colorr: red; }
      .gone { color: pink; }
    </style>
    <span class="a b">hi</span>
  </div>
}`;

	it('produces identical diagnostics via compile() and compileToVolarMappings()', () => {
		const build = octaneDiagnostics(SOURCE).map((d) => ({
			code: d.code,
			severity: d.severity,
			offset: d.start.offset,
		}));
		const editor = octaneVolarDiagnostics(SOURCE).map((d) => ({
			code: d.code,
			severity: d.severity,
			offset: d.start.offset,
		}));
		expect(build.length).toBeGreaterThan(0);
		expect(editor).toEqual(build);
	});

	it('surfaces error-severity findings as Volar compile errors', () => {
		const result = compileToVolarMappings(SOURCE, FILE) as any;
		const errorCodes = result.errors.map((e: any) => e.code);
		expect(errorCodes).toContain(UNKNOWN);
		expect(errorCodes).toContain(CLASH);
	});

	it('keeps production codegen byte-equal with checks enabled vs disabled', () => {
		for (const dev of [true, false]) {
			const on = compile(SOURCE, FILE, { dev } as any);
			const off = compile(SOURCE, FILE, { dev, styleCorrectness: false } as any);
			expect(on.code).toBe(off.code);
			expect(JSON.stringify(on.map)).toBe(JSON.stringify(off.map));
			expect(on.diagnostics.length).toBeGreaterThan(off.diagnostics.length);
		}
	});
});
