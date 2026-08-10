/** @jsxImportSource octane */
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { flushSync, hydrateRoot } from 'octane';
import { flushEffects } from '../../octane/tests/_helpers';
import TextareaAutosize from '../src/index.tsrx';

const SERVER_HTML =
	'<textarea aria-label="Message" placeholder="Write something" style="box-sizing:border-box;font-size:16px;height:55px;line-height:20px;width:120px;">hello</textarea>';

const style = {
	boxSizing: 'border-box' as const,
	fontSize: '16px',
	height: 55,
	lineHeight: '20px',
	width: '120px',
};

beforeAll(() => {
	Object.defineProperty(document, 'fonts', {
		configurable: true,
		value: { addEventListener() {}, removeEventListener() {} },
	});
	Object.defineProperty(HTMLTextAreaElement.prototype, 'scrollHeight', {
		configurable: true,
		get() {
			const textarea = this as HTMLTextAreaElement;
			const value = textarea.value || textarea.placeholder || 'x';
			return value.split('\n').length * 20;
		},
	});
});

function settle(): void {
	flushEffects();
	flushSync(() => {});
}

describe('@octanejs/textarea-autosize hydration', () => {
	it('adopts the server textarea, measures it, and activates input behavior', () => {
		const container = document.createElement('div');
		container.innerHTML = SERVER_HTML;
		document.body.appendChild(container);
		const serverTextarea = container.querySelector('textarea') as HTMLTextAreaElement;
		const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
		const heights: Array<[number, number]> = [];
		const changes: string[] = [];

		const root = hydrateRoot(container, TextareaAutosize, {
			'aria-label': 'Message',
			defaultValue: 'hello',
			minRows: 2,
			onChange: (event) => changes.push(event.currentTarget.value),
			onHeightChange: (height, meta) => heights.push([height, meta.rowHeight]),
			placeholder: 'Write something',
			style,
		});
		settle();

		const hydratedTextarea = container.querySelector('textarea') as HTMLTextAreaElement;
		expect(errors).not.toHaveBeenCalled();
		expect(hydratedTextarea).toBe(serverTextarea);
		expect(heights).toEqual([[72, 20]]);
		expect(hydratedTextarea.style.height).toBe('72px');

		hydratedTextarea.value = 'one\ntwo\nthree';
		hydratedTextarea.dispatchEvent(new InputEvent('input', { bubbles: true }));
		expect(hydratedTextarea.style.height).toBe('92px');
		expect(heights).toEqual([
			[72, 20],
			[92, 20],
		]);
		expect(changes).toEqual(['one\ntwo\nthree']);

		root.unmount();
		errors.mockRestore();
		container.remove();
	});
});
