// @vitest-environment node

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { useCreatable as useReactCreatable } from 'react-select/creatable';
import { renderToString } from 'octane/server';
import { describe, expect, it, vi } from 'vitest';

import {
	CreatableFixture,
	type CreatableOption,
	type CreatableResult,
} from './creatable-fixture.tsrx';

function ReactFixture(props: {
	bind: (result: CreatableResult) => void;
	creatableProps: CreatableResult;
}) {
	const result = useReactCreatable<CreatableOption, false, never>(props.creatableProps as never);
	props.bind(result as CreatableResult);
	return React.createElement('output', { 'data-options': JSON.stringify(result.options) });
}

function renderPair(overrides: Partial<CreatableResult> = {}) {
	const reactChange = vi.fn();
	const octaneChange = vi.fn();
	const base = {
		inputValue: 'New choice',
		isLoading: false,
		isMulti: false as const,
		options: [{ label: 'Existing', value: 'existing' }],
		value: null,
	};
	let react!: CreatableResult;
	let octane!: CreatableResult;
	const reactProps = { ...base, ...overrides, onChange: reactChange } as CreatableResult;
	const octaneProps = { ...base, ...overrides, onChange: octaneChange } as CreatableResult;
	const reactHTML = renderToStaticMarkup(
		React.createElement(ReactFixture, {
			bind: (result) => (react = result),
			creatableProps: reactProps,
		}),
	);
	const octaneHTML = renderToString(CreatableFixture, {
		bind: (result) => (octane = result),
		creatableProps: octaneProps,
	}).html;
	return { octane, octaneChange, octaneHTML, react, reactChange, reactHTML };
}

describe('useCreatable parity', () => {
	it.each(['first', 'last'] as const)('matches React new-option placement: %s', (position) => {
		const pair = renderPair({ createOptionPosition: position });
		expect(pair.octaneHTML).toBe(pair.reactHTML);
		expect(pair.octane.options).toEqual(pair.react.options);
		expect(pair.octane.options?.find((option) => (option as CreatableOption).__isNew__)).toEqual({
			label: 'Create "New choice"',
			value: 'New choice',
			__isNew__: true,
		});
	});

	it.each([{ inputValue: '' }, { inputValue: 'existing' }, { isLoading: true }])(
		'matches React suppression for %#',
		(overrides) => {
			const pair = renderPair(overrides);
			expect(pair.octaneHTML).toBe(pair.reactHTML);
			expect(pair.octane.options).toEqual(pair.react.options);
		},
	);

	it('matches React create-option value and action metadata', () => {
		const pair = renderPair({ name: 'choice' });
		const reactNew = pair.react.options?.at(-1) as CreatableOption;
		const octaneNew = pair.octane.options?.at(-1) as CreatableOption;
		pair.react.onChange?.(reactNew, { action: 'select-option', option: reactNew });
		pair.octane.onChange?.(octaneNew, { action: 'select-option', option: octaneNew });
		expect(pair.octaneChange.mock.calls).toEqual(pair.reactChange.mock.calls);
		expect(pair.octaneChange).toHaveBeenCalledWith(
			{ label: 'New choice', value: 'New choice', __isNew__: true },
			{
				action: 'create-option',
				name: 'choice',
				option: { label: 'New choice', value: 'New choice', __isNew__: true },
			},
		);
	});

	it('matches React delegated onCreateOption and ordinary changes', () => {
		const reactCreate = vi.fn();
		const octaneCreate = vi.fn();
		const reactPair = renderPair({ onCreateOption: reactCreate });
		const octanePair = renderPair({ onCreateOption: octaneCreate });
		const reactNew = reactPair.react.options?.at(-1) as CreatableOption;
		const octaneNew = octanePair.octane.options?.at(-1) as CreatableOption;
		reactPair.react.onChange?.(reactNew, { action: 'select-option', option: reactNew });
		octanePair.octane.onChange?.(octaneNew, { action: 'select-option', option: octaneNew });
		expect(octaneCreate.mock.calls).toEqual(reactCreate.mock.calls);

		const existing = { label: 'Existing', value: 'existing' };
		reactPair.react.onChange?.(existing, { action: 'select-option', option: existing });
		octanePair.octane.onChange?.(existing, { action: 'select-option', option: existing });
		expect(octanePair.octaneChange.mock.calls).toEqual(reactPair.reactChange.mock.calls);
	});
});
