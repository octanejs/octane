import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushSync, hydrateRoot } from 'octane';
import { flushEffects } from '../../../octane/tests/_helpers';
import { ServerFixture } from '../ssr/_fixtures/server.tsrx';

const SERVER_HTML =
	'<main id="draggable-server"><!--[--><!--[--><div id="html-drag" style="transform:translate(3px,4px);" class="authored react-draggable">html</div><!--]--><!--]--><!--[--><!--[--><svg id="svg-drag" style="transform:translate(5px,6px);" class="react-draggable"><circle cx="2" cy="2" r="2"></circle></svg><!--]--><!--]--><!--[--><!--[--><button id="core-drag">core</button><!--]--><!--]--></main>';

async function settle() {
	flushSync(() => {});
	flushEffects();
	await Promise.resolve();
	flushEffects();
}

afterEach(() => document.body.replaceChildren());

describe('@octanejs/draggable hydration', () => {
	// @parity-case adapted:react-draggable-hydration
	it('adopts all child nodes, selects SVG transform form, and becomes mouse interactive', async () => {
		const container = document.createElement('div');
		container.innerHTML = SERVER_HTML;
		document.body.appendChild(container);
		const html = container.querySelector('#html-drag') as HTMLElement;
		const svg = container.querySelector('#svg-drag') as SVGElement;
		const core = container.querySelector('#core-drag') as HTMLElement;
		const error = vi.spyOn(console, 'error');
		const root = hydrateRoot(container, ServerFixture, {});
		await settle();

		expect(container.querySelector('#html-drag')).toBe(html);
		expect(container.querySelector('#svg-drag')).toBe(svg);
		expect(container.querySelector('#core-drag')).toBe(core);
		expect(container.querySelectorAll('#html-drag, #svg-drag, #core-drag')).toHaveLength(3);
		expect(svg.getAttribute('transform')).toBe('translate(5,6)');
		expect(svg.getAttribute('style')).toBe('');

		html.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 10, clientY: 10 }));
		document.dispatchEvent(
			new MouseEvent('mousemove', { bubbles: true, clientX: 18, clientY: 21 }),
		);
		document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: 18, clientY: 21 }));
		await settle();
		expect(html.style.transform).toBe('translate(11px,15px)');
		expect(html.classList.contains('react-draggable-dragged')).toBe(true);
		expect(error.mock.calls).toEqual([]);
		error.mockRestore();
		root.unmount();
	});
});
