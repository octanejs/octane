import { describe, expect, it } from 'vitest';

import {
	formatGroupLabel as upstreamFormatGroupLabel,
	getOptionLabel as upstreamGetOptionLabel,
	getOptionValue as upstreamGetOptionValue,
	isOptionDisabled as upstreamIsOptionDisabled,
} from '../upstream/src/builtins';
import { defaultStyles as upstreamDefaultStyles } from '../upstream/src/styles';
import {
	formatGroupLabel,
	getOptionLabel,
	getOptionValue,
	isOptionDisabled,
} from '../src/builtins';
import { defaultStyles } from '../src/default-styles';
import { defaultTheme } from '../src/theme';

const styleProps = {
	theme: defaultTheme,
	isDisabled: false,
	isFocused: true,
	isSelected: false,
	isRtl: false,
	isMulti: true,
	hasValue: true,
	value: 'needle',
	size: 4,
	placement: 'bottom' as const,
	maxHeight: 320,
	offset: 48,
	position: 'absolute' as const,
	rect: { left: 12, width: 240 },
	cropWithEllipsis: true,
	selectProps: { controlShouldRenderValue: true },
};

type Style = (props: typeof styleProps, unstyled: boolean) => unknown;

describe('pinned default style registry', () => {
	it('has the exact 22-key upstream registry', () => {
		expect(Object.keys(defaultStyles)).toEqual(Object.keys(upstreamDefaultStyles));
	});

	it.each(Object.keys(defaultStyles))('matches %s in styled and unstyled modes', (key) => {
		const local = defaultStyles[key as keyof typeof defaultStyles] as Style;
		const upstream = upstreamDefaultStyles[key as keyof typeof upstreamDefaultStyles] as Style;
		expect(local(styleProps, false)).toEqual(upstream(styleProps, false));
		expect(local(styleProps, true)).toEqual(upstream(styleProps, true));
	});

	it('matches state-sensitive branches', () => {
		const states = [
			{ isDisabled: true, isFocused: false, isSelected: false, isRtl: true },
			{ isDisabled: false, isFocused: false, isSelected: true, isRtl: false },
		];
		for (const state of states) {
			const props = { ...styleProps, ...state };
			for (const key of Object.keys(defaultStyles)) {
				const local = defaultStyles[key as keyof typeof defaultStyles] as Style;
				const upstream = upstreamDefaultStyles[key as keyof typeof upstreamDefaultStyles] as Style;
				expect(local(props, false), key).toEqual(upstream(props, false));
			}
		}
	});
});

describe('pinned built-ins', () => {
	it('matches labels, values, group labels, and disabled coercion', () => {
		const option = { label: 'One', value: '1', isDisabled: 'yes' };
		const group = { label: 'Group', options: [option] };
		expect(formatGroupLabel(group)).toBe(upstreamFormatGroupLabel(group));
		expect(getOptionLabel(option)).toBe(upstreamGetOptionLabel(option));
		expect(getOptionValue(option)).toBe(upstreamGetOptionValue(option));
		expect(isOptionDisabled(option)).toBe(upstreamIsOptionDisabled(option));
	});
});
