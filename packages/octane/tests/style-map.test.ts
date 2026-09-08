import { describe, it, expect } from 'vitest';
import { mount } from './_helpers';
import { compile } from 'octane/compiler';
import { Picker, Composed, Switchable, Branded, palette } from './_fixtures/style-map.tsrx';

// Style maps: `const styles = <style>...</style>` (or the exported form)
// becomes a compile-time object whose values are the hashed class strings.
// The component references them as `class={styles.red}` and gets the right
// scoped class on the element. The stylesheet is also injected once at
// module-level via the existing cssInjections pipeline.

describe('style maps — module-level <style> assigned to const', () => {
	it('compiles the <style> initializer into an object expression', () => {
		const src = `
      const styles = <style>
        .red { color: red; }
        .blue { color: blue; }
      </style>;
      export function Foo() @{ <div class={styles.red}>{'hi'}</div> }
    `;
		const { code } = compile(src, 'sm.tsrx');
		// The const initializer is now a plain object literal, NOT a JSXStyleElement.
		expect(code).toMatch(/const\s+styles\s*=\s*\{/);
		// RFC tsrx-org/RFCs#1: the map opens with the block's scope class
		// (`$class`), then the authored classes.
		expect(code).toMatch(/const\s+styles\s*=\s*\{\s*'\$class':\s*'tsrx-[a-z0-9]+',/i);
		const hash = code.match(/'\$class':\s*'(tsrx-[a-z0-9]+)'/i)![1];
		expect(code).toContain(`'red': '${hash} red'`);
		expect(code).toContain(`'blue': '${hash} blue'`);
		expect(code).toContain(`injectStyle("${hash}"`);
		// The map values include the hash class + the original class name.
		expect(code).toMatch(/'red':\s*'tsrx-[a-z0-9]+ red'/i);
		expect(code).toMatch(/'blue':\s*'tsrx-[a-z0-9]+ blue'/i);
		// The stylesheet still flows through injectStyle for the module-level tag.
		expect(code).toMatch(/injectStyle\("tsrx-[a-z0-9]+"/i);
	});

	it('Picker: dynamic key lookup applies the right hashed class', () => {
		const r = mount(Picker, { kind: 'red' });
		const div = r.find('div');
		expect(div.textContent).toBe('I am red');
		expect(div.className).toMatch(/tsrx-[a-z0-9]+/i);
		expect(div.className).toContain(' red');
		// The injected stylesheet should make the rule apply.
		expect(getComputedStyle(div).color).toBe('rgb(200, 0, 0)');

		r.update(Picker, { kind: 'blue' });
		expect(div.className).toContain(' blue');
		expect(getComputedStyle(div).color).toBe('rgb(0, 0, 200)');
		r.unmount();
	});

	it('Composed: concatenating two map lookups stacks both classes', () => {
		const r = mount(Composed);
		const div = r.find('div');
		// Both hashed classes present on the element (deduped by the browser's
		// class list — same hash on both → just appears twice in the string).
		expect(div.className).toContain('red');
		expect(div.className).toContain('pad');
		expect(getComputedStyle(div).padding).toBe('5px');
		expect(getComputedStyle(div).color).toBe('rgb(200, 0, 0)');
		r.unmount();
	});

	it('Switchable: clicking flips between two map lookups', () => {
		const r = mount(Switchable);
		const btn = r.find('button');
		expect(btn.textContent).toBe('red');
		expect(btn.className).toContain('red');
		expect(getComputedStyle(btn).color).toBe('rgb(200, 0, 0)');

		r.click('button');
		expect(btn.textContent).toBe('blue');
		expect(btn.className).toContain('blue');
		expect(getComputedStyle(btn).color).toBe('rgb(0, 0, 200)');
		r.unmount();
	});

	it('export const palette = <style>...: exported maps work the same way', () => {
		const r = mount(Branded);
		const span = r.find('span');
		expect(span.textContent).toBe('branded');
		expect(span.className).toContain('accent');
		expect(getComputedStyle(span).color).toBe('rgb(255, 165, 0)');
		r.unmount();
	});
});

// RFC tsrx-org/RFCs#1: assigned blocks are class maps whose `$class` is the
// scope class; exported or applied blocks are themes and keep every selector,
// while an unapplied local block keeps only what its class map exposes.
describe('style maps — $class, themes, and apply bundles', () => {
	function injection(code: string, hash: string): string {
		const match = code.match(new RegExp(`injectStyle\\("${hash}",\\s*"((?:[^"\\\\]|\\\\.)*)"`));
		if (!match) throw new Error(`no injectStyle for ${hash}`);
		return match[1];
	}

	it('an exported theme keeps element selectors; an unapplied local block prunes them', () => {
		const { code } = compile(
			`
      export const theme = <style>
        .tone { color: red; }
        div { margin: 0; }
      </style>;
      const local = <style>
        .tone { color: blue; }
        div { margin: 0; }
      </style>;
      export function Foo() @{ <div class={local.tone + ' ' + theme.tone}>{'hi'}</div> }
    `,
			'theme-vs-local.tsrx',
		);
		const themeHash = code.match(/export const theme = \{ '\$class': '(tsrx-[a-z0-9]+)'/i)![1];
		const localHash = code.match(/const local = \{ '\$class': '(tsrx-[a-z0-9]+)'/i)![1];
		expect(themeHash).not.toBe(localHash);
		expect(injection(code, themeHash)).toContain(`div.${themeHash} { margin: 0; }`);
		expect(injection(code, themeHash)).not.toContain('(unused)');
		expect(injection(code, localHash)).toContain(`.tone.${localHash} { color: blue; }`);
		expect(injection(code, localHash)).toContain('/* (unused) div { margin: 0; }*/');
	});

	it('a local block becomes a theme once something applies it', () => {
		const { code } = compile(
			`
      const local = <style>
        .tone { color: blue; }
        div { margin: 0; }
      </style>;
      export function Foo() @{
        <>
          <style apply={local} />
          <div class="box">{'hi'}</div>
        </>
      }
    `,
			'applied-local.tsrx',
		);
		const localHash = code.match(/const local = \{ '\$class': '(tsrx-[a-z0-9]+)'/i)![1];
		expect(injection(code, localHash)).toContain(`div.${localHash} { margin: 0; }`);
		expect(injection(code, localHash)).not.toContain('(unused)');
		// The applying scope has no block of its own: the element carries only
		// the applied theme's class, as a static literal (same module).
		expect(code).toContain(`class=\\"box ${localHash}\\"`);
	});

	it('apply on a self-closed block produces a $class-only bundle', () => {
		const { code } = compile(
			`
      const a = <style>.a { color: red; }</style>;
      const b = <style>.b { color: blue; }</style>;
      export const bundle = <style apply={[a, b]} />;
      export const single = <style apply={b} />;
    `,
			'bundle.tsrx',
		);
		const aHash = code.match(/const a = \{ '\$class': '(tsrx-[a-z0-9]+)'/i)![1];
		const bHash = code.match(/const b = \{ '\$class': '(tsrx-[a-z0-9]+)'/i)![1];
		expect(code).toContain(`export const bundle = { '$class': '${aHash} ${bHash}' };`);
		expect(code).toContain(`export const single = { '$class': '${bHash}' };`);
		// A body-less block has no sheet: only the two authored blocks inject.
		expect(code.match(/injectStyle\(/g)).toHaveLength(2);
	});

	it('an imported apply target stays a runtime $class read inside the bundle', () => {
		const { code } = compile(
			`
      import { theme } from './theme.tsrx';
      const a = <style>.a { color: red; }</style>;
      export const bundle = <style apply={[theme, a]} />;
      export const themed = <style apply={theme}>.t { color: blue; }</style>;
    `,
			'imported-bundle.tsrx',
		);
		const aHash = code.match(/const a = \{ '\$class': '(tsrx-[a-z0-9]+)'/i)![1];
		expect(code).toContain(`export const bundle = { '$class': theme.$class + ' ${aHash}' };`);
		// With a body, the block's own hash closes the composition.
		expect(code).toMatch(
			/export const themed = \{\s*'\$class': theme\.\$class \+ ' tsrx-[a-z0-9]+',\s*'t': 'tsrx-[a-z0-9]+ t'\s*\}/i,
		);
	});

	it('palette.$class is the hash every class value of the exported map opens with', () => {
		expect(palette.$class).toMatch(/^tsrx-[a-z0-9]+$/i);
		expect(palette.accent).toBe(`${palette.$class} accent`);
		const r = mount(Branded);
		expect(r.find('span').className).toBe(palette.accent);
		const sheet = document.head.querySelector(`style[data-octane="${palette.$class}"]`);
		expect(sheet).not.toBeNull();
		expect(sheet!.textContent).toContain(`.accent.${palette.$class}`);
		r.unmount();
	});
});
