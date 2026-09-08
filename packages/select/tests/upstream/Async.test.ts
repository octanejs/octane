// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, waitFor } from '@octanejs/testing-library';
import { afterEach, expect, vi } from 'vitest';

import Async from '../../src/async.tsrx';
import { inputFor, OPTIONS, optionTexts, type Option, upstreamTest } from './helpers';

afterEach(cleanup);

upstreamTest('defaults - snapshot', function snapshotsDefaults() {
	const result = render(Async);
	expect(result.container).toMatchSnapshot();
});

upstreamTest(
	'load option prop with defaultOptions true with callback  > should resolve options',
	async function resolvesCallbackDefaults() {
		const loadOptions = vi.fn(function loadOptions(
			_inputValue: string,
			callback: (options: readonly Option[]) => void,
		) {
			callback([OPTIONS[0]]);
		});
		const result = render(Async, {
			props: {
				classNamePrefix: 'react-select',
				defaultOptions: true,
				loadOptions,
				menuIsOpen: true,
			} as never,
		});
		await waitFor(function hasOption() {
			expect(optionTexts(result.container)).toHaveLength(1);
		});
	},
);

upstreamTest(
	'load option prop with defaultOptions true with promise  > should resolve options',
	async function resolvesPromiseDefaults() {
		function loadOptions(): Promise<readonly Option[]> {
			return Promise.resolve([OPTIONS[0]]);
		}
		const result = render(Async, {
			props: {
				classNamePrefix: 'react-select',
				defaultOptions: true,
				loadOptions,
				menuIsOpen: true,
			} as never,
		});
		await waitFor(function hasOption() {
			expect(optionTexts(result.container)).toHaveLength(1);
		});
	},
);

upstreamTest(
	'load options prop with defaultOptions true and inputValue prop',
	function loadsControlledInputValue() {
		const loadOptions = vi.fn(function loadOptions(value: string) {
			return value;
		});
		render(Async, {
			props: {
				defaultOptions: true,
				inputValue: 'hello world',
				loadOptions,
			} as never,
		});
		expect(loadOptions).toHaveReturnedWith('hello world');
	},
);

upstreamTest(
	'load options props with no default options with callback > should resolve the options',
	async function resolvesCallbackOptions() {
		function loadOptions(
			_inputValue: string,
			callback: (options: readonly Option[]) => void,
		): void {
			callback(OPTIONS);
		}
		const result = render(Async, {
			props: { classNamePrefix: 'react-select', loadOptions } as never,
		});
		fireEvent.input(inputFor(result.container), { target: { value: 'a' } });
		await waitFor(function hasOptions() {
			expect(optionTexts(result.container)).toHaveLength(17);
		});
	},
);

upstreamTest(
	'load options props with no default options with promise > should resolve the options',
	async function resolvesPromiseOptions() {
		function loadOptions(): Promise<readonly Option[]> {
			return Promise.resolve(OPTIONS);
		}
		const result = render(Async, {
			props: { classNamePrefix: 'react-select', loadOptions } as never,
		});
		fireEvent.input(inputFor(result.container), { target: { value: 'a' } });
		await waitFor(function hasOptions() {
			expect(optionTexts(result.container)).toHaveLength(17);
		});
	},
);

upstreamTest(
	'to not call loadOptions again for same value when cacheOptions is true',
	function reusesCachedOptions() {
		const loadOptions = vi.fn(function loadOptions(
			_inputValue: string,
			callback: (options: readonly Option[]) => void,
		) {
			callback([]);
		});
		const result = render(Async, {
			props: { cacheOptions: true, classNamePrefix: 'react-select', loadOptions } as never,
		});
		const input = inputFor(result.container);
		fireEvent.input(input, { target: { value: 'foo' } });
		fireEvent.input(input, { target: { value: 'bar' } });
		fireEvent.input(input, { target: { value: 'foo' } });
		expect(loadOptions).toHaveBeenCalledTimes(2);
	},
);

upstreamTest('to create new cache for each instance', function createsPerInstanceCache() {
	const loadOptionsOne = vi.fn();
	const first = render(Async, {
		props: {
			cacheOptions: true,
			classNamePrefix: 'react-select',
			loadOptions: loadOptionsOne,
			menuIsOpen: true,
		} as never,
	});
	fireEvent.input(inputFor(first.container), { target: { value: 'a' } });

	const loadOptionsTwo = vi.fn();
	const second = render(Async, {
		props: {
			cacheOptions: true,
			classNamePrefix: 'react-select',
			loadOptions: loadOptionsTwo,
			menuIsOpen: true,
		} as never,
	});
	fireEvent.input(inputFor(second.container), { target: { value: 'a' } });

	expect(loadOptionsOne).toHaveBeenCalled();
	expect(loadOptionsTwo).toHaveBeenCalled();
});

upstreamTest(
	'in case of callbacks display the most recently-requested loaded options (if results are returned out of order)',
	function keepsMostRecentRequest() {
		const callbacks: Array<(options: readonly Option[]) => void> = [];
		function loadOptions(
			_inputValue: string,
			callback: (options: readonly Option[]) => void,
		): void {
			callbacks.push(callback);
		}
		const result = render(Async, {
			props: { classNamePrefix: 'react-select', loadOptions } as never,
		});
		const input = inputFor(result.container);
		fireEvent.input(input, { target: { value: 'foo' } });
		fireEvent.input(input, { target: { value: 'bar' } });
		expect(optionTexts(result.container)).toEqual([]);
		act(function resolveLatest() {
			callbacks[1]([{ value: 'bar', label: 'bar' }]);
		});
		act(function resolveEarlier() {
			callbacks[0]([{ value: 'foo', label: 'foo' }]);
		});
		expect(optionTexts(result.container)).toEqual(['bar']);
	},
);
