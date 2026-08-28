// @vitest-environment node

import upstreamMakeAnimated, * as upstreamAnimated from 'react-select/animated';
import { renderToString } from 'octane/server';
import { describe, expect, it } from 'vitest';

import { needsInspectableValueChildren } from '../src/animated-registry.ts';
import makeAnimated, * as animated from '../src/animated/index';
import {
	AnimatedInputFixture,
	AnimatedSingleSelectFixture,
	CollapseFixture,
	FadeFixture,
	FadeInnerPropsFixture,
	readCapturedInputProps,
} from './animated-fixture.tsrx';

describe('animated entry point parity', () => {
	it('matches the complete public export surface', () => {
		expect(Object.keys(animated).sort()).toEqual(Object.keys(upstreamAnimated).sort());
	});

	it('marks animated ValueContainer for inspectable children', () => {
		const components = makeAnimated();
		expect(needsInspectableValueChildren(components.ValueContainer)).toBe(true);
	});

	it('matches upstream memoization and custom-component precedence', () => {
		const customInput = () => null;
		const overrides = { Input: customInput } as never;
		const first = makeAnimated(overrides);
		const second = makeAnimated(overrides);
		const upstreamFirst = upstreamMakeAnimated(overrides);
		const upstreamSecond = upstreamMakeAnimated(overrides);

		expect(first).toBe(second);
		expect(upstreamFirst).toBe(upstreamSecond);
		expect(Object.keys(first).sort()).toEqual(Object.keys(upstreamFirst).sort());
		expect(first.Input).not.toBe(customInput);
	});

	it('strips transition-only props before forwarding Input props', () => {
		const result = renderToString(AnimatedInputFixture);
		expect(result.html).toContain('data-consumer="preserved"');
		expect(readCapturedInputProps()).toMatchObject({ consumer: 'preserved' });
		expect(readCapturedInputProps()).not.toHaveProperty('in');
		expect(readCapturedInputProps()).not.toHaveProperty('onExited');
		expect(readCapturedInputProps()).not.toHaveProperty('appear');
		expect(readCapturedInputProps()).not.toHaveProperty('enter');
		expect(readCapturedInputProps()).not.toHaveProperty('exit');
	});

	it('renders both the selected value and input in an animated single select', () => {
		const html = renderToString(AnimatedSingleSelectFixture).html;
		expect(html).toContain('Selected option');
		expect(html).toContain('id="animated-single-input"');
	});

	it('renders entered fade and collapse server states without leaking transition props', () => {
		const fade = renderToString(FadeFixture).html;
		const collapse = renderToString(CollapseFixture).html;
		expect(fade).toContain('opacity:1');
		expect(fade).toContain('transition:opacity 25ms');
		expect(fade).toContain('fade-consumer');
		expect(collapse).toContain('overflow:hidden');
		expect(collapse).toContain('white-space:nowrap');
		expect(collapse).toContain('collapse');
	});

	it('merges wrapped innerProps instead of replacing them during fade', () => {
		const html = renderToString(FadeInnerPropsFixture).html;
		expect(html).toContain('id="fade-placeholder-id"');
		expect(html).toContain('opacity:1');
		expect(html).toContain('color:red');
	});
});
