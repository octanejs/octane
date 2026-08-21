// @vitest-environment node

import type { OctaneCssModuleConstants } from 'octane/compiler';
import {
	isPlainCssModuleId,
	readCssModuleExports,
	validateCssModuleConstants,
} from 'octane/compiler/bundler';
import type { OctaneCssModuleConstants as ViteCssModuleConstants } from 'octane/compiler/vite';
import { describe, expect, expectTypeOf, it } from 'vitest';

// Rspack 2.1.4's CssExtractRspackPlugin emits local vars and quoted export
// aliases. Its normal production output has no imports or executable setup.
const EXTRACTED = `// extracted by css-extract-rspack-plugin
var _1 = "mapped_label";
var _2 = "mapped_root";
export { _1 as "label", _2 as "root" };`;

const PURE_VAR = { allowPureVar: true };
const mapped = new Map([
	['label', 'mapped_label'],
	['root', 'mapped_root'],
]);

describe('bundler-neutral CSS-module evidence', () => {
	it('keeps the Vite provider fact type available from the neutral compiler', () => {
		expectTypeOf<OctaneCssModuleConstants>().toEqualTypeOf<ViteCssModuleConstants>();
		expect(isPlainCssModuleId('/project/styles.module.css')).toBe(true);
		expect(isPlainCssModuleId('/project/styles.module.scss')).toBe(true);
		expect(isPlainCssModuleId('/project/styles.module.css?inline')).toBe(false);
		expect(isPlainCssModuleId('\0styles.module.css')).toBe(false);
	});

	it('recognizes extracted named exports only when the host requests the pure-var proof', async () => {
		expect(readCssModuleExports(EXTRACTED)).toEqual({
			named: new Map(),
			default: null,
			pure: false,
		});
		const evidence = readCssModuleExports(EXTRACTED, PURE_VAR);
		expect(evidence).toEqual({ named: mapped, default: null, pure: true });
		const module = await import(`data:text/javascript,${encodeURIComponent(EXTRACTED)}`);
		expect(Object.fromEntries(evidence!.named)).toEqual({
			label: module.label,
			root: module.root,
		});
	});

	it('accepts css-loader exportOnlyLocals and initialized local aliases', () => {
		const source = `export var root = "mapped_root";
var label = "mapped_label";
const alias = label;
export { alias as "label" };`;
		expect(readCssModuleExports(source, PURE_VAR)).toEqual({
			named: new Map([
				['root', 'mapped_root'],
				['label', 'mapped_label'],
			]),
			default: null,
			pure: true,
		});
	});

	it('returns a default map as provider evidence without claiming that object immutable', async () => {
		const source = `var root = "mapped_root";
export { root };
export default { root };`;
		const evidence = readCssModuleExports(source, PURE_VAR);
		expect(evidence).toEqual({
			named: new Map([['root', 'mapped_root']]),
			default: new Map([['root', 'mapped_root']]),
			pure: true,
		});
		const module = await import(`data:text/javascript,${encodeURIComponent(source)}`);
		module.default.root = 'changed_by_another_importer';
		expect(module.default.root).toBe('changed_by_another_importer');
		expect(module.root).toBe('mapped_root');
		expect(validateCssModuleConstants(undefined, evidence, 'styles.module.css')).toBeNull();
	});

	it.each([
		['later assignment', `var root = "first"; root = "second"; export { root };`],
		['compound assignment', `var root = "first"; root += "second"; export { root };`],
		['redeclaration', `var root = "first"; var root = "second"; export { root };`],
		['duplicate declarator', `var root = "first", root = "first"; export { root };`],
		['missing initializer', `var root; export { root };`],
		['forward alias', `var root = label; var label = "later"; export { root, label };`],
		['self alias', `var root = root; export { root };`],
		['mutable let', `export let root = "first";`],
		['side-effect import', `import "./setup.js"; export var root = "first";`],
		['re-export', `export var root = "first"; export { other } from "./other.js";`],
		['call', `var root = chooseClass(); export { root };`],
		[
			'exported mutator',
			`var root = "first"; export { root }; export function change() { root = "second"; }`,
		],
		['getter', `var root = "first"; export default { get root() { return root; } };`],
		['spread', `var root = "first"; export default { ...{ root } };`],
		['freeze call', `var root = "first"; export default Object.freeze({ root });`],
	] as const)('does not publish var-derived evidence for %s', (_name, source) => {
		const evidence = readCssModuleExports(source, PURE_VAR);
		expect(evidence?.pure).not.toBe(true);
		expect(evidence?.named.get('root')).toBeUndefined();
		expect(evidence?.default?.get('root')).toBeUndefined();
	});

	it('retains independent const evidence but drops every var-derived fact in an impure module', () => {
		const source = `export const stable = "mapped_stable";
var root = "first";
const alias = root;
export { root, alias };
export default { root, alias, stable };
root = "second";`;
		expect(readCssModuleExports(source, PURE_VAR)).toEqual({
			named: new Map([['stable', 'mapped_stable']]),
			default: null,
			pure: false,
		});
	});

	it('does not execute source while reading export evidence', () => {
		const source = `throw new Error("must not execute"); export var root = "mapped_root";`;
		expect(() => readCssModuleExports(source, PURE_VAR)).not.toThrow();
		expect(readCssModuleExports(source, PURE_VAR)?.named.has('root')).toBe(false);
	});

	it('validates provider assertions with the owning integration in the diagnostic', () => {
		const evidence = readCssModuleExports(EXTRACTED, PURE_VAR);
		const provided: OctaneCssModuleConstants = { named: Object.fromEntries(mapped) };
		expect(validateCssModuleConstants(provided, evidence, 'styles.module.css')).toEqual({
			named: mapped,
			default: new Map(),
		});
		const stale = { named: { root: 'outdated_root' } };
		expect(() => validateCssModuleConstants(stale, evidence, 'styles.module.css')).toThrow(
			/^octane\/compiler\/vite: invalid cssModuleConstants/,
		);
		expect(() =>
			validateCssModuleConstants(stale, evidence, 'styles.module.css', '@octanejs/rspack-plugin'),
		).toThrow(/^@octanejs\/rspack-plugin: invalid cssModuleConstants/);
	});
});
