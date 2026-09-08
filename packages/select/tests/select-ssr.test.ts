// @vitest-environment node

import React from 'react';
import ReactSelect from 'react-select';
import ReactAsyncSelect from 'react-select/async';
import ReactAsyncCreatableSelect from 'react-select/async-creatable';
import ReactCreatableSelect from 'react-select/creatable';
import { renderToStaticMarkup } from 'react-dom/server';
import { Window } from 'happy-dom';
import { renderToString } from 'octane/server';
import { describe, expect, it } from 'vitest';

import { SelectFixture, type SelectOption } from './select-fixture.tsrx';
import AsyncSelect from '../src/async.tsrx';
import AsyncCreatableSelect from '../src/async-creatable.tsrx';
import CreatableSelect from '../src/creatable.tsrx';

function emotionCSS(html: string) {
	return [...html.matchAll(/<style data-emotion="[^"]+">([^<]*)<\/style>/g)]
		.map((match) => match[1])
		.join('');
}

function octaneCSS(css: string) {
	return [...css.matchAll(/<style data-octane="[^"]+"[^>]*>([^<]*)<\/style>/g)]
		.map((match) => match[1])
		.join('');
}

function canonicalCSS(css: string) {
	return css
		.replace(/\.css-[A-Za-z0-9_-]+/g, '.css-HASH')
		.replace(/animation-[A-Za-z0-9_-]+/g, 'animation-HASH');
}

function canonicalMarkup(html: string, removeLiveRegion = false) {
	const window = new Window();
	window.document.body.innerHTML = html
		.replace(/<style data-emotion="[^"]+">[^<]*<\/style>/g, '')
		.replace(/<!--\[-->|<!--\]-->/g, '')
		.replace(/\bcss-[A-Za-z0-9_-]+/g, 'css-HASH')
		.replace(/react-select-\d+/g, 'react-select-ID');
	if (removeLiveRegion) {
		for (const element of window.document.body.querySelectorAll(
			'[role="log"], [id$="-live-region"]',
		)) {
			element.remove();
		}
	}
	for (const element of window.document.body.querySelectorAll('*')) {
		const attributes = [...element.attributes]
			.map((attribute) => [attribute.name.toLowerCase(), attribute.value] as const)
			.sort(([a], [b]) => a.localeCompare(b));
		for (const attribute of [...element.attributes]) element.removeAttribute(attribute.name);
		for (const [name, value] of attributes) {
			element.setAttribute(name, name === 'style' ? value.replace(/;+$/, '') : value);
		}
	}
	return window.document.body.innerHTML;
}

describe('Select SSR parity', () => {
	it.each([
		{
			name: 'empty closed',
			props: { options: [{ label: 'One', value: '1' }] },
		},
		{
			name: 'selected single value and hidden form field',
			props: {
				defaultValue: { label: 'One', value: '1' },
				name: 'choice',
				options: [{ label: 'One', value: '1' }],
			},
		},
		{
			name: 'selected multi values',
			props: {
				defaultValue: [
					{ label: 'One', value: '1' },
					{ label: 'Two', value: '2' },
				],
				isMulti: true,
				name: 'choice',
				options: [
					{ label: 'One', value: '1' },
					{ label: 'Two', value: '2' },
				],
			},
		},
		{
			name: 'open flat options',
			props: {
				defaultMenuIsOpen: true,
				options: [
					{ label: 'One', value: '1' },
					{ label: 'Two', value: '2', disabled: true },
				],
				isOptionDisabled: (option: SelectOption) => Boolean(option.disabled),
			},
		},
		{
			name: 'open grouped options',
			props: {
				defaultMenuIsOpen: true,
				options: [
					{
						label: 'Group A',
						options: [
							{ label: 'One', value: '1' },
							{ label: 'Two', value: '2' },
						],
					},
				],
			},
		},
		{
			name: 'open loading notice',
			props: { defaultMenuIsOpen: true, isLoading: true, options: [] },
		},
		{
			name: 'open no-options notice',
			props: { defaultMenuIsOpen: true, options: [] },
		},
		{
			name: 'null no-options notice',
			props: { defaultMenuIsOpen: true, noOptionsMessage: () => null, options: [] },
		},
		{
			name: 'null loading notice',
			props: {
				defaultMenuIsOpen: true,
				isLoading: true,
				loadingMessage: () => null,
				options: [],
			},
		},
		{
			name: 'non-searchable dummy input',
			props: { isSearchable: false, options: [{ label: 'One', value: '1' }] },
		},
		{
			name: 'empty required field',
			props: { name: 'choice', required: true, options: [{ label: 'One', value: '1' }] },
		},
	] as Array<{ name: string; props: Record<string, unknown> }>)(
		'matches pinned $name SSR',
		({ props }) => {
			const react = renderToStaticMarkup(
				React.createElement(ReactSelect<SelectOption>, props as never),
			);
			const octane = renderToString(SelectFixture, props as never);
			expect(canonicalMarkup(octane.html)).toBe(canonicalMarkup(react));
			expect(canonicalCSS(octaneCSS(octane.css))).toBe(canonicalCSS(emotionCSS(react)));
		},
	);
});

describe('composed Select entry-point SSR parity', () => {
	it.each([
		{
			name: 'async',
			ReactComponent: ReactAsyncSelect,
			OctaneComponent: AsyncSelect,
			props: {
				defaultMenuIsOpen: true,
				defaultOptions: [{ label: 'Async one', value: 'async-1' }],
			},
		},
		{
			name: 'creatable',
			ReactComponent: ReactCreatableSelect,
			OctaneComponent: CreatableSelect,
			props: {
				defaultInputValue: 'New choice',
				defaultMenuIsOpen: true,
				options: [{ label: 'Existing', value: 'existing' }],
			},
		},
		{
			name: 'async-creatable',
			ReactComponent: ReactAsyncCreatableSelect,
			OctaneComponent: AsyncCreatableSelect,
			props: {
				defaultInputValue: 'New choice',
				defaultMenuIsOpen: true,
				defaultOptions: [{ label: 'Existing', value: 'existing' }],
			},
		},
	])('matches the pinned $name default wrapper', ({ ReactComponent, OctaneComponent, props }) => {
		const react = renderToStaticMarkup(
			React.createElement(
				ReactComponent<SelectOption> as React.ComponentType<Record<string, unknown>>,
				props,
			),
		);
		const octane = renderToString(OctaneComponent as never, props as never);
		expect(canonicalMarkup(octane.html)).toBe(canonicalMarkup(react));
		expect(canonicalCSS(octaneCSS(octane.css))).toBe(canonicalCSS(emotionCSS(react)));
	});
});
