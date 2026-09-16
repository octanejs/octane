import { describe, it, expect } from 'vitest';
import { transformStylex, generateStylexCSS } from '../../src/transform';
import babel from '@babel/core';
import stylexBabelPlugin from '@stylexjs/babel-plugin';
import { stylexBindingConstants } from '../../src/compiler.js';
import { compile } from 'octane/compiler';
import { knownAttributeSpreads } from '../../src/compiler-contract.js';

// The StyleX compiler pass in isolation — deterministic, no Vite. Proves create/
// props/keyframes/defineVars are compiled and the extracted atomic CSS is correct.

const SX = `import * as stylex from '@octanejs/stylex';`;

describe('transformStylex + generateStylexCSS', () => {
	it('create -> atomic classes; props compiled away; CSS extracted', () => {
		const { code, rules } = transformStylex(
			`${SX}\nconst s = stylex.create({ root: { padding: 16, color: 'tomato' } });\nexport const p = stylex.props(s.root);`,
			{ filename: '/app/a.ts' },
		);
		expect(code.includes('stylex.create(')).toBe(false);
		expect(code.includes('stylex.props(')).toBe(false);
		expect(rules.length).toBe(2); // padding + color
		const css = generateStylexCSS(rules);
		expect(css).toContain('padding:16px');
		expect(css).toContain('color:tomato');

		const source = `${SX}
import { props as styleProps } from '@octanejs/stylex';
const styles = stylex.create({ root: { padding: 16, color: 'tomato' }, compact: { padding: 8, paddingLeft: null }, width: (value) => ({ width: value }) });
export function View(props) @{
  'use dom bindings';
  const selected = props.compact ? styles.compact : styles.root;
  <button {...styleProps(selected, styles.width(props.width))}>ok</button>
}`;
		const filename = '/app/shared.tsrx';
		const outputs = [filename, `${filename}?octane-bindings=View`].map((id) => {
			const compiled = compile(source, id, { mode: 'client', knownAttributeSpreads });
			expect(compiled.bindingConstants?.names).toContain('styles');
			const candidate = transformStylex(compiled.code, {
				filename,
				bindingConstants: compiled.bindingConstants,
				inputSourceMap: compiled.map,
			});
			const baseline = transformStylex(compiled.code, { filename });
			expect(generateStylexCSS(candidate.rules)).toBe(generateStylexCSS(baseline.rules));
			expect(candidate.sharedConstants).toHaveLength(1);
			expect(candidate.sharedConstants[0].map.sourcesContent).toContain(source);
			return candidate;
		});
		expect(outputs[0].sharedConstants[0].id).toBe(outputs[1].sharedConstants[0].id);
		expect(outputs[0].sharedConstants[0].code).toBe(outputs[1].sharedConstants[0].code);
		const folded = compile(
			`${SX}
import { props as styleProps } from '@octanejs/stylex';
const styles = stylex.create({root: {color: 'tomato'}});
export function View(props) @{ 'use dom bindings'; <button {...styleProps(styles.root)}>ok</button> }`,
			filename,
			{ mode: 'client', knownAttributeSpreads },
		);
		const local = transformStylex(folded.code, {
			filename,
			bindingConstants: folded.bindingConstants,
		});
		expect(local.sharedConstants).toEqual([]);
		expect(local.code).not.toContain('styleProps(');
		const importedRecipe = source
			.replace(SX, `${SX}\nimport { normalize } from './units';`)
			.replace('width: value', 'width: normalize(value)');
		const importedCompiled = compile(importedRecipe, filename, {
			mode: 'client',
			knownAttributeSpreads,
		});
		const retained = transformStylex(importedCompiled.code, {
			filename,
			bindingConstants: importedCompiled.bindingConstants,
		});
		expect(retained.sharedConstants).toEqual([]);
		expect(generateStylexCSS(retained.rules)).toBe(
			generateStylexCSS(transformStylex(importedCompiled.code, { filename }).rules),
		);
		for (const options of [{ dev: true }, { hmr: true }, { mode: 'server' as const }]) {
			expect(
				compile(source, filename, { mode: 'client', knownAttributeSpreads, ...options })
					.bindingConstants,
			).toBeUndefined();
		}

		// These are valid module uses, but sharing object identity across the two
		// independently compiled entries would expose mutations or user callbacks.
		for (const extra of [
			`export function change() { styles.root.color = 'broken'; }`,
			`const alias = styles.root; export function change() { alias.color++; }`,
			`const alias = styles.root; export function change() { delete alias.color; }`,
			`export function change() { Object.defineProperty(styles.root, 'color', {value: 'broken'}); }`,
			`export function change() { styles.root.__defineGetter__('color', () => 'broken'); }`,
			`export function read() { return styles.root; }`,
			`export const alias = styles.root;`,
			`export { styles };`,
			`export function escape(props) { props.mutate(styles.root); }`,
			`export function escape(props) { props.mutate(styles.width(2)); }`,
			`export function Other(props) { return <props.Child sx={styles.root} />; }`,
		]) {
			expect(
				compile(`${source}\n${extra}`, filename, { mode: 'client', knownAttributeSpreads })
					.bindingConstants?.names ?? [],
				extra,
			).not.toContain('styles');
		}
		for (const body of [`alias.color = 'broken'`, 'props.mutate(alias)']) {
			const imperative = source
				.replace('const selected =', 'const alias = styles.root;\nconst selected =')
				.replace('<button ', `<button onClick={() => { ${body}; }} `);
			for (const id of [filename, `${filename}?octane-bindings=View`]) {
				expect(
					compile(imperative, id, { mode: 'client', knownAttributeSpreads }).bindingConstants
						?.names ?? [],
				).not.toContain('styles');
			}
		}

		// The public adapter hook must be safe when Babel caches the plugin object.
		const plugins = [
			[
				stylexBabelPlugin,
				{ dev: false, runtimeInjection: false, importSources: ['@octanejs/stylex'] },
			],
			[
				stylexBindingConstants,
				{ bindingConstants: { version: 1, source: 'reuse', names: ['styles'] } },
			],
		] as any;
		for (let index = 0; index < 3; index++) {
			const compiled = babel.transformSync(
				`${SX} const styles = stylex.create({root: {color: 'red'}}); export function read() { return styles; }`,
				{ filename: '/app/reuse.js', configFile: false, babelrc: false, plugins },
			);
			expect((compiled!.metadata as any).octaneStylexSharedConstants).toHaveLength(1);
		}
		const ordinary = babel.transformSync(
			'export const styles = { ordinary: true }; export const read = () => styles;',
			{ filename: '/app/ordinary.js', configFile: false, babelrc: false, plugins },
		);
		expect((ordinary!.metadata as any).octaneStylexSharedConstants).toBeUndefined();
		expect(() =>
			babel.parseSync(ordinary!.code!, { configFile: false, babelrc: false }),
		).not.toThrow();
	});

	it('atomic dedupe across modules: an identical declaration emits one rule', () => {
		const a = transformStylex(
			`${SX}\nconst s = stylex.create({ x: { padding: 16 } });\nexport const p = stylex.props(s.x);`,
			{ filename: '/app/a.ts' },
		);
		const b = transformStylex(
			`${SX}\nconst s = stylex.create({ y: { padding: 16 } });\nexport const p = stylex.props(s.y);`,
			{ filename: '/app/b.ts' },
		);
		// Same atomic rule key from two different create() calls -> one CSS rule.
		expect(a.rules[0][0]).toBe(b.rules[0][0]);
		const css = generateStylexCSS([...a.rules, ...b.rules]);
		expect(css.match(/padding:16px/g)?.length).toBe(1);
	});

	it('last-wins precedence: a later style overrides an earlier property', () => {
		const { rules } = transformStylex(
			`${SX}\nconst s = stylex.create({ a: { color: 'red' }, b: { color: 'blue' } });\nexport const p = stylex.props(s.a, s.b);`,
			{ filename: '/app/c.ts' },
		);
		const css = generateStylexCSS(rules);
		// Both color rules exist in the sheet; styleq picks the last at runtime.
		expect(css).toContain('color:red');
		expect(css).toContain('color:blue');
	});

	it('keyframes -> @keyframes rule + a referencable name', () => {
		const { code, rules } = transformStylex(
			`${SX}\nconst fade = stylex.keyframes({ from: { opacity: 0 }, to: { opacity: 1 } });\nexport const s = stylex.create({ a: { animationName: fade } });`,
			{ filename: '/app/k.ts' },
		);
		expect(code.includes('stylex.keyframes(')).toBe(false);
		const css = generateStylexCSS(rules);
		expect(css).toContain('@keyframes');
		expect(css).toContain('opacity:0');
		expect(css).toContain('opacity:1');
	});

	it('defineVars -> :root custom properties', () => {
		const { rules } = transformStylex(
			`${SX}\nexport const vars = stylex.defineVars({ accent: 'red', space: '8px' });`,
			{ filename: '/app/tokens.stylex.ts' },
		);
		const css = generateStylexCSS(rules);
		expect(css).toContain(':root');
		expect(css).toMatch(/--[\w-]+:red/);
	});

	it('empty input -> empty stylesheet', () => {
		expect(generateStylexCSS([])).toBe('');
	});
});
