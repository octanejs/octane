import { describe, it, expect } from 'vitest';
import { transformStylex, generateStylexCSS } from '../../src/transform';

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
