import { describe, expect, it } from 'vitest';
import * as ServerRuntime from 'octane/server';
import { loadCompiledFixtureSource } from './_server-fixture.js';

// On the server an assigned block is a lazily injecting map: reading it
// injects its CSS after the CSS of the themes it applies. A theme exported
// from module A and applied by a component in module B is only ever touched
// through B (`touchStyleMap(theme)`), so the themes A's export applies —
// same-module ones included, although their hashes are inlined in the class
// list — must inject through that touch, transitively and in "applied before
// applier" order, each once.

const compileOptions = { hmr: false, dev: false };

function load(source: string, id: string, runtimeModules?: Record<string, Record<string, any>>) {
	return loadCompiledFixtureSource(source, { id, mode: 'server', compileOptions, runtimeModules });
}

function sheetHashes(css: string): string[] {
	return [...css.matchAll(/<style data-octane="(tsrx-[a-f0-9]+)">/g)].map((m) => m[1]);
}

function ruleHash(css: string, marker: string): string {
	const match = css.match(new RegExp(`<style data-octane="(tsrx-[a-f0-9]+)">[^<]*${marker}`));
	if (!match) throw new Error(`no sheet carrying ${marker} in:\n${css}`);
	return match[1];
}

describe('server: themes applied by an imported theme inject through its touch', () => {
	it('injects base, then the theme applying it, then the applier scope, and stamps the chain', () => {
		const themes = load(
			`export const base = <style>
				div { --base: 1; }
			</style>;
			export const theme = <style apply={base}>
				div { --theme: 1; }
				.dark { --dark: 1; }
			</style>;`,
			'/packages/octane/tests/ssr-theme-chain-a.tsrx',
		);
		const app = load(
			`import { theme } from './themes.tsrx';
			export function Panel() @{
				<>
					<style apply={theme}>
						div { --panel: 1; }
					</style>
					<div id="panel" class="panel">{'panel'}</div>
					<span class={theme.dark}>{'dark'}</span>
				</>
			}`,
			'/packages/octane/tests/ssr-theme-chain-b.tsrx',
			{ './themes.tsrx': themes },
		);
		const { html, css } = ServerRuntime.renderToString(app.Panel, {});
		const base = ruleHash(css, '--base');
		const theme = ruleHash(css, '--theme');
		const panel = ruleHash(css, '--panel');
		expect(sheetHashes(css)).toEqual([base, theme, panel]);
		expect(themes.theme.$class).toBe(`${base} ${theme}`);
		expect(html).toContain(`<div id="panel" class="panel ${panel} ${base} ${theme}">`);
		expect(html).toContain(`class="${theme} dark ${panel} ${base} ${theme}"`);
	});

	it('a body-less exported bundle injects every theme it applies when touched', () => {
		const themes = load(
			`export const base = <style>
				div { --base: 1; }
			</style>;
			export const accent = <style>
				.accent { --accent: 1; }
			</style>;
			export const bundle = <style apply={[base, accent]} />;`,
			'/packages/octane/tests/ssr-theme-chain-bundle.tsrx',
		);
		const app = load(
			`import { bundle } from './themes.tsrx';
			export function Card() @{
				<>
					<style apply={bundle} />
					<div class="card">{'card'}</div>
				</>
			}`,
			'/packages/octane/tests/ssr-theme-chain-bundle-app.tsrx',
			{ './themes.tsrx': themes },
		);
		const { html, css } = ServerRuntime.renderToString(app.Card, {});
		const base = ruleHash(css, '--base');
		const accent = ruleHash(css, '--accent');
		expect(sheetHashes(css)).toEqual([base, accent]);
		expect(css).not.toContain('data-octane=""');
		expect(themes.bundle.$class).toBe(`${base} ${accent}`);
		expect(html).toContain(`<div class="card ${base} ${accent}">`);
	});

	it('a diamond (c applies [a, b], b applies a) injects each theme once, applied before applier', () => {
		const themes = load(
			`export const a = <style>
				div { --a: 1; }
			</style>;
			export const b = <style apply={a}>
				div { --b: 1; }
			</style>;
			export const c = <style apply={[a, b]}>
				div { --c: 1; }
			</style>;`,
			'/packages/octane/tests/ssr-theme-chain-diamond.tsrx',
		);
		const app = load(
			`import { c } from './themes.tsrx';
			export function Leaf() @{
				<>
					<style apply={c} />
					<div class="leaf">{'leaf'}</div>
				</>
			}`,
			'/packages/octane/tests/ssr-theme-chain-diamond-app.tsrx',
			{ './themes.tsrx': themes },
		);
		const { html, css } = ServerRuntime.renderToString(app.Leaf, {});
		const a = ruleHash(css, '--a');
		const b = ruleHash(css, '--b');
		const c = ruleHash(css, '--c');
		expect(new Set([a, b, c]).size).toBe(3);
		expect(sheetHashes(css)).toEqual([a, b, c]);
		expect(themes.c.$class).toBe(`${a} ${b} ${c}`);
		expect(html).toContain(`<div class="leaf ${a} ${b} ${c}">`);
	});
});
