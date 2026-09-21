import { describe, expect, it } from 'vitest';
import { compile } from '../src/compiler/compile.js';
import { compileToVolarMappings } from '../src/compiler/volar.js';

const FILE = '/src/App.tsrx';
const UNKNOWN_KEY = 'octane-style-unknown-class-key';
const APPLY_TARGET = 'tsrx-style-apply-target';

function octaneDiagnostics(source: string, options: Record<string, unknown> = {}) {
	return (compile(source, FILE, options as any).diagnostics as any[]).filter((diagnostic) =>
		String(diagnostic.code).startsWith('octane-style-'),
	);
}

function octaneVolarDiagnostics(source: string) {
	return ((compileToVolarMappings(source, FILE) as any).diagnostics as any[]).filter((diagnostic) =>
		String(diagnostic.code).startsWith('octane-style-'),
	);
}

function codes(source: string, options: Record<string, unknown> = {}) {
	return octaneDiagnostics(source, options).map((diagnostic) => diagnostic.code);
}

describe('octane-style-unknown-class-key', () => {
	it('reports a key the same-module class map does not provide (AE2)', () => {
		const source = `const theme = <style>
  .dark { color: red; }
</style>;
export function App() @{
  <div class={theme.darkk}>{'hi'}</div>
}`;
		const found = octaneDiagnostics(source);
		expect(found).toHaveLength(1);
		expect(found[0]).toMatchObject({
			code: UNKNOWN_KEY,
			severity: 'error',
			filename: FILE,
		});
		expect(found[0].start.offset).toBe(source.indexOf('darkk'));
		expect(found[0].message).toContain('darkk');
		expect(found[0].message).toContain('dark');
		expect(found[0].suggestions?.[0]?.attribute).toBe('dark');
	});

	it('accepts declared keys and $class silently', () => {
		const source = `const theme = <style>
  .dark { color: red; }
  .light { color: blue; }
</style>;
export function App() @{
  <div class={theme.dark}><span class={theme.light}>{'a'}</span><span class={theme.$class}>{'b'}</span></div>
}`;
		expect(codes(source)).toEqual([]);
	});

	it('reports a computed string key but not a dynamic read', () => {
		const source = `const theme = <style>
  .dark { color: red; }
</style>;
export function App(props) @{
  <div class={theme['darkk'] + ' ' + theme[props.k]}>{'hi'}</div>
}`;
		const found = octaneDiagnostics(source);
		expect(found).toHaveLength(1);
		expect(found[0].start.offset).toBe(source.indexOf("'darkk'"));
	});

	it('checks keys on an exported theme the same way', () => {
		const source = `export const theme = <style>
  .dark { color: red; }
</style>;
export function App() @{
  <div class={theme.dar}>{'hi'}</div>
}`;
		expect(codes(source)).toEqual([UNKNOWN_KEY]);
	});

	it('resolves member chains through a module-local object of blocks', () => {
		const source = `const maps = { dark: <style>.x { color: red; }</style> };
export function App() @{
  <div class={maps.dark.wrong}>{'hi'}</div>
}`;
		const found = octaneDiagnostics(source);
		expect(found).toHaveLength(1);
		expect(found[0].code).toBe(UNKNOWN_KEY);
		expect(found[0].message).toContain('wrong');
		expect(found[0].message).toContain("'x'");
	});

	it('a body-less apply bundle exposes only $class', () => {
		const source = `const a = <style>.a { color: red; }</style>;
const bundle = <style apply={a} />;
export function App() @{
  <div class={bundle.b}>{'hi'}</div>
}`;
		expect(codes(source)).toEqual([UNKNOWN_KEY]);
	});

	it('does not flag member reads on an imported theme (typecheck gate owns those)', () => {
		const source = `import { theme } from './theme.tsrx';
const local = <style>.dark { color: red; }</style>;
export function App() @{
  <div class={theme.darkk + ' ' + local.dark}>{'hi'}</div>
}`;
		expect(codes(source)).toEqual([]);
	});

	it('still flags a local typo beside an imported theme read', () => {
		const source = `import { theme } from './theme.tsrx';
const local = <style>.dark { color: red; }</style>;
export function App() @{
  <>
    <div class={theme.missing}>{'a'}</div>
    <span class={local.dar}>{'b'}</span>
  </>
}`;
		const found = octaneDiagnostics(source);
		expect(found).toHaveLength(1);
		expect(found[0].start.offset).toBe(source.indexOf('local.dar') + 'local.'.length);
	});

	it('does not flag keys when the binding only shadows inside an inner scope', () => {
		const source = `const theme = <style>.dark { color: red; }</style>;
function inner(theme) @{
  <div class={theme.darkk}>{'a'}</div>
}
export function App() @{
  <div class={theme.dark}>{'b'}</div>
}`;
		expect(codes(source)).toEqual([]);
	});

	it('suppresses the diagnostic via an octane-ignore comment', () => {
		const source = `const theme = <style>.dark { color: red; }</style>;
export function App() @{
  <div>
    {/* octane-ignore octane-style-unknown-class-key */}
    <span class={theme.darkk}>{'hi'}</span>
  </div>
}`;
		expect(codes(source)).toEqual([]);
	});
});

describe('apply target shape', () => {
	const source = `const notATheme = { dark: 'x' };
export function App() @{
  <div>
    <style apply={notATheme}>.a { color: red; }</style>
    <span>hi</span>
  </div>
}`;

	it('fails compile() with the apply-shape diagnostic', () => {
		let thrown: any = null;
		try {
			compile(source, FILE);
		} catch (error) {
			thrown = error;
		}
		expect(thrown).not.toBeNull();
		expect(thrown.code).toBe(APPLY_TARGET);
		expect(thrown.message).toContain('not a style block');
	});

	it('collects the same diagnostic in Volar output', () => {
		const result = compileToVolarMappings(source, FILE) as any;
		const errorCodes = result.errors.map((e: any) => e.code);
		expect(errorCodes).toContain(APPLY_TARGET);
	});

	it('lets apply machinery own member reads — no double-report', () => {
		const source = `const theme = <style>.dark { color: red; }</style>;
export function App() @{
  <div>
    <style apply={theme.darkk} />
    <span>hi</span>
  </div>
}`;
		const result = compileToVolarMappings(source, FILE) as any;
		expect(result.errors.map((e: any) => e.code)).toEqual([APPLY_TARGET]);
		expect(octaneVolarDiagnostics(source)).toEqual([]);
	});
});

describe('integration', () => {
	const SOURCE = `const theme = <style>
  .dark { color: red; }
</style>;
export function App() @{
  <div class={theme.darkk}>{'hi'}</div>
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
		expect(errorCodes).toContain(UNKNOWN_KEY);
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
