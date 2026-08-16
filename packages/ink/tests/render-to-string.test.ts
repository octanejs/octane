import type { UniversalComponent } from 'octane/universal/native';
import { describe, expect, it } from 'vitest';
import { renderToString } from '../src/index.js';
import { BasicFixture, type BasicFixtureProps } from './_fixtures/basic.ink.tsrx';

const Fixture = BasicFixture as UniversalComponent<BasicFixtureProps>;

describe('renderToString', () => {
	it('renders styled text and Yoga layout from a compiled Ink component', () => {
		const output = renderToString(Fixture, { name: 'Octane' }, { columns: 20 });

		expect(output).toContain('[Hello Octane]');
		expect(output).toContain('second\nline');
	});

	it('uses the requested virtual terminal width', () => {
		const output = renderToString(Fixture, { name: 'a very long terminal label' }, { columns: 12 });

		expect(output.split('\n').length).toBeGreaterThan(2);
	});
});
