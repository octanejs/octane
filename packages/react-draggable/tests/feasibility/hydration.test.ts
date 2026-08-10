import { describe, expect, it } from 'vitest';
import { flushSync, hydrateRoot } from 'octane';
import { HtmlAdoption, SvgAdoption } from './_fixtures/adoption.tsrx';

describe('react-draggable feasibility: hydration adoption', () => {
	it.each([
		['html', '<div data-kind="server">html</div>', HtmlAdoption, 'div'],
		['svg', '<svg data-kind="server"><circle cx="1" cy="1" r="1"></circle></svg>', SvgAdoption, 'svg'],
	] as const)('adopts the same %s node and selects its transform after ref delivery', (_kind, html, Body, selector) => {
		const container = document.createElement('div');
		container.innerHTML = html;
		const serverNode = container.querySelector(selector)!;
		const root = hydrateRoot(container, Body);
		flushSync(() => {});
		expect(container.querySelector(selector)).toBe(serverNode);
		expect(serverNode.getAttribute('data-kind')).toBe(_kind);
		if (_kind === 'svg') expect(serverNode.getAttribute('transform')).toBe('translate(3,4)');
		else expect((serverNode as HTMLElement).style.transform).toBe('translate(3px,4px)');
		root.unmount();
	});
});
