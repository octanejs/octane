import assert from 'node:assert/strict';
import { test } from 'vitest';

import { jsx } from '@emotion/react';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import Select from 'react-select';

import {
	CONTROL_COMPONENT_PROP_KEYS,
	assertComponentContract,
	resolveSelectStyle,
} from './select-style-contract.mjs';
import { createStyleCache } from './style-adapter.mjs';

const OPTIONS = [{ label: 'One', value: 'one' }];
const CONTROL_STATE = {
	control: true,
	'control--is-disabled': false,
	'control--menu-is-open': true,
};

function renderControlOracle(selectProps = {}) {
	let captured;
	function Capture(props) {
		captured = props;
		assertComponentContract(props, CONTROL_COMPONENT_PROP_KEYS);
		return jsx('div', {
			id: 'captured-control',
			css: props.getStyles('control', props),
			className: props.cx(CONTROL_STATE, props.getClassNames('control', props), props.className),
			children: 'control',
		});
	}

	const html = renderToStaticMarkup(
		React.createElement(Select, {
			options: OPTIONS,
			menuIsOpen: true,
			classNamePrefix: 'probe',
			components: { Control: Capture },
			...selectProps,
		}),
	);
	assert.ok(captured);
	const classMatch = html.match(/<div id="captured-control" class="([^"]+)"/);
	const styleMatches = [...html.matchAll(/<style data-emotion="([^"]+)">([\s\S]*?)<\/style>/g)];
	const controlStyle = styleMatches.find((match) =>
		match[1].split(' ').some((name) => classMatch?.[1].includes(`css-${name}`)),
	);
	assert.ok(classMatch, html);
	assert.ok(controlStyle, html);
	return {
		captured,
		className: classMatch[1],
		dataEmotion: controlStyle[1],
		rules: controlStyle[2],
	};
}

for (const entry of [
	{ name: 'defaults', props: {} },
	{
		name: 'styles and classNames callbacks',
		props: {
			styles: {
				control: (base) => ({ ...base, borderColor: 'tomato', '&:focus-within': { opacity: 0.8 } }),
			},
			classNames: { control: () => 'consumer-control' },
		},
	},
	{
		name: 'unstyled with a consumer style',
		props: {
			unstyled: true,
			styles: { control: (base) => ({ ...base, outlineColor: 'royalblue' }) },
		},
	},
]) {
	test(`matches the pinned React Select control pipeline for ${entry.name}`, () => {
		const oracle = renderControlOracle(entry.props);
		const candidate = resolveSelectStyle(
			createStyleCache({ key: 'css' }),
			oracle.captured,
			'control',
			CONTROL_STATE,
		);

		assert.equal(candidate.className.trim(), oracle.className);
		assert.equal(candidate.dataEmotion, oracle.dataEmotion);
		assert.equal(candidate.rules, oracle.rules);
		assert.match(candidate.className, /probe__control/);
		assert.match(candidate.className, /probe__control--menu-is-open/);
		if (entry.name.includes('classNames')) assert.match(candidate.className, /consumer-control/);
		if (entry.name.includes('unstyled')) {
			assert.doesNotMatch(candidate.rules, /background-color/);
			assert.match(candidate.rules, /outline-color:royalblue/);
		}
	});
}
