import { describe, expect, it } from 'vitest';
import { renderToString } from 'octane/server';

import { HydrationInput } from '../hydration/_fixture.tsrx';

describe('@octanejs/input-otp SSR', () => {
	it('renders deterministic single-input markup without browser globals', () => {
		const first = renderToString(HydrationInput).html;
		const second = renderToString(HydrationInput).html;
		expect(first).toBe(second);
		expect(first.match(/data-input-otp=""/g)).toHaveLength(1);
		expect(first).toContain('autoComplete="one-time-code"');
		expect(first).toContain('value="12"');
		expect(first).toContain('translate="no"');
		expect(first).toContain('spellCheck');
		expect(first).toContain('Hydrated verification code');
	});
});
