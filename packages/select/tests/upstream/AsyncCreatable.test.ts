// @vitest-environment jsdom

import { cleanup, fireEvent, render, waitFor } from '@octanejs/testing-library';
import { afterEach, expect, vi } from 'vitest';

import AsyncCreatable from '../../src/async-creatable.tsrx';
import { inputFor, OPTIONS, optionTexts, type Option, upstreamTest } from './helpers';

afterEach(cleanup);

upstreamTest('defaults - snapshot', function snapshotsDefaults() {
	const result = render(AsyncCreatable);
	expect(result.container).toMatchSnapshot();
});

upstreamTest('creates an inner Select', function createsInnerSelect() {
	const result = render(AsyncCreatable, {
		props: { className: 'react-select', classNamePrefix: 'react-select' } as never,
	});
	expect(result.container.querySelector('.react-select')).toBeTruthy();
});

upstreamTest('render decorated select with props passed', function rendersDecoratedSelect() {
	const result = render(AsyncCreatable, {
		props: { className: 'foo', classNamePrefix: 'foo' } as never,
	});
	expect(result.container.querySelector('.foo')).toBeTruthy();
});

upstreamTest('to show the create option in menu', function showsCreateOption() {
	const result = render(AsyncCreatable, {
		props: { className: 'react-select', classNamePrefix: 'react-select' } as never,
	});
	result.rerender({
		props: {
			className: 'react-select',
			classNamePrefix: 'react-select',
			inputValue: 'a',
		} as never,
	});
	fireEvent.input(inputFor(result.container), { target: { value: 'a' } });
	expect(optionTexts(result.container)).toEqual(['Create "a"']);
});

upstreamTest(
	'to show loading and then create option in menu',
	async function showsLoadingThenCreate() {
		const loadOptions = vi.fn(function loadOptions(
			_inputValue: string,
			callback: (options: readonly Option[]) => void,
		) {
			setTimeout(function resolveOptions() {
				callback(OPTIONS);
			}, 20);
		});
		const result = render(AsyncCreatable, {
			props: {
				className: 'react-select',
				classNamePrefix: 'react-select',
				loadOptions,
			} as never,
		});

		fireEvent.input(inputFor(result.container), { target: { value: 'a' } });
		expect(result.container.querySelector('.react-select__menu')?.textContent).toBe('Loading...');

		await waitFor(function loadedCreateOption() {
			const options = optionTexts(result.container);
			expect(options.at(-1)).toBe('Create "a"');
		});
	},
);
