import { describe, expect, it } from 'vitest';
import { compile } from 'octane/compiler';

// An imported theme applied by a component is a lazily injecting `styleMap`
// on the server: the component touches it at the top of ITS OWN body, before
// its own `injectStyle` calls, so the theme's CSS precedes the applying scope
// in the request collector. Nested branch/loop helpers compile through the
// same body emitter and must not take those touches for themselves.
describe('server: imported theme touches', () => {
	const source = `
		import { theme } from './theme.tsrx';
		export function Panel({ ok, items }: { ok: boolean; items: string[] }) @{
			<>
				<style apply={theme} />
				@if (ok) {
					<b class="b">{'b'}</b>
				}
				@for (const item of items) {
					<i class="i">{item}</i>
				}
				<p class="p">{'p'}</p>
				<style>.p { color: red; }</style>
			</>
		}
	`;

	it('touches the theme at the top of the component body, before its own injectStyle', () => {
		const { code } = compile(source, 'panel.tsrx', { mode: 'server' });
		const lines = code.split('\n');
		const component = lines.findIndex((line) => line.includes('function Panel('));
		const touch = lines.findIndex((line) => line.includes('_$touchStyleMap(theme)'));
		const inject = lines.findIndex((line) => line.includes('_$injectStyle("'));
		const firstHelper = lines.findIndex(
			(line, index) => index > component && /function __s(if|for)/.test(line),
		);
		expect(touch).toBeGreaterThan(component);
		expect(touch).toBeLessThan(inject);
		expect(touch).toBeLessThan(firstHelper);
		expect(code.match(/_\$touchStyleMap\(theme\)/g)).toHaveLength(1);
	});

	it('touches nothing when only same-module themes are applied', () => {
		const { code } = compile(
			`const theme = <style>.t { color: red; }</style>;
			export function Panel() @{ <><style apply={theme} /><p class="p">{'p'}</p></> }`,
			'panel.tsrx',
			{ mode: 'server' },
		);
		expect(code).not.toContain('touchStyleMap');
		expect(code).toContain('_$styleMap(');
	});

	// A same-module theme an exported block applies is inlined as a hash in
	// the class list, which says nothing about its CSS: when another module
	// touches the export, the wrapper must touch the applied maps first.
	it('lists same-module and imported applied blocks as server dependencies', () => {
		const { code } = compile(
			`import { ext } from './ext.tsrx';
			export const base = <style>.b { color: red; }</style>;
			export const theme = <style apply={[base, ext]}>.t { color: blue; }</style>;
			export const bundle = <style apply={[theme, base]} />;`,
			'themes.tsrx',
			{ mode: 'server' },
		);
		expect(code).toMatch(/const base = _\$styleMap\("tsrx-[a-z0-9]+", "[^"]*", \{[^}]*\}\);/);
		expect(code).toMatch(
			/const theme = _\$styleMap\(\s*"tsrx-[a-z0-9]+",\s*"[^"]*",\s*\{[\s\S]*?\},\s*\[base, ext\],?\s*\);/,
		);
		// A body-less bundle has no sheet: `null` id and css, dependencies kept.
		expect(code).toMatch(
			/const bundle = _\$styleMap\(\s*null,\s*null,\s*\{[\s\S]*?\},\s*\[theme, base\],?\s*\);/,
		);
	});
});
