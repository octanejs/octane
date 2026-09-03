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
});
