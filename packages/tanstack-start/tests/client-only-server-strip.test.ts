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
		plugin.transform.handler(code, id) as
			| {
					code: string;
					map: { sources: Array<string>; sourcesContent: Array<string> };
			  }
			| undefined;

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

	it('recognizes an aliased Router ClientOnly binding', () => {
		const src = [
			"import { ClientOnly as BrowserOnly } from '@octanejs/tanstack-router';",
			'export function App() @{',
			'\t<BrowserOnly fallback={<p>loading</p>}>',
			'\t\t<BrowserWidget />',
			'\t</BrowserOnly>',
			'}',
			'',
		].join('\n');
		const out = run(src);
		expect(out).toBeDefined();
		expect(out!.code).toMatch(
			/<BrowserOnly fallback={<p>loading<\/p>}>\s*\{null\}\s*<\/BrowserOnly>/,
		);
		expect(out!.code).not.toContain('<BrowserWidget />');
	});

	it('removes imports whose only uses disappear with ClientOnly children', () => {
		const src = [
			"import BrowserDefault, { BrowserWidget as Widget, Keep, type Props } from './mixed.client.tsrx';",
			"import * as BrowserNamespace from './namespace.client.tsrx';",
			"import Unused from './unused.client.tsrx';",
			"import './side-effect.client.tsrx';",
			"import { ClientOnly } from '@octanejs/tanstack-router';",
			'const retained = Keep;',
			'export function App() @{',
			'\t<ClientOnly>',
			'\t\t<BrowserDefault />',
			'\t\t<Widget />',
			'\t\t<BrowserNamespace.Widget />',
			'\t</ClientOnly>',
			'}',
			'',
		].join('\n');
		const out = run(src);
		expect(out).toBeDefined();
		expect(out!.code).toContain("import { Keep, type Props } from './mixed.client.tsrx';");
		expect(out!.code).not.toContain('BrowserDefault');
		expect(out!.code).not.toContain('BrowserWidget as Widget');
		expect(out!.code).not.toContain("from './namespace.client.tsrx'");
		// An already-unused import may intentionally initialize its module.
		expect(out!.code).toContain("import Unused from './unused.client.tsrx';");
		expect(out!.code).toContain("import './side-effect.client.tsrx';");
		expect(out!.code).toContain('const retained = Keep;');
	});

	it('keeps an import that is also used outside ClientOnly children', () => {
		const src = [
			"import { BrowserWidget as Widget } from './widget.client.tsrx';",
			"import { ClientOnly } from '@octanejs/tanstack-router';",
			'export function App() @{',
			'\t<ClientOnly fallback={<Widget location="fallback" />}>',
			'\t\t<Widget location="child" />',
			'\t</ClientOnly>',
			'}',
			'',
		].join('\n');
		const out = run(src);
		expect(out).toBeDefined();
		expect(out!.code).toContain("import { BrowserWidget as Widget } from './widget.client.tsrx';");
		expect(out!.code).toContain('<Widget location="fallback" />');
		expect(out!.code).not.toContain('<Widget location="child" />');
	});

	it('keeps imports used by binding-pattern default expressions', () => {
		const src = [
			'import {',
			'\tBrowserWidget as ParameterWidget,',
			'\tBrowserWidget as DestructuredWidget,',
			'\tBrowserWidget as KeyWidget,',
			"} from './widget.client.tsrx';",
			"import { ClientOnly } from '@octanejs/tanstack-router';",
			'const {',
			'\tcomponent = DestructuredWidget,',
			'\t[KeyWidget]: keyedComponent,',
			'} = registry;',
			'function selectComponent(candidate = ParameterWidget) {',
			'\treturn candidate ?? component ?? keyedComponent;',
			'}',
			'export function App() @{',
			'\t<ClientOnly>',
			'\t\t<ParameterWidget />',
			'\t\t<DestructuredWidget />',
			'\t\t<KeyWidget />',
			'\t</ClientOnly>',
			'}',
			'',
		].join('\n');
		const out = run(src);
		expect(out).toBeDefined();
		expect(out!.code).toContain('BrowserWidget as ParameterWidget');
		expect(out!.code).toContain('BrowserWidget as DestructuredWidget');
		expect(out!.code).toContain('BrowserWidget as KeyWidget');
		expect(out!.code).toContain('component = DestructuredWidget');
		expect(out!.code).toContain('[KeyWidget]: keyedComponent');
		expect(out!.code).toContain('candidate = ParameterWidget');
		expect(out!.code).not.toContain('<ParameterWidget />');
		expect(out!.code).not.toContain('<DestructuredWidget />');
		expect(out!.code).not.toContain('<KeyWidget />');
	});

	it('does not mistake a shadowed use for a live imported binding', () => {
		const src = [
			"import { BrowserWidget as Widget } from './widget.client.tsrx';",
			"import { ClientOnly } from '@octanejs/tanstack-router';",
			'export function App() @{ <ClientOnly><Widget /></ClientOnly> }',
			'function Local(Widget) {',
			'\treturn <Widget location="local" />;',
			'}',
			'',
		].join('\n');
		const out = run(src);
		expect(out).toBeDefined();
		expect(out!.code).not.toContain("from './widget.client.tsrx'");
		expect(out!.code).toContain('<Widget location="local" />');
	});

	it('leaves a shadowing local ClientOnly component intact', () => {
		const src = [
			"import { ClientOnly } from '@octanejs/tanstack-router';",
			'export function App() @{ <ClientOnly><BrowserWidget /></ClientOnly> }',
			'function Local() {',
			'\tconst ClientOnly = LocalBoundary;',
			'\treturn <ClientOnly><LocalWidget /></ClientOnly>;',
			'}',
			'',
		].join('\n');
		const out = run(src);
		expect(out).toBeDefined();
		expect(out!.code).not.toContain('<BrowserWidget />');
		expect(out!.code).toContain('<LocalWidget />');
	});

	it('respects ClientOnly bindings in loop, switch, and static-block scopes', () => {
		const src = [
			"import { ClientOnly } from '@octanejs/tanstack-router';",
			'export function App() @{ <ClientOnly><ImportedWidget /></ClientOnly> }',
			'function ForLoop() {',
			'\tfor (let ClientOnly = LocalBoundary; active; advance()) {',
			'\t\treturn <ClientOnly><ForWidget /></ClientOnly>;',
			'\t}',
			'}',
			'function ForOfLoop() {',
			'\tfor (const ClientOnly of boundaries) {',
			'\t\treturn <ClientOnly><ForOfWidget /></ClientOnly>;',
			'\t}',
			'}',
			'function ForInLoop() {',
			'\tfor (const ClientOnly in boundaries) {',
			'\t\treturn <ClientOnly><ForInWidget /></ClientOnly>;',
			'\t}',
			'}',
			'function SwitchExample() {',
			'\tswitch (kind) {',
			"\t\tcase 'local':",
			'\t\t\tconst ClientOnly = LocalBoundary;',
			'\t\t\treturn <ClientOnly><SwitchWidget /></ClientOnly>;',
			'\t}',
			'}',
			'class StaticExample {',
			'\tstatic {',
			'\t\tconst ClientOnly = LocalBoundary;',
			'\t\tconst view = <ClientOnly><StaticWidget /></ClientOnly>;',
			'\t}',
			'}',
			'',
		].join('\n');
		const out = run(src);
		expect(out).toBeDefined();
		expect(out!.code).not.toContain('<ImportedWidget />');
		expect(out!.code).toContain('<ForWidget />');
		expect(out!.code).toContain('<ForOfWidget />');
		expect(out!.code).toContain('<ForInWidget />');
		expect(out!.code).toContain('<SwitchWidget />');
		expect(out!.code).toContain('<StaticWidget />');
	});

	it('handles nested imported ClientOnly boundaries as one child range', () => {
		const src = [
			"import { ClientOnly } from '@octanejs/tanstack-router';",
			'export function App() @{',
			'\t<ClientOnly fallback={<p>outer</p>}>',
			'\t\t<ClientOnly fallback={<p>inner</p>}><BrowserWidget /></ClientOnly>',
			'\t</ClientOnly>',
			'}',
			'',
		].join('\n');
		const out = run(src);
		expect(out).toBeDefined();
		expect(out!.code).toMatch(/<ClientOnly fallback={<p>outer<\/p>}>\s*\{null\}\s*<\/ClientOnly>/);
		expect(out!.code).not.toContain('<BrowserWidget />');
		expect(out!.code).not.toContain('{null}ntOnly>');
	});

	it('returns a high-resolution source map for the transformed TSRX module', () => {
		const src = [
			"import { ClientOnly } from '@octanejs/tanstack-router';",
			'export function App() @{ <ClientOnly><BrowserWidget /></ClientOnly> }',
			'',
		].join('\n');
		const out = run(src, '/src/routes/app.tsrx?split=server');
		expect(out).toBeDefined();
		expect(out!.map.sources).toEqual(['/src/routes/app.tsrx']);
		expect(out!.map.sourcesContent).toEqual([src]);
	});

	it('leaves files without an imported Router ClientOnly binding untouched', () => {
		const src = [
			'function ClientOnly(props) @{ <>{props.children}</> }',
			'export function App() @{ <ClientOnly><LocalWidget /></ClientOnly> }',
			'',
		].join('\n');
		expect(run(src)).toBeUndefined();
	});
});
