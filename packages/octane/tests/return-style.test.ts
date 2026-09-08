import { describe, expect, it } from 'vitest';
import * as ServerRT from 'octane/server';
import { flushSync, hydrateRoot } from '../src/index.js';
import { mount } from './_helpers';
import { loadCompiledFixtureSource, loadServerFixture } from './_server-fixture.js';
import { ReturnedBranchScopes, ReturnedNestedScopes } from './_fixtures/return-style.tsrx';
import { ControlFlow } from './_fixtures/style-scopes.tsrx';

// Raw CSS in <style> is TSRX template syntax (RFC tsrx-org/RFCs#1, amendment
// A1, rule B). A plain function that returns JSX carries a standalone block
// only inside a TSRX container written in that JSX — a directive body or a
// nested `@{ … }` — and the block styles the items beside it in that body and
// everything below them. The returned tree around the container is not in
// the scope. (A block directly in the returned JSX is the analyzer's
// `tsrx-style-standalone-outside-template` error; see
// tests/compiler/style-standalone-placement.test.ts.)

const FIXTURE = 'packages/octane/tests/_fixtures/return-style.tsrx';
const server = loadServerFixture(FIXTURE);
const SCOPES_FIXTURE = 'packages/octane/tests/_fixtures/style-scopes.tsrx';
const scopesServer = loadServerFixture(SCOPES_FIXTURE);

function cssHashes(css: string): string[] {
	return [...new Set(css.match(/tsrx-[a-f0-9]+/g) ?? [])];
}

function hashesOf(element: Element): string[] {
	return Array.from(element.classList).filter((name) => name.startsWith('tsrx-'));
}

function sheetText(hash: string): string {
	const sheet = document.head.querySelector(`style[data-octane="${hash}"]`);
	if (!sheet) throw new Error(`no injected sheet for ${hash}`);
	return sheet.textContent ?? '';
}

describe('scoped styles inside the TSRX containers of returned JSX', () => {
	it('each @if arm is a scope of its own; the returned section around it carries no hash', () => {
		const r = mount(ReturnedBranchScopes as any, { active: false, title: 'Draft mailbox' });
		const section = r.find('#returned-branches') as HTMLElement;
		const title = r.find('#returned-title') as HTMLElement;
		const idle = r.find('#returned-status') as HTMLElement;
		expect(hashesOf(section)).toEqual([]);
		expect(hashesOf(title)).toEqual([]);
		const [idleHash] = hashesOf(idle);
		expect(hashesOf(idle)).toEqual([idleHash]);
		expect(r.container.querySelector('style')).toBeNull();
		expect(sheetText(idleHash)).toContain(`.status.${idleHash}`);
		expect(getComputedStyle(idle).color).toBe('rgb(40, 50, 60)');

		r.update(ReturnedBranchScopes as any, { active: true, title: 'Sent mailbox' });
		expect(r.find('#returned-branches')).toBe(section);
		expect(r.find('#returned-title')).toBe(title);
		expect(title.textContent).toBe('Sent mailbox');
		const active = r.find('#returned-status') as HTMLElement;
		const [activeHash] = hashesOf(active);
		expect(hashesOf(active)).toEqual([activeHash]);
		expect(activeHash).not.toBe(idleHash);
		expect(sheetText(activeHash)).toContain(`.status.${activeHash}`);
		expect(getComputedStyle(active).color).toBe('rgb(10, 20, 30)');
		expect(hashesOf(section)).toEqual([]);
		r.unmount();
	});

	it('collects both arm sheets into SSR CSS and stamps only the rendered arm', () => {
		const { html, css } = ServerRT.renderToString(server.ReturnedBranchScopes, {
			active: false,
			title: 'Server mailbox',
		});
		const tags = [...css.matchAll(/data-octane="(tsrx-[a-f0-9]+)"/g)].map((m) => m[1]);
		// Both arms ship whichever branch renders; only the stamping follows it.
		expect(tags).toHaveLength(2);
		expect(cssHashes(css)).toEqual(tags);
		expect(html).toContain('<section id="returned-branches" class="mailbox">');
		expect(html).toContain('<h2 id="returned-title" class="mailbox-title">');
		const stamped = html.match(/class="status (tsrx-[a-f0-9]+)"/)![1];
		expect(tags).toContain(stamped);
		const sheets = new Map(
			[...css.matchAll(/<style data-octane="(tsrx-[a-f0-9]+)">([\s\S]*?)<\/style>/g)].map((m) => [
				m[1],
				m[2],
			]),
		);
		expect(sheets.get(stamped)).toMatch(new RegExp(`\\.status\\.${stamped}\\s*\\{`));
		expect(sheets.get(stamped)).toContain('rgb(40, 50, 60)');
		expect(html).not.toContain('<style');
	});

	it('hydrates the returned section in place and keeps the arm hash on update', () => {
		const props = { active: false, title: 'Hydrated mailbox' };
		const { html } = ServerRT.renderToString(server.ReturnedBranchScopes, props);
		const container = document.createElement('div');
		document.body.appendChild(container);
		container.innerHTML = html;
		const section = container.querySelector('#returned-branches') as HTMLElement;
		const idle = container.querySelector('#returned-status') as HTMLElement;
		const [idleHash] = hashesOf(idle);

		const root = hydrateRoot(container, ReturnedBranchScopes, props);
		flushSync(() => {});
		expect(container.querySelector('#returned-branches')).toBe(section);
		expect(container.querySelector('#returned-status')).toBe(idle);
		expect(hashesOf(idle)).toEqual([idleHash]);
		expect(hashesOf(section)).toEqual([]);

		root.render(ReturnedBranchScopes, { active: true, title: 'Updated mailbox' });
		flushSync(() => {});
		expect(container.querySelector('#returned-branches')).toBe(section);
		const active = container.querySelector('#returned-status') as HTMLElement;
		expect(hashesOf(active)).toHaveLength(1);
		expect(hashesOf(active)[0]).not.toBe(idleHash);
		expect(section.querySelector('#returned-title')!.textContent).toBe('Updated mailbox');
		root.unmount();
		container.remove();
	});

	it('a nested @{} in returned JSX stamps its own output only (client)', () => {
		const r = mount(ReturnedNestedScopes as any, { label: 'badge' });
		const section = r.find('#returned-nested');
		const note = r.find('#returned-note');
		const innerHost = r.find('#returned-inner-host');
		const inner = r.find('#returned-inner');
		expect(hashesOf(section)).toEqual([]);
		expect(hashesOf(note)).toEqual([]);
		expect(hashesOf(innerHost)).toEqual([]);
		const [innerHash] = hashesOf(inner);
		expect(hashesOf(inner)).toEqual([innerHash]);
		expect(sheetText(innerHash)).toContain(`.inner.${innerHash}`);
		expect(getComputedStyle(inner).fontWeight).toBe('700');
		expect(getComputedStyle(note).fontWeight).not.toBe('700');
		r.unmount();
	});

	it('server css and html agree with the client on the nested hash', () => {
		const { html, css } = ServerRT.renderToString(server.ReturnedNestedScopes, { label: 'badge' });
		const tags = [...css.matchAll(/data-octane="(tsrx-[a-f0-9]+)"/g)].map((m) => m[1]);
		expect(tags).toHaveLength(1);
		const [innerHash] = tags;
		expect(cssHashes(css)).toEqual(tags);
		expect(css).toContain(`.inner.${innerHash}`);
		expect(html).toContain('<section id="returned-nested" class="outer">');
		expect(html).toContain('<p id="returned-note" class="note">');
		expect(html).toContain('<div id="returned-inner-host">');
		expect(html).toContain(`class="inner ${innerHash}"`);
		expect(html).not.toContain('<style');

		// The client compile derives the same position-based hash.
		const r = mount(ReturnedNestedScopes as any, { label: 'badge' });
		expect(hashesOf(r.find('#returned-inner'))).toEqual([innerHash]);
		expect(hashesOf(r.find('#returned-nested'))).toEqual([]);
		r.unmount();
	});

	it('injects byte-identical CSS for a control-flow scope on the client and the server', () => {
		// A block inside an `@if` / `@for` body: the CSS AST nodes carry no
		// `loc`, and a stray position stamp once made the client print the hash
		// as a separate ancestor (`.tsrx-xxx b {}`) while the server printed the
		// compound selector.
		const props = { ready: true, maybe: false, items: ['x'], kind: 1 };
		const { html, css } = ServerRT.renderToString(scopesServer.ControlFlow, props);
		const serverSheets = new Map(
			[...css.matchAll(/<style data-octane="(tsrx-[a-f0-9]+)">([\s\S]*?)<\/style>/g)].map((m) => [
				m[1],
				m[2],
			]),
		);
		const yesHash = html.match(/id="cf-yes" class="cf-yes tsrx-[a-f0-9]+ (tsrx-[a-f0-9]+)"/)![1];
		const itemHash = html.match(/class="cf-item tsrx-[a-f0-9]+ (tsrx-[a-f0-9]+)"/)![1];
		expect(yesHash).not.toBe(itemHash);
		expect(serverSheets.get(yesHash)).toMatch(new RegExp(`\\.cf-yes\\.${yesHash}\\s*\\{`));
		expect(serverSheets.get(yesHash)).toMatch(new RegExp(`b\\.${yesHash}\\s*\\{`));
		expect(serverSheets.get(itemHash)).toMatch(new RegExp(`li\\.${itemHash}\\s*\\{`));

		const r = mount(ControlFlow, props);
		const yes = r.find('#cf-yes');
		const item = r.find('.cf-item');
		expect(hashesOf(yes)[1]).toBe(yesHash);
		expect(hashesOf(item)[1]).toBe(itemHash);
		for (const hash of [yesHash, itemHash]) {
			const sheet = document.head.querySelector(`style[data-octane="${hash}"]`);
			expect(sheet, hash).not.toBeNull();
			expect(sheet!.textContent).toBe(serverSheets.get(hash));
			expect(sheet!.textContent).not.toMatch(new RegExp(`\\.${hash}\\s+[a-z.]`));
		}
		expect(getComputedStyle(r.find('#cf-yes-text')).fontWeight).toBe('700');
		expect(getComputedStyle(item).letterSpacing).toBe('1px');
		r.unmount();
	});
});

// A value factory in plain TSX keeps its scoped CSS in a render-only `@{ … }`
// inside the returned fragment (rule B: raw CSS needs a TSRX container). That
// block is transparent grouping, so the fragment stays a static descriptor —
// and the block's output, its siblings, the scope hash, and the injected sheet
// must all reach the rendered result on both sides.
describe('a render-only @{} inside a returned fragment renders its output', () => {
	const SOURCE = `export function make() {
	return <><h1>Title</h1>@{ <><style>.x { color: rgb(200, 0, 0); }</style><div class="x">Hi</div></> }</>;
}
`;
	const ID = '/packages/octane/tests/value-factory-styled.tsrx';
	const compileOptions = { hmr: false, dev: false };

	it('client: mounts the heading and the styled div with the scope hash and its CSS', () => {
		const client = loadCompiledFixtureSource(SOURCE, { id: ID, mode: 'client', compileOptions });
		const value = client.make();
		expect(Array.isArray(value)).toBe(false);
		const r = mount(client.make as any);
		try {
			expect(r.find('h1').textContent).toBe('Title');
			const div = r.find('div.x') as HTMLElement;
			expect(div.textContent).toBe('Hi');
			const [hash] = hashesOf(div);
			expect(hash).toMatch(/^tsrx-/);
			expect(hashesOf(r.find('h1'))).toEqual([]);
			expect(sheetText(hash)).toContain(`.x.${hash}`);
			expect(getComputedStyle(div).color).toBe('rgb(200, 0, 0)');
		} finally {
			r.unmount();
		}
	});

	it('server: renders the heading and the styled div and collects the sheet', () => {
		const server = loadCompiledFixtureSource(SOURCE, { id: ID, mode: 'server', compileOptions });
		const { html, css } = ServerRT.renderToString(server.make, {});
		const hash = css.match(/data-octane="(tsrx-[a-f0-9]+)"/)![1];
		expect(css).toContain(`.x.${hash} { color: rgb(200, 0, 0); }`);
		expect(html).toContain('<h1>Title</h1>');
		expect(html).toContain(`<div class="x ${hash}">Hi</div>`);
		expect(html).not.toContain('<style');
	});
});
