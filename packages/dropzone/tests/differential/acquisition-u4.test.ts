import { createElement } from 'react';
import {
	cleanup as cleanupReact,
	fireEvent as fireReact,
	render as renderReact,
} from '@testing-library/react';
import {
	cleanup as cleanupOctane,
	fireEvent as fireOctane,
	render as renderOctane,
} from '@octanejs/testing-library';
import { afterEach, describe, expect, it } from 'vitest';
import { useDropzone as useReactDropzone } from 'react-dropzone';
import { AcquisitionProbe } from '../probes/dropzone.tsrx';

function ReactProbe({ options }: any) {
	const state = useReactDropzone(options);
	return createElement(
		'div',
		state.getRootProps({ 'data-probe': 'root' }),
		createElement('input', state.getInputProps()),
		createElement(
			'output',
			null,
			JSON.stringify({
				accepted: state.acceptedFiles.map((file) => file.name),
				rejected: state.fileRejections.map(({ file, errors }) => ({
					name: file.name,
					codes: errors.map((error) => error.code),
				})),
			}),
		),
	);
}
const transfer = (files: File[]) => ({
	dataTransfer: {
		files,
		items: files.map((file) => ({ kind: 'file', type: file.type, getAsFile: () => file })),
		types: ['Files'],
	},
});
const result = (container: HTMLElement) =>
	JSON.parse(container.querySelector('output')!.textContent!);
const acquisition = (container: HTMLElement) => {
	const value = result(container);
	return {
		accepted: value.accepted,
		rejected: value.rejected.map(({ name, codes }: any) => ({ name, codes })),
	};
};

afterEach(() => {
	cleanupOctane();
	cleanupReact();
});

describe('react-dropzone U4 React/Octane differential', () => {
	// @parity-case differential:acquisition-selection
	it('matches accepted/rejected callback payloads for input selection', async () => {
		const options = { accept: { 'image/png': ['.png'] }, multiple: true };
		const octane = renderOctane(AcquisitionProbe, { props: { options } });
		const react = renderReact(createElement(ReactProbe, { options }));
		const files = [
			new File(['x'], 'yes.png', { type: 'image/png' }),
			new File(['x'], 'no.txt', { type: 'text/plain' }),
		];
		fireOctane.change(octane.container.querySelector('input')!, { target: { files } });
		fireReact.change(react.container.querySelector('input')!, { target: { files } });
		await expect.poll(() => result(octane.container).accepted.length).toBe(1);
		await expect.poll(() => result(react.container).accepted.length).toBe(1);
		expect(acquisition(octane.container)).toEqual(acquisition(react.container));
	});

	// @parity-case differential:acquisition-max-files
	it('matches drag/drop max-files validation', async () => {
		const options = { maxFiles: 1, multiple: true };
		const octane = renderOctane(AcquisitionProbe, { props: { options } });
		const react = renderReact(createElement(ReactProbe, { options }));
		const files = [new File(['x'], 'first.txt'), new File(['x'], 'second.txt')];
		fireOctane.drop(octane.container.querySelector('[data-probe=root]')!, transfer(files));
		fireReact.drop(react.container.querySelector('[data-probe=root]')!, transfer(files));
		await expect.poll(() => result(octane.container).rejected.length).toBe(1);
		await expect.poll(() => result(react.container).rejected.length).toBe(1);
		expect(acquisition(octane.container)).toEqual(acquisition(react.container));
	});
});
