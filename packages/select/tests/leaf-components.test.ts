// @vitest-environment node

import React from 'react';
import { renderToStaticMarkup as renderReact } from 'react-dom/server';
import { components as upstreamComponents } from 'react-select';
import { renderToString } from 'octane/server';
import { describe, expect, it } from 'vitest';
import { Window } from 'happy-dom';

import { defaultStyles as upstreamDefaultStyles } from '../upstream/src/styles';
import { defaultComponents, MenuPortal } from '../src/components.tsrx';
import { components } from '../src/index';
import { defaultTheme } from '../src/theme';
import { classNames } from '../src/utils';
import { LeafFixture, type LeafFixtureProps, type LeafKind } from './leaf-fixture.tsrx';

const cases: Array<{ kind: LeafKind; component: keyof typeof upstreamComponents }> = [
	{ kind: 'clearIndicator', component: 'ClearIndicator' },
	{ kind: 'control', component: 'Control' },
	{ kind: 'cross', component: 'CrossIcon' },
	{ kind: 'down', component: 'DownChevron' },
	{ kind: 'dropdownIndicator', component: 'DropdownIndicator' },
	{ kind: 'group', component: 'Group' },
	{ kind: 'groupHeading', component: 'GroupHeading' },
	{ kind: 'indicatorSeparator', component: 'IndicatorSeparator' },
	{ kind: 'indicators', component: 'IndicatorsContainer' },
	{ kind: 'input', component: 'Input' },
	{ kind: 'loadingMessage', component: 'LoadingMessage' },
	{ kind: 'loadingIndicator', component: 'LoadingIndicator' },
	{ kind: 'menu', component: 'Menu' },
	{ kind: 'menuList', component: 'MenuList' },
	{ kind: 'multiValue', component: 'MultiValue' },
	{ kind: 'multiValueContainer', component: 'MultiValueContainer' },
	{ kind: 'multiValueRemove', component: 'MultiValueRemove' },
	{ kind: 'noOptionsMessage', component: 'NoOptionsMessage' },
	{ kind: 'option', component: 'Option' },
	{ kind: 'placeholder', component: 'Placeholder' },
	{ kind: 'selectContainer', component: 'SelectContainer' },
	{ kind: 'singleValue', component: 'SingleValue' },
	{ kind: 'valueContainer', component: 'ValueContainer' },
];

function reactProps(props: LeafFixtureProps) {
	const common = {
		className: 'consumer-slot',
		cx: (state: Record<string, boolean>, ...names: (string | undefined)[]) =>
			classNames('probe', state, ...(names.filter(Boolean) as string[])),
		getClassNames: (name: string) => `custom-${name}`,
		getStyles: (name: keyof typeof upstreamDefaultStyles, componentProps: unknown) =>
			(upstreamDefaultStyles[name] as (value: unknown, unstyled: boolean) => unknown)(
				componentProps,
				props.unstyled ?? false,
			),
		getValue: () => [],
		hasValue: props.hasValue ?? true,
		isMulti: props.multi ?? true,
		isRtl: props.rtl ?? false,
		options: [],
		selectProps: { controlShouldRenderValue: true },
		theme: defaultTheme,
		clearValue() {},
		selectOption() {},
		setValue() {},
	};
	const disabled = props.disabled ?? false;
	const focused = props.focused ?? true;
	switch (props.kind) {
		case 'clearIndicator':
		case 'dropdownIndicator':
			return {
				...common,
				innerProps: {
					id: props.kind === 'clearIndicator' ? 'clear' : 'dropdown',
					'data-inner': 'yes',
				},
				isDisabled: disabled,
				isFocused: focused,
			};
		case 'indicatorSeparator':
			return {
				...common,
				innerProps: { id: 'separator', 'data-inner': 'yes' },
				isDisabled: disabled,
				isFocused: focused,
			};
		case 'groupHeading':
			return {
				...common,
				id: 'heading',
				data: { label: 'Group', options: [] },
				'data-inner': 'yes',
				children: 'Group label',
			};
		case 'group':
			return {
				...common,
				Heading: upstreamComponents.GroupHeading,
				headingProps: { id: 'heading', data: { label: 'Group', options: [] } },
				innerProps: { id: 'group', 'data-inner': 'yes' },
				label: 'Group label',
				data: { label: 'Group', options: [] },
				options: [],
				children: 'Group child',
			};
		case 'multiValueContainer':
			return {
				data: { label: 'One', value: '1' },
				innerProps: { id: 'multi-generic', 'data-inner': 'yes' },
				selectProps: common.selectProps,
				children: 'One',
			};
		case 'multiValueRemove':
			return {
				data: { label: 'One', value: '1' },
				innerProps: { id: 'multi-remove', 'data-inner': 'yes' },
				selectProps: common.selectProps,
			};
		case 'multiValue':
			return {
				...common,
				components: {
					Container: upstreamComponents.MultiValueContainer,
					Label: upstreamComponents.MultiValueLabel,
					Remove: upstreamComponents.MultiValueRemove,
				},
				data: { label: 'One', value: '1' },
				innerProps: { id: 'multi', 'data-inner': 'yes' },
				isFocused: focused,
				isDisabled: disabled,
				removeProps: { id: 'remove', 'data-remove': 'yes' },
				index: 0,
				children: 'One',
			};
		case 'input':
			return {
				...common,
				innerRef: null,
				isDisabled: disabled,
				isHidden: !focused,
				inputClassName: 'consumer-input',
				id: 'input',
				name: 'choice',
				'aria-label': 'Choice',
				readOnly: true,
				value: 'typed',
			};
		case 'menu':
			return {
				...common,
				innerRef: null,
				innerProps: { id: 'menu', 'data-inner': 'yes' },
				isLoading: false,
				placement: 'bottom',
				minMenuHeight: 140,
				maxMenuHeight: 300,
				menuPlacement: 'bottom',
				menuPosition: 'absolute',
				menuShouldScrollIntoView: true,
				children: 'Menu child',
			};
		case 'menuList':
			return {
				...common,
				innerRef: null,
				innerProps: { id: 'menu-list', 'data-inner': 'yes' },
				maxHeight: 300,
				focusedOption: { label: 'One', value: '1' },
				children: 'List child',
			};
		case 'noOptionsMessage':
		case 'loadingMessage':
			return {
				...common,
				innerProps: {
					id: props.kind === 'noOptionsMessage' ? 'no-options' : 'loading',
					'data-inner': 'yes',
				},
			};
		case 'loadingIndicator':
			return {
				...common,
				innerProps: { id: 'loading-indicator', 'data-inner': 'yes' },
				isDisabled: disabled,
				isFocused: focused,
				size: 4,
			};
		case 'cross':
			return { size: 14, 'data-probe': 'cross' };
		case 'down':
			return { 'data-probe': 'down' };
		case 'control':
			return {
				...common,
				innerRef: null,
				innerProps: { id: 'control', 'data-inner': 'yes' },
				isDisabled: disabled,
				isFocused: focused,
				menuIsOpen: true,
				children: 'Control child',
			};
		case 'selectContainer':
			return {
				...common,
				innerProps: { id: 'container', 'data-inner': 'yes' },
				isDisabled: disabled,
				isFocused: focused,
				children: 'Container child',
			};
		case 'valueContainer':
			return {
				...common,
				innerProps: { id: 'value', 'data-inner': 'yes' },
				isDisabled: disabled,
				children: 'Value child',
			};
		case 'indicators':
			return {
				...common,
				innerProps: { id: 'indicators', 'data-inner': 'yes' },
				isDisabled: disabled,
				children: 'Indicators child',
			};
		case 'placeholder':
			return {
				...common,
				innerProps: { id: 'placeholder', 'data-inner': 'yes' },
				isDisabled: disabled,
				isFocused: focused,
				children: 'Choose one',
			};
		case 'singleValue':
			return {
				...common,
				data: { label: 'One', value: '1' },
				innerProps: { id: 'single', 'data-inner': 'yes' },
				isDisabled: disabled,
				children: 'One',
			};
		default:
			return {
				...common,
				data: { label: 'One', value: '1' },
				innerRef: null,
				innerProps: { id: 'option', role: 'option', 'data-inner': 'yes' },
				label: 'One',
				type: 'option',
				isDisabled: disabled,
				isFocused: focused,
				isSelected: props.selected ?? false,
				children: 'One',
			};
	}
}

function stripStyleTags(html: string) {
	return html.replace(/<style data-emotion="[^"]+">[^<]*<\/style>/g, '');
}

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

function canonicalMarkup(html: string) {
	const window = new Window();
	window.document.body.innerHTML = html
		.replace(/<!--\[-->|<!--\]-->/g, '')
		.replace(/\bcss-[A-Za-z0-9_-]+/g, 'css-HASH');
	for (const element of window.document.body.querySelectorAll('*')) {
		const attributes = [...element.attributes]
			.map((attribute) => [attribute.name, attribute.value] as const)
			.sort(([a], [b]) => a.localeCompare(b));
		for (const attribute of [...element.attributes]) element.removeAttribute(attribute.name);
		for (const [name, value] of attributes) {
			element.setAttribute(name, name === 'style' ? value.replace(/;+$/, '') : value);
		}
	}
	return window.document.body.innerHTML;
}

describe('first default component unit', () => {
	it('publishes the exact upstream component registry through the root entry point', () => {
		expect(Object.keys(components)).toEqual(Object.keys(upstreamComponents));
	});

	it('uses registry identities by default and applies one consumer override', () => {
		expect(defaultComponents({ components: {} })).toEqual(components);
		const override = (() => null) as typeof components.Control;
		const resolved = defaultComponents({ components: { Control: override } });
		expect(resolved.Control).toBe(override);
		expect(resolved.Option).toBe(components.Option);
	});

	it('preserves explicit null overrides for nullable slots', () => {
		const resolved = defaultComponents({
			components: { DropdownIndicator: null, IndicatorSeparator: null },
		});
		expect(resolved.DropdownIndicator).toBeNull();
		expect(resolved.IndicatorSeparator).toBeNull();
	});

	it('renders no MenuPortal markup during SSR without a control element', () => {
		const common = reactProps({ kind: 'menu' }) as Record<string, unknown>;
		const rendered = renderToString(MenuPortal, {
			...common,
			appendTo: undefined,
			controlElement: null,
			innerProps: { id: 'menu-portal' },
			menuPlacement: 'bottom',
			menuPosition: 'fixed',
			children: 'Portal child',
		});
		expect(rendered.html).toBe('');
		expect(rendered.css).toBe('');
	});

	it.each(cases)('matches $kind styled SSR markup and CSS', ({ kind, component }) => {
		const props = { kind } satisfies LeafFixtureProps;
		const ReactComponent = upstreamComponents[component] as React.ComponentType<
			Record<string, unknown>
		>;
		const react = renderReact(React.createElement(ReactComponent, reactProps(props)));
		const octane = renderToString(LeafFixture, props);
		expect(canonicalMarkup(octane.html)).toBe(canonicalMarkup(stripStyleTags(react)));
		expect(canonicalCSS(octaneCSS(octane.css))).toBe(canonicalCSS(emotionCSS(react)));
	});

	it.each(['control', 'option', 'singleValue', 'valueContainer'] as const)(
		'matches %s unstyled and alternate state markup/CSS',
		(kind) => {
			const props: LeafFixtureProps = {
				kind,
				unstyled: true,
				disabled: true,
				focused: false,
				selected: true,
				rtl: true,
			};
			const component = cases.find((item) => item.kind === kind)!.component;
			const ReactComponent = upstreamComponents[component] as React.ComponentType<
				Record<string, unknown>
			>;
			const react = renderReact(React.createElement(ReactComponent, reactProps(props)));
			const octane = renderToString(LeafFixture, props);
			expect(canonicalMarkup(octane.html)).toBe(canonicalMarkup(stripStyleTags(react)));
			expect(canonicalCSS(octaneCSS(octane.css))).toBe(canonicalCSS(emotionCSS(react)));
		},
	);
});
