import React from 'react';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { render as reactEmailRender } from '@react-email/render';
import { loadReactFixture, normaliseEmailParityHtml } from './_helpers.ts';
import { render as octaneRender } from '../../src/render.ts';
import { ParityEmail, TextMarginsEmail } from '../_fixtures/parity-email.tsrx';

const fixture = resolve(import.meta.dirname, '../_fixtures/parity-email.tsrx');
const cache = resolve(import.meta.dirname, '.react-cache');

describe('differential: @octanejs/email vs @react-email/components', () => {
	// @parity-case differential:email-welcome-render
	it('welcome email static render matches the React Email oracle', async () => {
		const props = { name: 'Ada' };
		const octaneHtml = await octaneRender(ParityEmail, props);
		const reactModule = await loadReactFixture(fixture, cache);
		const ReactParityEmail = reactModule.ParityEmail as React.ComponentType<{ name: string }>;
		const reactHtml = await reactEmailRender(React.createElement(ReactParityEmail, props));

		expect(normaliseEmailParityHtml(octaneHtml)).toBe(normaliseEmailParityHtml(reactHtml));
	});

	// @parity-case differential:email-text-margin-precedence
	it('Text margin shorthand precedence matches the React Email oracle', async () => {
		const octaneHtml = await octaneRender(TextMarginsEmail);
		const reactModule = await loadReactFixture(fixture, cache);
		const ReactTextMarginsEmail = reactModule.TextMarginsEmail as React.ComponentType;
		const reactHtml = await reactEmailRender(React.createElement(ReactTextMarginsEmail));

		expect(normaliseEmailParityHtml(octaneHtml)).toBe(normaliseEmailParityHtml(reactHtml));
	});
});
