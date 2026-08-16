import { describe, expect, it } from 'vitest';
import { renderToString } from '../src/index.js';
import { OmittedHookOptionsFixture } from './_fixtures/omitted-hook-options.ink.tsrx';

describe('hooks with optional trailing options', () => {
	it('renders compiled calls with omitted options', () => {
		expect(renderToString(OmittedHookOptionsFixture, {})).toBe('hooks mounted');
	});
});
