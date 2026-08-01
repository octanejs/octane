/** @vitest-environment jsdom */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { createElement } from 'octane';
import { renderToString } from 'octane/server';
import createHydrator from '../src/client.js';

function Label(props: { text: string }) {
	return createElement('p', { id: 'label' }, props.text);
}

describe('astro:end marker before hydrateRoot', () => {
	afterEach(() => {
		document.body.replaceChildren();
		vi.restoreAllMocks();
	});

	it('strips a trailing <!--astro:end--> so hydrateRoot does not mismatch', () => {
		const { html } = renderToString(Label as any, { text: 'hello' }, { identifierPrefix: 'o0' });
		const island = document.createElement('div');
		island.setAttribute('ssr', '');
		island.setAttribute('prefix', 'o0');
		island.innerHTML = html;
		island.appendChild(document.createComment('astro:end'));
		document.body.append(island);

		expect(island.lastChild?.nodeType).toBe(Node.COMMENT_NODE);
		expect(island.lastChild?.nodeValue).toBe('astro:end');

		const errors: string[] = [];
		vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
			errors.push(args.map(String).join(' '));
		});

		createHydrator(island)(Label, { text: 'hello' }, {}, { client: 'load' });

		expect(island.querySelector('#label')?.textContent).toBe('hello');
		expect(
			[...island.childNodes].some(
				(n) => n.nodeType === Node.COMMENT_NODE && n.nodeValue === 'astro:end',
			),
		).toBe(false);
		expect(errors.filter((e) => /hydration mismatch/i.test(e))).toEqual([]);
	});
});
