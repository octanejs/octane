import { createElement } from 'react';
import {
	cleanup as cleanupReact,
	fireEvent as reactFireEvent,
	render as renderReact,
} from '@testing-library/react';
import {
	cleanup as cleanupOctane,
	fireEvent as octaneFireEvent,
	render as renderOctane,
} from '@octanejs/testing-library';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useDropzone as useReactDropzone } from 'react-dropzone';
import { StateProbe } from '../probes/dropzone.tsrx';

function ReactProbe({ options = {}, rootProps = {}, inputProps = {} }: any) {
	const state = useReactDropzone(options);
	return createElement(
		'div',
		{ ...state.getRootProps({ 'data-probe': 'root', ...rootProps }) },
		createElement('input', { ...state.getInputProps({ 'data-probe': 'input', ...inputProps }) }),
		createElement('output', null, `${state.isFocused}|${state.isFileDialogActive}`),
	);
}

afterEach(() => {
	cleanupOctane();
	cleanupReact();
});

describe('react-dropzone U3 React/Octane differential', () => {
	// @parity-case differential:root-getters
	it('matches default and overridden getter attributes', () => {
		const options = { multiple: false };
		const rootProps = { role: 'button', tabIndex: 3, title: 'pick files' };
		const inputProps = { name: 'attachment', required: true };
		const octane = renderOctane(StateProbe, { props: { options, rootProps, inputProps } });
		const react = renderReact(createElement(ReactProbe, { options, rootProps, inputProps }));
		for (const selector of ['[data-probe=root]', 'input']) {
			const left = octane.container.querySelector(selector)!;
			const right = react.container.querySelector(selector)!;
			for (const name of [
				'role',
				'tabindex',
				'title',
				'type',
				'multiple',
				'name',
				'required',
				'aria-label',
			]) {
				expect(left.getAttribute(name), `${selector} ${name}`).toBe(right.getAttribute(name));
			}
		}
	});

	// @parity-case differential:root-interaction
	it('matches click, keyboard, focus, and blur callbacks', async () => {
		const onFileDialogOpenOctane = vi.fn();
		const onFileDialogOpenReact = vi.fn();
		const octane = renderOctane(StateProbe, {
			props: { options: { onFileDialogOpen: onFileDialogOpenOctane } },
		});
		const react = renderReact(
			createElement(ReactProbe, { options: { onFileDialogOpen: onFileDialogOpenReact } }),
		);
		const octaneRoot = octane.container.querySelector<HTMLElement>('[data-probe=root]')!;
		const reactRoot = react.container.querySelector<HTMLElement>('[data-probe=root]')!;
		octaneFireEvent.focus(octaneRoot);
		reactFireEvent.focus(reactRoot);
		await vi.waitFor(() =>
			expect(react.container.querySelector('output')?.textContent).toBe('true|false'),
		);
		expect(
			octane.container.querySelector('output')?.textContent?.split('|').slice(0, 2).join('|'),
		).toBe('true|false');
		octaneFireEvent.blur(octaneRoot);
		reactFireEvent.blur(reactRoot);
		await vi.waitFor(() =>
			expect(react.container.querySelector('output')?.textContent).toBe('false|false'),
		);
		expect(
			octane.container.querySelector('output')?.textContent?.split('|').slice(0, 2).join('|'),
		).toBe('false|false');
		octaneFireEvent.keyDown(octaneRoot, { key: 'Enter' });
		reactFireEvent.keyDown(reactRoot, { key: 'Enter' });
		expect(onFileDialogOpenOctane.mock.calls.length).toBe(onFileDialogOpenReact.mock.calls.length);
		octaneFireEvent.click(octaneRoot);
		reactFireEvent.click(reactRoot);
		expect(onFileDialogOpenOctane.mock.calls.length).toBe(onFileDialogOpenReact.mock.calls.length);
	});

	// @parity-case differential:root-selection
	it('matches native input selection state and callback payloads', async () => {
		const octaneCalls: string[] = [];
		const reactCalls: string[] = [];
		const octane = renderOctane(StateProbe, {
			props: {
				options: {
					onDrop: (files: File[]) => octaneCalls.push(files.map((file) => file.name).join(',')),
				},
			},
		});
		const react = renderReact(
			createElement(ReactProbe, {
				options: {
					onDrop: (files: File[]) => reactCalls.push(files.map((file) => file.name).join(',')),
				},
			}),
		);
		const file = new File(['same'], 'same.txt', { type: 'text/plain' });
		octaneFireEvent.change(octane.container.querySelector('input')!, { target: { files: [file] } });
		reactFireEvent.change(react.container.querySelector('input')!, { target: { files: [file] } });
		await vi.waitFor(() => expect(octaneCalls).toEqual(['same.txt']));
		await vi.waitFor(() => expect(reactCalls).toEqual(['same.txt']));
	});
});
