import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushEffects, mount } from '../../../octane/tests/_helpers';
import OctaneTextareaAutosize from '../../src/index.tsrx';
import ReactTextareaAutosize from '../../upstream/src/index.tsx';

const style = {
	boxSizing: 'border-box' as const,
	borderTopWidth: '1px',
	borderBottomWidth: '1px',
	paddingTop: '4px',
	paddingBottom: '4px',
	fontSize: '16px',
	lineHeight: '20px',
	width: '120px',
};

let reactRoot: Root | undefined;
let reactHost: HTMLDivElement | undefined;

beforeAll(() => {
	(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
	Object.defineProperty(document, 'fonts', {
		configurable: true,
		value: { addEventListener() {}, removeEventListener() {} },
	});
	Object.defineProperty(HTMLTextAreaElement.prototype, 'scrollHeight', {
		configurable: true,
		get() {
			const textarea = this as HTMLTextAreaElement;
			const value = textarea.value || textarea.placeholder || 'x';
			const rows = value
				.split('\n')
				.reduce(
					(total: number, line: string) => total + Math.max(1, Math.ceil(line.length / 10)),
					0,
				);
			return rows * 20 + 8;
		},
	});
});

beforeEach(() => {
	vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
		callback(0);
		return 1;
	});
});

afterEach(async () => {
	if (reactRoot) await act(() => reactRoot?.unmount());
	reactRoot = undefined;
	reactHost = undefined;
	vi.unstubAllGlobals();
	document.body.replaceChildren();
});

async function renderReact(props: Record<string, unknown>): Promise<HTMLTextAreaElement> {
	reactHost = document.createElement('div');
	document.body.appendChild(reactHost);
	reactRoot = createRoot(reactHost);
	await act(() => reactRoot?.render(createElement(ReactTextareaAutosize, props)));
	return reactHost.querySelector('textarea')!;
}

function renderOctane(props: Record<string, unknown>) {
	const app = mount(OctaneTextareaAutosize, props);
	flushEffects();
	return { app, textarea: app.find('textarea') as HTMLTextAreaElement };
}

async function dispatchInput(node: HTMLTextAreaElement, value: string): Promise<void> {
	const nativeSetter = Object.getOwnPropertyDescriptor(
		HTMLTextAreaElement.prototype,
		'value',
	)!.set!;
	nativeSetter.call(node, value);
	await act(() => node.dispatchEvent(new InputEvent('input', { bubbles: true, data: value })));
}

describe('textarea-autosize pristine differential', () => {
	// @parity-case differential:initial
	it('matches initial measurement, row metadata, attributes, and important height', async () => {
		const reactHeights: Array<[number, number]> = [];
		const octaneHeights: Array<[number, number]> = [];
		const react = await renderReact({
			'aria-label': 'message',
			minRows: 2,
			placeholder: 'hello',
			style,
			onHeightChange: (height: number, meta: { rowHeight: number }) =>
				reactHeights.push([height, meta.rowHeight]),
		});
		const octane = renderOctane({
			'aria-label': 'message',
			minRows: 2,
			placeholder: 'hello',
			style,
			onHeightChange: (height: number, meta: { rowHeight: number }) =>
				octaneHeights.push([height, meta.rowHeight]),
		});

		expect(octane.textarea.getAttribute('aria-label')).toBe(react.getAttribute('aria-label'));
		expect(octane.textarea.placeholder).toBe(react.placeholder);
		expect(octane.textarea.style.height).toBe(react.style.height);
		expect(octane.textarea.style.getPropertyPriority('height')).toBe(
			react.style.getPropertyPriority('height'),
		);
		expect(octaneHeights).toEqual(reactHeights);

		octane.app.unmount();
	});

	// @parity-case differential:input
	it('matches uncontrolled input sizing and callback ordering', async () => {
		const reactCalls: string[] = [];
		const octaneCalls: string[] = [];
		const reactEvents: Array<Record<string, unknown>> = [];
		const octaneEvents: Array<Record<string, unknown>> = [];
		function pushReactHeight(height: number) {
			reactCalls.push(`height:${height}`);
		}
		function pushOctaneHeight(height: number) {
			octaneCalls.push(`height:${height}`);
		}
		function pushReactInput() {
			reactCalls.push('input');
		}
		function pushOctaneInput() {
			octaneCalls.push('input');
		}
		function onReactChange(event: Event & { nativeEvent?: Event }) {
			reactCalls.push('change');
			const currentTarget = event.currentTarget as HTMLTextAreaElement | null;
			reactEvents.push({
				constructorName: event.constructor.name,
				isInputEvent: event instanceof InputEvent,
				hasNativeEvent: event.nativeEvent instanceof Event,
				currentTargetTag: currentTarget?.tagName,
				value: currentTarget?.value,
			});
		}
		function onOctaneChange(event: Event) {
			octaneCalls.push('change');
			const currentTarget = event.currentTarget as HTMLTextAreaElement | null;
			octaneEvents.push({
				constructorName: event.constructor.name,
				isInputEvent: event instanceof InputEvent,
				hasNativeEvent: 'nativeEvent' in event,
				currentTargetTag: currentTarget?.tagName,
				value: currentTarget?.value,
			});
		}
		const react = await renderReact({
			defaultValue: 'one',
			style,
			onHeightChange: pushReactHeight,
			onInput: pushReactInput,
			onChange: onReactChange,
		});
		const octane = renderOctane({
			defaultValue: 'one',
			style,
			onHeightChange: pushOctaneHeight,
			onInput: pushOctaneInput,
			onChange: onOctaneChange,
		});
		reactCalls.length = 0;
		octaneCalls.length = 0;

		const nativeSetter = Object.getOwnPropertyDescriptor(
			HTMLTextAreaElement.prototype,
			'value',
		)!.set!;
		nativeSetter.call(react, 'assigned-without-dispatch');
		nativeSetter.call(octane.textarea, 'assigned-without-dispatch');
		await act(function flushReact() {
			return undefined;
		});
		flushEffects();
		expect(reactCalls).toEqual([]);
		expect(octaneCalls).toEqual([]);
		expect(reactEvents).toEqual([]);
		expect(octaneEvents).toEqual([]);

		await dispatchInput(react, 'one\ntwo\nthree');
		await dispatchInput(octane.textarea, 'one\ntwo\nthree');

		expect(octane.textarea.style.height).toBe(react.style.height);
		expect(octaneCalls).toEqual(reactCalls);
		expect(reactEvents[0]?.isInputEvent).toBe(false);
		expect(reactEvents[0]?.hasNativeEvent).toBe(true);
		expect(reactEvents[0]?.currentTargetTag).toBe('TEXTAREA');
		expect(reactEvents[0]?.value).toBe('one\ntwo\nthree');
		expect(octaneEvents).toEqual([
			{
				constructorName: 'InputEvent',
				isInputEvent: true,
				hasNativeEvent: false,
				currentTargetTag: 'TEXTAREA',
				value: 'one\ntwo\nthree',
			},
		]);

		octane.app.unmount();
	});

	// @parity-case differential:stop-propagation-input
	it('matches same-target callbacks when onInput stops propagation', async () => {
		await expectStopPropagationParity('onInput');
	});

	// @parity-case differential:stop-propagation-capture
	it('matches same-target callbacks when onChangeCapture stops propagation', async () => {
		await expectStopPropagationParity('onChangeCapture');
	});
});

async function expectStopPropagationParity(
	stoppingCallback: 'onInput' | 'onChangeCapture',
): Promise<void> {
	const reactCalls: string[] = [];
	const octaneCalls: string[] = [];
	function props(calls: string[]) {
		return {
			defaultValue: 'one',
			style,
			onHeightChange: function onHeightChange(height: number) {
				calls.push(`height:${height}`);
			},
			onChange: function onChange() {
				calls.push('change');
			},
			[stoppingCallback]: function stopPropagation(event: Event) {
				calls.push(stoppingCallback);
				event.stopPropagation();
			},
		};
	}
	const react = await renderReact(props(reactCalls));
	const octane = renderOctane(props(octaneCalls));
	reactCalls.length = 0;
	octaneCalls.length = 0;

	await dispatchInput(react, 'one\ntwo');
	await dispatchInput(octane.textarea, 'one\ntwo');

	expect(octane.textarea.style.height).toBe(react.style.height);
	expect(octaneCalls).toEqual(reactCalls);
	octane.app.unmount();
}
