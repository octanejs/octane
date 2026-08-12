import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushEffects, mount } from '../../octane/tests/_helpers';
import TextareaAutosize from '../src/index.tsrx';

const baseStyle = {
	boxSizing: 'border-box',
	borderTopWidth: '1px',
	borderBottomWidth: '1px',
	paddingTop: '4px',
	paddingBottom: '4px',
	fontSize: '16px',
	lineHeight: '20px',
	width: '120px',
} as const;

const fontListeners = new Set<EventListenerOrEventListenerObject>();

beforeAll(() => {
	Object.defineProperty(document, 'fonts', {
		configurable: true,
		value: {
			addEventListener(type: string, listener: EventListenerOrEventListenerObject) {
				if (type === 'loadingdone') fontListeners.add(listener);
			},
			removeEventListener(type: string, listener: EventListenerOrEventListenerObject) {
				if (type === 'loadingdone') fontListeners.delete(listener);
			},
		},
	});
});

beforeEach(() => {
	Object.defineProperty(HTMLTextAreaElement.prototype, 'scrollHeight', {
		configurable: true,
		get() {
			const textarea = this as HTMLTextAreaElement;
			const value = textarea.value || textarea.placeholder || 'x';
			const rows = value
				.split('\n')
				.reduce((total, line) => total + Math.max(1, Math.ceil(line.length / 10)), 0);
			return rows * 20 + 8;
		},
	});
	fontListeners.clear();
	vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
		callback(0);
		return 1;
	});
});

afterEach(() => {
	vi.unstubAllGlobals();
	document.body.replaceChildren();
});

function settle(): void {
	flushEffects();
}

function input(node: HTMLTextAreaElement, value: string): void {
	node.value = value;
	node.dispatchEvent(new InputEvent('input', { bubbles: true, data: value }));
}

describe('@octanejs/textarea-autosize behavior', () => {
	it('renders the pristine empty textarea contract and measures the initial row', () => {
		const heights: Array<[number, number]> = [];
		const app = mount(TextareaAutosize, {
			style: baseStyle,
			onHeightChange: (height, meta) => heights.push([height, meta.rowHeight]),
		});
		settle();

		const textarea = app.find('textarea') as HTMLTextAreaElement;
		expect(textarea.outerHTML).toContain('<textarea');
		expect(textarea.style.getPropertyValue('height')).toBe('30px');
		expect(textarea.style.getPropertyPriority('height')).toBe('important');
		expect(heights).toEqual([[30, 20]]);

		app.unmount();
	});

	it('resizes an uncontrolled textarea before forwarding input and change callbacks', () => {
		const calls: string[] = [];
		const app = mount(TextareaAutosize, {
			defaultValue: 'one',
			style: baseStyle,
			onHeightChange: (height) => calls.push(`height:${height}`),
			onInput: () => calls.push('input'),
			onChange: () => calls.push('change'),
		});
		settle();
		calls.length = 0;

		const textarea = app.find('textarea') as HTMLTextAreaElement;
		input(textarea, 'one\ntwo\nthree');

		expect(textarea.style.getPropertyValue('height')).toBe('70px');
		expect(calls).toEqual(['input', 'height:70', 'change']);

		app.unmount();
	});

	it('does not resize a controlled textarea from the input event', () => {
		const heights: number[] = [];
		const changes: string[] = [];
		const app = mount(TextareaAutosize, {
			value: 'one',
			style: baseStyle,
			onHeightChange: (height) => heights.push(height),
			onChange: (event) => changes.push(event.currentTarget.value),
		});
		settle();

		const textarea = app.find('textarea') as HTMLTextAreaElement;
		input(textarea, 'one\ntwo\nthree');

		expect(heights).toEqual([30]);
		expect(textarea.style.getPropertyValue('height')).toBe('30px');
		expect(changes).toEqual(['one\ntwo\nthree']);

		app.update(TextareaAutosize, {
			value: 'one\ntwo\nthree',
			style: baseStyle,
			onHeightChange: (height) => heights.push(height),
			onChange: (event) => changes.push(event.currentTarget.value),
		});
		settle();
		expect(textarea.style.getPropertyValue('height')).toBe('70px');
		expect(heights).toEqual([30, 70]);

		app.unmount();
	});

	it('honors minRows and maxRows using the measured row height', () => {
		const minimum = mount(TextareaAutosize, { minRows: 3, style: baseStyle });
		settle();
		expect((minimum.find('textarea') as HTMLTextAreaElement).style.height).toBe('70px');
		minimum.unmount();

		const maximum = mount(TextareaAutosize, {
			defaultValue: '1\n2\n3\n4\n5',
			maxRows: 2,
			style: baseStyle,
		});
		settle();
		expect((maximum.find('textarea') as HTMLTextAreaElement).style.height).toBe('50px');
		maximum.unmount();
	});

	it('composes callback and object refs and clears them on unmount', () => {
		const callbackValues: Array<HTMLTextAreaElement | null> = [];
		const objectRef = { current: null as HTMLTextAreaElement | null };
		const callbackApp = mount(TextareaAutosize, {
			ref: (node) => callbackValues.push(node),
			style: baseStyle,
		});
		settle();
		expect(callbackValues.at(-1)).toBe(callbackApp.find('textarea'));
		callbackApp.unmount();
		expect(callbackValues.at(-1)).toBeNull();

		const objectApp = mount(TextareaAutosize, { ref: objectRef, style: baseStyle });
		settle();
		expect(objectRef.current).toBe(objectApp.find('textarea'));
		objectApp.unmount();
		expect(objectRef.current).toBeNull();
	});

	it('detaches a replaced callback ref before attaching the replacement', () => {
		const first: Array<HTMLTextAreaElement | null> = [];
		const second: Array<HTMLTextAreaElement | null> = [];
		const app = mount(TextareaAutosize, {
			ref: (node) => first.push(node),
			style: baseStyle,
		});
		settle();
		const textarea = app.find('textarea');

		app.update(TextareaAutosize, {
			ref: (node) => second.push(node),
			style: baseStyle,
		});
		settle();

		expect(first).toEqual([textarea, null]);
		expect(second).toEqual([textarea]);
		app.unmount();
		expect(second.at(-1)).toBeNull();
	});

	it('keeps a stable callback ref attached across ordinary rerenders', () => {
		const values: Array<HTMLTextAreaElement | null> = [];
		const ref = (node: HTMLTextAreaElement | null) => values.push(node);
		const app = mount(TextareaAutosize, {
			ref,
			placeholder: 'before',
			style: baseStyle,
		});
		settle();
		const textarea = app.find('textarea');

		app.update(TextareaAutosize, {
			ref,
			placeholder: 'after',
			style: baseStyle,
		});
		settle();

		expect(values).toEqual([textarea]);
		app.unmount();
		expect(values).toEqual([textarea, null]);
	});

	it('reuses sizing data only when cacheMeasurements is enabled', () => {
		const computedStyle = vi.spyOn(window, 'getComputedStyle');
		const cached = mount(TextareaAutosize, {
			cacheMeasurements: true,
			defaultValue: 'one',
			style: baseStyle,
		});
		settle();
		const cachedCalls = computedStyle.mock.calls.length;
		window.dispatchEvent(new UIEvent('resize'));
		expect(computedStyle.mock.calls.length).toBe(cachedCalls);
		cached.unmount();

		computedStyle.mockClear();
		const uncached = mount(TextareaAutosize, {
			cacheMeasurements: false,
			defaultValue: 'one',
			style: baseStyle,
		});
		settle();
		const uncachedCalls = computedStyle.mock.calls.length;
		window.dispatchEvent(new UIEvent('resize'));
		expect(computedStyle.mock.calls.length).toBeGreaterThan(uncachedCalls);
		uncached.unmount();
		computedStyle.mockRestore();
	});

	it('does not leak the shared measurement textarea between differently styled instances', () => {
		Object.defineProperty(HTMLTextAreaElement.prototype, 'scrollHeight', {
			configurable: true,
			get() {
				const textarea = this as HTMLTextAreaElement;
				const lineHeight = Number.parseFloat(textarea.style.lineHeight || '20');
				return lineHeight + 8;
			},
		});
		const small = mount(TextareaAutosize, {
			style: { ...baseStyle, lineHeight: '18px' },
		});
		settle();
		const large = mount(TextareaAutosize, {
			style: { ...baseStyle, lineHeight: '34px' },
		});
		settle();

		expect((small.find('textarea') as HTMLTextAreaElement).style.height).toBe('28px');
		expect((large.find('textarea') as HTMLTextAreaElement).style.height).toBe('44px');
		window.dispatchEvent(new UIEvent('resize'));
		expect((small.find('textarea') as HTMLTextAreaElement).style.height).toBe('28px');
		expect((large.find('textarea') as HTMLTextAreaElement).style.height).toBe('44px');

		small.unmount();
		large.unmount();
	});

	it('forwards accessibility and native textarea state without leaking binding props', () => {
		const app = mount(TextareaAutosize, {
			'aria-describedby': 'message-help',
			'aria-invalid': true,
			disabled: true,
			maxRows: 5,
			minRows: 2,
			readOnly: true,
			required: true,
			style: baseStyle,
		});
		settle();
		const textarea = app.find('textarea') as HTMLTextAreaElement;

		expect(textarea.getAttribute('aria-describedby')).toBe('message-help');
		expect(textarea.getAttribute('aria-invalid')).toBe('true');
		expect(textarea.disabled).toBe(true);
		expect(textarea.readOnly).toBe(true);
		expect(textarea.required).toBe(true);
		expect(textarea.hasAttribute('minRows')).toBe(false);
		expect(textarea.hasAttribute('maxRows')).toBe(false);
		app.unmount();
	});

	it('rejects minHeight and maxHeight style ownership in development', () => {
		expect(() =>
			mount(TextareaAutosize, { style: { ...baseStyle, minHeight: 20 } as any }),
		).toThrow('Using `style.minHeight`');
		expect(() =>
			mount(TextareaAutosize, { style: { ...baseStyle, maxHeight: 80 } as any }),
		).toThrow('Using `style.maxHeight`');
	});

	it('responds to window resize and font loading, then removes both listeners', () => {
		const addEventListener = vi.spyOn(window, 'addEventListener');
		const removeEventListener = vi.spyOn(window, 'removeEventListener');
		const heights: number[] = [];
		const app = mount(TextareaAutosize, {
			defaultValue: 'one',
			style: baseStyle,
			onHeightChange: (height) => heights.push(height),
		});
		settle();
		expect(fontListeners.size).toBe(1);
		const resizeListener = addEventListener.mock.calls.find(([type]) => type === 'resize')?.[1];
		expect(resizeListener).toBeDefined();

		const textarea = app.find('textarea') as HTMLTextAreaElement;
		textarea.value = 'one\ntwo';
		window.dispatchEvent(new UIEvent('resize'));
		expect(heights).toEqual([30, 50]);

		textarea.value = 'one\ntwo\nthree';
		for (const listener of fontListeners) {
			if (typeof listener === 'function') listener(new Event('loadingdone'));
			else listener.handleEvent(new Event('loadingdone'));
		}
		expect(heights).toEqual([30, 50, 70]);

		app.unmount();
		expect(fontListeners.size).toBe(0);
		expect(removeEventListener).toHaveBeenCalledWith('resize', resizeListener);
	});

	// @parity-case runtime:behavior:stop-propagation
	it.each(['onInput', 'onChangeCapture'] as const)(
		'continues same-target autosize and change callbacks when %s stops propagation',
		(stoppingCallback) => {
			const calls: string[] = [];
			const app = mount(TextareaAutosize, {
				defaultValue: 'one',
				style: baseStyle,
				onHeightChange: (height) => calls.push(`height:${height}`),
				onChange: () => calls.push('change'),
				[stoppingCallback]: (event: Event) => {
					calls.push(stoppingCallback);
					event.stopPropagation();
				},
			});
			settle();
			calls.length = 0;

			const textarea = app.find('textarea') as HTMLTextAreaElement;
			input(textarea, 'one\ntwo');

			expect(textarea.style.height).toBe('50px');
			expect(calls).toContain('height:50');
			expect(calls.at(-1)).toBe('change');
			app.unmount();
		},
	);

	it('remeasures an uncontrolled textarea after its owning form resets', () => {
		let resetFrame: FrameRequestCallback | undefined;
		vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
			resetFrame = callback;
			return 1;
		});
		const app = mount(TextareaAutosize, {
			defaultValue: 'one',
			form: 'autosize-form',
			style: baseStyle,
		});
		settle();
		const form = document.createElement('form');
		form.id = 'autosize-form';
		document.body.appendChild(form);
		const textarea = app.find('textarea') as HTMLTextAreaElement;
		input(textarea, 'one\ntwo\nthree');
		expect(textarea.style.height).toBe('70px');

		form.dispatchEvent(new Event('reset', { bubbles: true }));
		textarea.value = textarea.defaultValue;
		resetFrame?.(0);
		expect(textarea.style.height).toBe('30px');

		app.unmount();
	});
});
