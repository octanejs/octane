import { describe, expect, it } from 'vitest';
import * as ServerRT from 'octane/server';
import { flushSync, hydrateRoot } from '../src/index.js';
import { mount } from './_helpers';
import { loadServerFixture } from './_server-fixture.js';
import { ReturnedScopedMailbox } from './_fixtures/return-style.tsrx';

const FIXTURE = 'packages/octane/tests/_fixtures/return-style.tsrx';
const server = loadServerFixture(FIXTURE);

function scopeHash(element: Element): string {
	const hash = Array.from(element.classList).find((name) => name.startsWith('tsrx-'));
	if (!hash) throw new Error('expected a scoped CSS hash class');
	return hash;
}

function cssHashes(css: string): string[] {
	return [...new Set(css.match(/tsrx-[a-f0-9]+/g) ?? [])];
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
});
