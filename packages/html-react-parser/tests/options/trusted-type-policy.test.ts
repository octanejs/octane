import htmlToDOM from 'html-dom-parser';
import { describe, expect, it, vi } from 'vitest';

import parse from '../../src/index';

vi.mock('html-dom-parser', function mockParser() {
	return {
		default: vi.fn(function parseDom() {
			return [];
		}),
	};
});

describe('trustedTypePolicy option', function trustedTypePolicySuite() {
	it('passes trustedTypePolicy to html-dom-parser', function passesPolicy() {
		const trustedTypePolicy = {
			createHTML: vi.fn(function createHTML(input: string) {
				return input;
			}),
		};

		parse('<div>test</div>', { trustedTypePolicy });

		expect(htmlToDOM).toHaveBeenCalledWith(
			'<div>test</div>',
			expect.objectContaining({
				lowerCaseAttributeNames: false,
				trustedTypePolicy,
			}),
		);
	});
});
