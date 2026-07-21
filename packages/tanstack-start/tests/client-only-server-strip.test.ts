import { describe, expect, it } from 'vitest';
import { octaneClientOnlyServerStrip } from '../src/client-only-server-strip.js';

// Octane analogue of the start-compiler's handleClientOnlyJSX babel pass:
// <ClientOnly> children must be REMOVED from server compiles (fallback-only
// SSR) so client-only subtrees — which routinely reference *.client.* modules
// — drop out of the server import graph before import-protection's
// tree-shake verification.
describe('octaneClientOnlyServerStrip', () => {
	const plugin = octaneClientOnlyServerStrip() as any;
	const run = (code: string, id = '/src/App.tsrx') =>
		plugin.transform.handler(code, id) as { code: string } | undefined;

	it('applies only to the server environment', () => {
		expect(plugin.applyToEnvironment({ name: 'ssr' })).toBe(true);
		expect(plugin.applyToEnvironment({ name: 'client' })).toBe(false);
		expect(plugin.applyToEnvironment({ name: 'nitro' })).toBe(false);
	});

	it('replaces ClientOnly children with a null hole, keeping fallback', () => {
		const src = [
			"import { ClientOnly } from '@octanejs/tanstack-router';",
			"import { HeavyWidget } from './HeavyWidget.client.tsrx';",
			'export function App() {',
			'\treturn (',
			'\t\t<ClientOnly fallback={<p>loading</p>}>',
			'\t\t\t<HeavyWidget mode="full" />',
			'\t\t</ClientOnly>',
			'\t);',
			'}',
			'',
		].join('\n');
		const out = run(src);
		expect(out).toBeDefined();
		expect(out!.code).not.toContain('<HeavyWidget');
		expect(out!.code).toContain('{null}');
		expect(out!.code).toContain('fallback={<p>loading</p>}');
		expect(out!.code).toContain('</ClientOnly>');
	});

	it('strips inside native @{} template bodies too', () => {
		const src = [
			"import { ClientOnly } from '@octanejs/tanstack-router';",
			"import { Sparkline } from './Sparkline.client.tsrx';",
			'export function Panel() @{',
			'\t<div>',
			'\t\t<ClientOnly>',
			'\t\t\t<Sparkline />',
			'\t\t</ClientOnly>',
			'\t</div>',
			'}',
			'',
		].join('\n');
		const out = run(src);
		expect(out).toBeDefined();
		expect(out!.code).not.toContain('<Sparkline');
		expect(out!.code).toContain('{null}');
	});

	it('leaves files without ClientOnly elements untouched', () => {
		const src = "export const clientOnlyHint = 'ClientOnly';\n";
		expect(run(src)).toBeUndefined();
	});
});
