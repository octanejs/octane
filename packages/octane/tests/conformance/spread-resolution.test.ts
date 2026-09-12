import { afterEach, expect, it, vi } from 'vitest';
import { flushSync, hydrateRoot } from 'octane';
import { renderToString } from 'octane/server';
import { mount } from '../_helpers.js';
import { loadServerFixture } from '../_server-fixture.js';
import * as client from './_fixtures/client-host-source-aggregation.tsrx';

const server = loadServerFixture<typeof client>(
	'packages/octane/tests/conformance/_fixtures/client-host-source-aggregation.tsrx',
);

afterEach(() => vi.restoreAllMocks());

it('keeps the repeated raw alias winner in its original application position', () => {
	for (const rendering of ['client', 'server'] as const) {
		const log: string[] = [];
		const value = (name: string) => ({
			toString() {
				log.push(name);
				return name;
			},
		});
		const props = {
			first: { htmlFor: value('overwritten'), title: value('title') },
			second: { for: value('losing alias') },
			finalFor: value('final'),
		};
		if (rendering === 'server') {
			const { html } = renderToString(server.RepeatedAliasSources, props);
			expect(html).toContain('for="final"');
			expect(html).not.toContain('overwritten');
			expect(html).not.toContain('losing alias');
		} else {
			const result = mount(client.RepeatedAliasSources, props);
			try {
				expect(result.container.firstElementChild?.getAttribute('for')).toBe('final');
			} finally {
				result.unmount();
			}
		}
		expect(log).toEqual(['final', 'title']);
	}
});

it('adopts alias winners and removes a final undefined writer without reviving an earlier alias', () => {
	const props = {
		first: { htmlFor: 'first', title: 'title' },
		second: { for: 'second' },
		finalFor: 'final' as string | undefined,
	};
	const container = document.createElement('div');
	document.body.appendChild(container);
	container.innerHTML = renderToString(server.RepeatedAliasSources, props).html;
	const element = container.firstElementChild;
	const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
	const root = hydrateRoot(container, client.RepeatedAliasSources, props);
	try {
		flushSync(() => {});
		expect(container.firstElementChild).toBe(element);
		expect(element?.getAttribute('for')).toBe('final');
		flushSync(() => root.render(client.RepeatedAliasSources, { ...props, finalFor: undefined }));
		expect(container.firstElementChild).toBe(element);
		expect(element?.hasAttribute('for')).toBe(false);
		expect(element?.getAttribute('title')).toBe('title');
		expect(errors.mock.calls).toEqual([]);
	} finally {
		root.unmount();
		container.remove();
	}
});

it('snapshots a string value before a later symbol getter deletes it', () => {
	for (const rendering of ['client', 'server'] as const) {
		const symbol = Symbol('delete earlier key');
		const log: string[] = [];
		const raw: Record<PropertyKey, unknown> = {};
		Object.defineProperty(raw, 'title', {
			enumerable: true,
			configurable: true,
			get() {
				log.push('title');
				return 'saved';
			},
		});
		Object.defineProperty(raw, symbol, {
			enumerable: true,
			get() {
				log.push('symbol');
				delete raw.title;
				return 'ignored';
			},
		});
		if (rendering === 'server') {
			expect(renderToString(server.StableSpreadSources, { source: raw }).html).toContain(
				'title="saved"',
			);
		} else {
			const result = mount(client.StableSpreadSources, { source: raw });
			try {
				expect(result.container.firstElementChild?.getAttribute('title')).toBe('saved');
			} finally {
				result.unmount();
			}
		}
		expect(log).toEqual(['title', 'symbol']);
	}
});

it('diffs a replaced style object while stable handlers retain capture and bubble behavior', () => {
	const log: string[] = [];
	const style = { color: 'red', backgroundColor: 'black' } as Record<string, string>;
	const source: Record<string, unknown> = {
		style,
		onClickCapture: () => log.push('capture'),
		onClick: () => log.push('bubble'),
	};
	const result = mount(client.StableSpreadSources, { source });
	try {
		const button = result.container.firstElementChild as HTMLButtonElement;
		source.style = { color: 'blue' };
		result.update(client.StableSpreadSources, { source });
		expect(result.container.firstElementChild).toBe(button);
		expect(button.style.color).toBe('blue');
		expect(button.style.backgroundColor).toBe('');
		button.click();
		expect(log).toEqual(['capture', 'bubble']);
		delete source.onClickCapture;
		source.onClick = () => log.push('replacement');
		result.update(client.StableSpreadSources, { source });
		button.click();
		expect(log).toEqual(['capture', 'bubble', 'replacement']);
		delete source.onClick;
		result.update(client.StableSpreadSources, { source });
		button.click();
		expect(log).toEqual(['capture', 'bubble', 'replacement']);
	} finally {
		result.unmount();
	}
});

it('keeps case-sensitive custom listeners separate from delegated JSX handlers', () => {
	const custom = vi.fn();
	const click = vi.fn();
	const source: Record<string, unknown> = { onWidgetReady: custom, onClick: click };
	const result = mount(client.CustomSpreadSources, { source });
	try {
		const element = result.container.firstElementChild as HTMLElement;
		result.update(client.CustomSpreadSources, { source });
		element.dispatchEvent(new Event('WidgetReady'));
		element.dispatchEvent(new Event('widgetready'));
		element.click();
		expect(custom).toHaveBeenCalledTimes(1);
		expect(click).toHaveBeenCalledTimes(1);
		delete source.onWidgetReady;
		delete source.onClick;
		result.update(client.CustomSpreadSources, { source });
		element.dispatchEvent(new Event('WidgetReady'));
		element.click();
		expect(custom).toHaveBeenCalledTimes(1);
		expect(click).toHaveBeenCalledTimes(1);
	} finally {
		result.unmount();
	}
});

it('observes a stable style getter failure and permits a fresh root after rollback', () => {
	let fail = false;
	const source = {
		style: {
			get color() {
				if (fail) throw new Error('style getter failed');
				return 'blue';
			},
		},
	};
	const result = mount(client.StableSpreadSources, { source });
	try {
		fail = true;
		expect(() => result.update(client.StableSpreadSources, { source })).toThrow(
			'style getter failed',
		);
		expect(result.container.childNodes).toHaveLength(0);
		fail = false;
		result.update(client.StableSpreadSources, { source });
		expect((result.container.firstElementChild as HTMLButtonElement).style.color).toBe('blue');
	} finally {
		result.unmount();
	}
});
