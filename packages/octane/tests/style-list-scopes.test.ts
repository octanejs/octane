import { describe, expect, it } from 'vitest';
import * as ServerRuntime from 'octane/server';
import { compile } from 'octane/compiler';
import { mount } from './_helpers';
import { loadCompiledFixtureSource } from './_server-fixture.js';

// RFC tsrx-org/RFCs#1, amendment A1 (rule A): a standalone block is a child of
// an element or a fragment, and that children list is its scope. A block
// styles the items beside it and everything below them; it never styles the
// element that contains it. The spec's `Status` example has four scopes — the
// output fragment's children (A), the section's children (B), and the two
// `@if` arms' fragments (C, D) — and this class table, identical on the client
// and the server:
//
//   section  "status A"
//   h2       "title A B"
//   ok       "ok A B C"
//   wait     "wait A B D"
//
// with the CSS emitted A, B, C, D. The `.status` rule written in scope B
// targets the section, which is not in B: it is hashed `.status.B` and matches
// nothing. (The spec has it pruned as `(unused)`; Octane keeps every selector
// of a standalone block, so the observable outcome — the rule never applies —
// is what is pinned here.)

const SOURCE = `
export function Status(props: { ready: boolean }) @{
	<>
		<style>.status { padding: 0.5rem; }</style>
		<section id="status" class="status">
			<style>
				.title { font-weight: 700; }
				.status { color: rgb(9, 9, 9); }
			</style>
			<h2 id="title" class="title">Status</h2>
			@if (props.ready) {
				<>
					<style>.ok { color: rgb(0, 128, 0); }</style>
					<p id="ok" class="ok">Ready</p>
				</>
			} @else {
				<>
					<style>.wait { color: rgb(128, 128, 128); }</style>
					<p id="wait" class="wait">Waiting</p>
				</>
			}
		</section>
	</>
}
`;

const ID = 'style-list-scopes.tsrx';
const COMPILE_OPTIONS = { hmr: false, dev: false };

function injections(code: string): Array<{ hash: string; css: string }> {
	return [...code.matchAll(/injectStyle\("(tsrx-[a-z0-9]+)",\s*"((?:[^"\\]|\\.)*)"/g)].map(
		(match) => ({ hash: match[1], css: match[2] }),
	);
}

/** The four scope hashes by the marker selector each sheet carries, in emission order. */
function scopeHashes(code: string): { A: string; B: string; C: string; D: string } {
	const sheets = injections(code);
	const find = (marker: string) => {
		const sheet = sheets.find((entry) => entry.css.includes(marker));
		if (!sheet) throw new Error(`no sheet with ${marker} in:\n${code}`);
		return sheet.hash;
	};
	const A = find('padding: 0.5rem');
	const B = find('font-weight: 700');
	const C = find('rgb(0, 128, 0)');
	const D = find('rgb(128, 128, 128)');
	expect(new Set([A, B, C, D]).size).toBe(4);
	expect(sheets.map((sheet) => sheet.hash)).toEqual([A, B, C, D]);
	return { A, B, C, D };
}

function hashesOf(element: Element): string[] {
	return Array.from(element.classList).filter((cls) => cls.startsWith('tsrx-'));
}

describe('amendment A1: a block styles the items beside it, never its container', () => {
	it.for(['client', 'server'] as const)(
		'[%s] compiles the Status class table and CSS order',
		(mode) => {
			const { code } = compile(SOURCE, ID, { ...COMPILE_OPTIONS, mode });
			const { A, B, C, D } = scopeHashes(code);
			const unescaped = code.replace(/\\"/g, '"');
			expect(unescaped).toContain(`class="status ${A}"`);
			expect(unescaped).toContain(`class="title ${A} ${B}"`);
			expect(unescaped).toContain(`class="ok ${A} ${B} ${C}"`);
			expect(unescaped).toContain(`class="wait ${A} ${B} ${D}"`);
			// Scope A's rule is hashed A; scope B's `.status` rule is hashed B and
			// reaches no element (the section carries A only).
			const sheets = new Map(injections(code).map((sheet) => [sheet.hash, sheet.css]));
			expect(sheets.get(A)).toContain(`.status.${A} { padding: 0.5rem; }`);
			expect(sheets.get(B)).toContain(`.title.${B} { font-weight: 700; }`);
			expect(sheets.get(B)).toContain(`.status.${B} { color: rgb(9, 9, 9); }`);
			expect(sheets.get(B)).not.toContain(`.status.${A}`);
		},
	);

	it('client: mounts the table, every arm sheet is present, and the section takes only scope A', () => {
		const { code } = compile(SOURCE, ID, { ...COMPILE_OPTIONS, mode: 'client' });
		const { A, B, C, D } = scopeHashes(code);
		const client = loadCompiledFixtureSource(SOURCE, {
			id: ID,
			mode: 'client',
			compileOptions: COMPILE_OPTIONS,
		});
		const r = mount(client.Status, { ready: false });
		try {
			const section = r.find('#status') as HTMLElement;
			const title = r.find('#title') as HTMLElement;
			const wait = r.find('#wait') as HTMLElement;
			expect(section.className).toBe(`status ${A}`);
			expect(title.className).toBe(`title ${A} ${B}`);
			expect(wait.className).toBe(`wait ${A} ${B} ${D}`);
			expect(r.container.querySelector('#ok')).toBeNull();
			expect(getComputedStyle(section).padding).toBe('8px');
			expect(getComputedStyle(section).color).not.toBe('rgb(9, 9, 9)');
			expect(getComputedStyle(title).fontWeight).toBe('700');
			expect(getComputedStyle(wait).color).toBe('rgb(128, 128, 128)');

			r.update(client.Status, { ready: true });
			expect(r.find('#status')).toBe(section);
			const ok = r.find('#ok') as HTMLElement;
			expect(ok.className).toBe(`ok ${A} ${B} ${C}`);
			expect(getComputedStyle(ok).color).toBe('rgb(0, 128, 0)');
			expect(hashesOf(section)).toEqual([A]);

			const ids = Array.from(document.head.querySelectorAll('style[data-octane]')).map((sheet) =>
				sheet.getAttribute('data-octane'),
			);
			expect(ids.filter((id) => [A, B, C, D].includes(id!))).toEqual([A, B, C, D]);
		} finally {
			r.unmount();
		}
	});

	it('server: renders the same table and collects the four sheets in order', () => {
		const { code } = compile(SOURCE, ID, { ...COMPILE_OPTIONS, mode: 'server' });
		const { A, B, C, D } = scopeHashes(code);
		const server = loadCompiledFixtureSource(SOURCE, {
			id: ID,
			mode: 'server',
			compileOptions: COMPILE_OPTIONS,
		});
		const ready = ServerRuntime.renderToString(server.Status, { ready: true });
		expect(ready.html).toContain(`<section id="status" class="status ${A}">`);
		expect(ready.html).toContain(`<h2 id="title" class="title ${A} ${B}">`);
		expect(ready.html).toContain(`<p id="ok" class="ok ${A} ${B} ${C}">`);
		expect(ready.html).not.toContain('wait');
		const tags = [...ready.css.matchAll(/data-octane="(tsrx-[a-f0-9]+)"/g)].map((m) => m[1]);
		expect(tags).toEqual([A, B, C, D]);
		const waiting = ServerRuntime.renderToString(server.Status, { ready: false });
		expect(waiting.html).toContain(`<p id="wait" class="wait ${A} ${B} ${D}">`);
		// Client and server derive the same position-based hashes.
		expect(scopeHashes(compile(SOURCE, ID, { ...COMPILE_OPTIONS, mode: 'client' }).code)).toEqual({
			A,
			B,
			C,
			D,
		});
	});

	it('two blocks in one children list share a hash; a block in the enclosing fragment does not', () => {
		const source = `
export function Two() @{
	<>
		<style>.host { margin: 0; }</style>
		<div id="host" class="host">
			<style>.a { color: red; }</style>
			<i class="a">a</i>
			<style>.b { color: blue; }</style>
			<b class="b">b</b>
		</div>
	</>
}
`;
		for (const mode of ['client', 'server'] as const) {
			const { code } = compile(source, 'two-lists.tsrx', { ...COMPILE_OPTIONS, mode });
			const sheets = injections(code);
			expect(sheets).toHaveLength(2);
			const [body, children] = sheets;
			expect(body.css).toContain(`.host.${body.hash}`);
			expect(children.css).toContain(`.a.${children.hash}`);
			expect(children.css).toContain(`.b.${children.hash}`);
			expect(body.hash).not.toBe(children.hash);
			const unescaped = code.replace(/\\"/g, '"');
			expect(unescaped).toContain(`class="host ${body.hash}"`);
			expect(unescaped).toContain(`class="a ${body.hash} ${children.hash}"`);
			expect(unescaped).toContain(`class="b ${body.hash} ${children.hash}"`);
		}
	});

	it('a block in a fragment and one in a nested fragment above the same output are two scopes', () => {
		const source = `
export function Twice() @{
	<>
		<style>.x { margin: 0; }</style>
		<>
			<style>.x { padding: 0; }</style>
			<p class="x">x</p>
		</>
	</>
}
`;
		for (const mode of ['client', 'server'] as const) {
			const { code } = compile(source, 'two-scopes.tsrx', { ...COMPILE_OPTIONS, mode });
			const [outer, inner] = injections(code);
			expect(outer.hash).not.toBe(inner.hash);
			expect(outer.css).toContain(`.x.${outer.hash} { margin: 0; }`);
			expect(inner.css).toContain(`.x.${inner.hash} { padding: 0; }`);
			expect(code.replace(/\\"/g, '"')).toContain(`class="x ${outer.hash} ${inner.hash}"`);
		}
	});

	it('apply on a standalone block reaches the same elements as its CSS', () => {
		const source = `
const theme = <style>div { color: red; }</style>;
export function Applied() @{
	<section id="outside">
		<style apply={theme}>.in { margin: 0; }</style>
		<div class="in">in</div>
	</section>
}
`;
		for (const mode of ['client', 'server'] as const) {
			const { code } = compile(source, 'apply-list.tsrx', { ...COMPILE_OPTIONS, mode });
			const themeHash = code.match(/'\$class': '(tsrx-[a-z0-9]+)'/)![1];
			const scope = injections(code).find((sheet) => sheet.css.includes('margin: 0'))!;
			const unescaped = code.replace(/\\"/g, '"');
			expect(unescaped).toContain(`class="in ${scope.hash} ${themeHash}"`);
			// The containing section is neither hashed nor themed.
			expect(unescaped).toContain('<section id="outside">');
		}
	});
});
