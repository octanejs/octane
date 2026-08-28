// @vitest-environment node

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { useStateManager as useReactStateManager } from 'react-select';
import { renderToString } from 'octane/server';
import { describe, expect, it } from 'vitest';

import { StateManagerFixture } from './browser/state-manager-fixture.tsrx';
import { useStateManager } from '../src/index';

type Option = { label: string; value: string };

function ReactFixture(props: Record<string, unknown>) {
	const result = useReactStateManager<Option, false, never, Record<string, unknown>>(
		props as never,
	);
	return React.createElement('output', {
		'data-input-value': result.inputValue,
		'data-menu-is-open': String(result.menuIsOpen),
		'data-value': JSON.stringify(result.value),
	});
}

describe('useStateManager SSR parity', () => {
	it.each([
		{
			defaultInputValue: 'initial',
			defaultMenuIsOpen: true,
			defaultValue: { label: 'Default', value: 'default' },
		},
		{
			defaultInputValue: 'ignored',
			defaultMenuIsOpen: true,
			defaultValue: { label: 'Ignored', value: 'ignored' },
			inputValue: 'controlled',
			menuIsOpen: false,
			value: { label: 'Controlled', value: 'controlled' },
		},
	])('matches React controlled/default precedence for %#', (managerProps) => {
		const react = renderToStaticMarkup(React.createElement(ReactFixture, managerProps));
		let rootExportResult: ReturnType<typeof useStateManager<Option, false>> | undefined;
		const octane = renderToString(StateManagerFixture, {
			managerProps,
			bind(result) {
				rootExportResult = result;
			},
		});
		expect(octane.html).toBe(react);
		expect(rootExportResult?.inputValue).toBe(
			managerProps.inputValue ?? managerProps.defaultInputValue,
		);
	});
});
