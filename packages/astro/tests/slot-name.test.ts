import { describe, it, expect } from 'vitest';
import { slotName } from '../src/slot-name.js';

describe('slotName', () => {
	it('camelCases kebab-case Astro slot names', () => {
		expect(slotName('footer-note')).toBe('footerNote');
		expect(slotName('social-links')).toBe('socialLinks');
	});

	it('camelCases snake_case Astro slot names', () => {
		expect(slotName('social_links')).toBe('socialLinks');
	});

	it('leaves already-camelCase names unchanged', () => {
		expect(slotName('socialLinks')).toBe('socialLinks');
		expect(slotName('footerNote')).toBe('footerNote');
	});

	it('trims surrounding whitespace', () => {
		expect(slotName('  footer-note  ')).toBe('footerNote');
	});
});
