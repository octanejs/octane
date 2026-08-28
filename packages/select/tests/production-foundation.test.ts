import { describe, expect, it } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import Select from 'react-select';
import {
	createFilter as reactCreateFilter,
	defaultTheme as reactDefaultTheme,
	mergeStyles as reactMergeStyles,
} from 'react-select';

import { createFilter, defaultTheme, mergeStyles } from '../src/index';
import { classNames, cleanValue, handleInputChange } from '../src/utils';

describe('React Select production foundation', () => {
	it('matches the pinned class prefix/state/list composition', () => {
		let upstreamCx: ((state: Record<string, boolean>, ...names: string[]) => string) | undefined;
		function Capture(props: any) {
			upstreamCx = props.cx;
			return React.createElement('div');
		}
		renderToStaticMarkup(
			React.createElement(Select, {
				options: [],
				classNamePrefix: 'probe',
				components: { Control: Capture },
			}),
		);
		const state = { control: true, 'control--focused': true, disabled: false };
		expect(classNames('probe', state, ' consumer ', undefined)).toBe(
			upstreamCx!(state, ' consumer ', undefined as any),
		);
	});

	it('normalizes scalar, array, null, and falsey option values', () => {
		const option = { value: 'one' };
		expect(cleanValue(option)).toEqual([option]);
		expect(cleanValue([option, null as any, undefined as any])).toEqual([option]);
		expect(cleanValue(null)).toEqual([]);
	});

	it('preserves or replaces input values according to the callback result', () => {
		const meta = { action: 'input-change' as const, prevInputValue: 'old' };
		expect(handleInputChange('next', meta)).toBe('next');
		expect(handleInputChange('next', meta, () => undefined)).toBe('next');
		expect(
			handleInputChange('next', meta, (value, received) => {
				expect(received).toBe(meta);
				return value.toUpperCase();
			}),
		).toBe('NEXT');
	});

	it.each([
		['defaults are case/accent insensitive and trim input', undefined, '  ele  '],
		['start matching', { matchFrom: 'start' as const }, 'ele'],
		['case sensitive', { ignoreCase: false }, 'Élé'],
		['accent sensitive', { ignoreAccents: false }, 'Ele'],
		['untrimmed', { trim: false }, ' Élé '],
		['custom stringify', { stringify: (option: any) => option.data.search }, 'needle'],
	] as const)('matches createFilter: %s', (_name, config, input) => {
		const option = {
			label: 'Éléphant Łódź',
			value: 'animal-one',
			data: { search: 'custom needle value' },
		};
		expect(createFilter(config as any)(option, input)).toBe(
			reactCreateFilter(config as any)(option, input),
		);
	});

	it('always includes the upstream creatable sentinel', () => {
		const option = { label: '', value: '', data: { __isNew__: true } };
		expect(createFilter()(option, 'does-not-match')).toBe(true);
		expect(createFilter()(option, 'does-not-match')).toBe(
			reactCreateFilter()(option, 'does-not-match'),
		);
	});

	it('matches the pinned default theme exactly', () => {
		expect(defaultTheme).toEqual(reactDefaultTheme);
	});

	it('matches source-only and target-only merge behavior', () => {
		const source = { control: (base: object) => ({ ...base, source: true }) };
		const target = { option: (base: object) => ({ ...base, target: true }) };
		const react = reactMergeStyles(source, target);
		const octane = mergeStyles(source, target);

		expect(Object.keys(octane)).toEqual(Object.keys(react));
		expect(octane.control?.({ seed: true }, {})).toEqual(react.control?.({ seed: true }, {}));
		expect(octane.option?.({ seed: true }, {})).toEqual(react.option?.({ seed: true }, {}));
	});

	it('matches overlapping merge order and callback props identity', () => {
		const calls: string[] = [];
		const props = { marker: Symbol('props') };
		const source = {
			control: (base: object, received: unknown) => {
				expect(received).toBe(props);
				calls.push('source');
				return { ...base, source: true };
			},
		};
		const target = {
			control: (base: object, received: unknown) => {
				expect(received).toBe(props);
				calls.push('target');
				return { ...base, target: true };
			},
		};
		const octane = mergeStyles(source, target);

		expect(octane.control?.({ seed: true }, props)).toEqual({
			seed: true,
			source: true,
			target: true,
		});
		expect(calls).toEqual(['source', 'target']);
	});
});
