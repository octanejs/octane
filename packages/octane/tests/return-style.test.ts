import { describe, expect, it } from 'vitest';
import * as ServerRT from 'octane/server';
import { flushSync, hydrateRoot } from '../src/index.js';
import { mount } from './_helpers';
import { loadServerFixture } from './_server-fixture.js';
import { ReturnedScopedMailbox, ReturnedNestedScopes } from './_fixtures/return-style.tsrx';
import { ControlFlow } from './_fixtures/style-scopes.tsrx';

const FIXTURE = 'packages/octane/tests/_fixtures/return-style.tsrx';
const server = loadServerFixture(FIXTURE);
const SCOPES_FIXTURE = 'packages/octane/tests/_fixtures/style-scopes.tsrx';
const scopesServer = loadServerFixture(SCOPES_FIXTURE);

function scopeHash(element: Element): string {
	const hash = Array.from(element.classList).find((name) => name.startsWith('tsrx-'));
	if (!hash) throw new Error('expected a scoped CSS hash class');
	return hash;
}

function cssHashes(css: string): string[] {
	return [...new Set(css.match(/tsrx-[a-f0-9]+/g) ?? [])];
}

function hashesOf(element: Element): string[] {
	return Array.from(element.classList).filter((name) => name.startsWith('tsrx-'));
}

function sheetOrder(hashes: string[]): string[] {
	return Array.from(document.head.querySelectorAll('style[data-octane]'))
		.map((style) => style.getAttribute('data-octane')!)
		.filter((id) => hashes.includes(id));
}

describe('scoped styles in React-style returned JSX', () => {
	it('injects two style blocks under one scope and preserves DOM across updates', () => {
		const r = mount(ReturnedScopedMailbox as any, {
			active: false,
			title: 'Draft mailbox',
		});
		const section = r.find('#returned-scoped-mailbox') as HTMLElement;
		const title = r.find('.mailbox-title') as HTMLElement;
		const hash = scopeHash(section);
		const style = document.head.querySelector(
			`style[data-octane="${hash}"]`,
		) as HTMLStyleElement | null;

		expect(r.container.querySelector('style')).toBeNull();
		expect(style).not.toBeNull();
		expect(cssHashes(style!.textContent || '')).toEqual([hash]);
		expect(style!.textContent).toContain(`.mailbox.${hash}`);
		expect(style!.textContent).toContain(`.mailbox-title.${hash}`);
		expect(getComputedStyle(section).color).toBe('rgb(10, 20, 30)');
		expect(getComputedStyle(title).fontWeight).toBe('700');

		r.update(ReturnedScopedMailbox as any, {
			active: true,
			title: 'Sent mailbox',
		});
		expect(r.find('#returned-scoped-mailbox')).toBe(section);
		expect(r.find('.mailbox-title')).toBe(title);
		expect(section.classList.contains('active')).toBe(true);
		expect(scopeHash(section)).toBe(hash);
		expect(title.textContent).toBe('Sent mailbox');
		expect(getComputedStyle(section).backgroundColor).toBe('rgb(40, 50, 60)');
		r.unmount();
	});

	it('collects both blocks into SSR CSS under the client-visible hash', () => {
		const { html, css } = ServerRT.renderToString(server.ReturnedScopedMailbox, {
			active: false,
			title: 'Server mailbox',
		});
		const hashes = cssHashes(css);

		expect(hashes).toHaveLength(1);
		expect(cssHashes(html)).toEqual(hashes);
		expect(css).toContain(`.mailbox.${hashes[0]}`);
		expect(css).toContain(`.mailbox-title.${hashes[0]}`);
		expect(css).toContain('letter-spacing: 2px');
		expect(html).not.toContain('<style');
	});

	it('hydrates the scoped returned fragment in place and keeps its hash on update', () => {
		const props = { active: false, title: 'Hydrated mailbox' };
		const { html } = ServerRT.renderToString(server.ReturnedScopedMailbox, props);
		const container = document.createElement('div');
		document.body.appendChild(container);
		container.innerHTML = html;
		const section = container.querySelector('#returned-scoped-mailbox') as HTMLElement;
		const title = container.querySelector('.mailbox-title') as HTMLElement;
		const hash = scopeHash(section);

		const root = hydrateRoot(container, ReturnedScopedMailbox, props);
		flushSync(() => {});
		expect(container.querySelector('#returned-scoped-mailbox')).toBe(section);
		expect(container.querySelector('.mailbox-title')).toBe(title);
		expect(scopeHash(section)).toBe(hash);

		root.render(ReturnedScopedMailbox, { active: true, title: 'Updated mailbox' });
		flushSync(() => {});
		expect(container.querySelector('#returned-scoped-mailbox')).toBe(section);
		expect(container.querySelector('.mailbox-title')).toBe(title);
		expect(scopeHash(section)).toBe(hash);
		expect(section.classList.contains('active')).toBe(true);
		expect(title.textContent).toBe('Updated mailbox');
		root.unmount();
		container.remove();
	});

	// RFC tsrx-org/RFCs#1: an assigned template is a scope, the returned tree
	// is another, and a nested `@{}` inside it carries both enclosing hashes.
	it('stamps every enclosing hash per element and orders scope sheets lexically (client)', () => {
		const r = mount(ReturnedNestedScopes as any, { label: 'badge' });
		const section = r.find('#returned-nested');
		const note = r.find('#returned-note');
		const badge = r.find('#returned-badge');
		const innerHost = r.find('#returned-inner-host');
		const inner = r.find('#returned-inner');
		const [outer] = hashesOf(section);
		expect(hashesOf(section)).toEqual([outer]);
		expect(hashesOf(note)).toEqual([outer]);
		expect(hashesOf(innerHost)).toEqual([outer]);
		const [badgeHash] = hashesOf(badge);
		expect(hashesOf(badge)).toEqual([badgeHash]);
		expect(badgeHash).not.toBe(outer);
		expect(hashesOf(inner)).toHaveLength(2);
		expect(hashesOf(inner)[0]).toBe(outer);
		const innerHash = hashesOf(inner)[1];
		expect(new Set([outer, badgeHash, innerHash]).size).toBe(3);
		// Lexical pre-order: the badge is declared first, then the returned
		// tree's scope, then the scope nested in it.
		expect(sheetOrder([outer, badgeHash, innerHash])).toEqual([badgeHash, outer, innerHash]);
		const outerSheet = document.head.querySelector(`style[data-octane="${outer}"]`)!;
		expect(outerSheet.textContent).toContain(`.outer.${outer}`);
		expect(outerSheet.textContent).toContain(`.note.${outer}`);
		expect(getComputedStyle(badge).color).toBe('rgb(70, 80, 90)');
		expect(getComputedStyle(note).letterSpacing).toBe('1px');
		expect(getComputedStyle(inner).fontWeight).toBe('700');
		expect(getComputedStyle(inner).color).toBe('rgb(1, 2, 3)');
		r.unmount();
	});

	it('server css and html agree with the client on every hash and on per-scope order', () => {
		const { html, css } = ServerRT.renderToString(server.ReturnedNestedScopes, { label: 'badge' });
		const tags = [...css.matchAll(/data-octane="(tsrx-[a-f0-9]+)"/g)].map((m) => m[1]);
		expect(tags).toHaveLength(3);
		const [badgeHash, outer, innerHash] = tags;
		expect(cssHashes(css)).toEqual(tags);
		expect(css).toContain(`.badge.${badgeHash}`);
		expect(css).toContain(`.outer.${outer}`);
		expect(css).toContain(`.note.${outer}`);
		expect(css).toContain(`.inner.${innerHash}`);
		expect(html).toContain(`<section id="returned-nested" class="outer ${outer}">`);
		expect(html).toContain(`class="note ${outer}"`);
		expect(html).toContain(`class="badge ${badgeHash}"`);
		expect(html).toContain(`<div id="returned-inner-host" class="${outer}">`);
		expect(html).toContain(`class="inner ${outer} ${innerHash}"`);
		expect(html).not.toContain('<style');

		// The client compile derives the same position-based hashes.
		const r = mount(ReturnedNestedScopes as any, { label: 'badge' });
		expect(hashesOf(r.find('#returned-nested'))).toEqual([outer]);
		expect(hashesOf(r.find('#returned-badge'))).toEqual([badgeHash]);
		expect(hashesOf(r.find('#returned-inner'))).toEqual([outer, innerHash]);
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
