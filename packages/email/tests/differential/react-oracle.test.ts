import React from 'react';
import { describe, expect, it } from 'vitest';
import { Body, Container, Head, Heading, Html, Text } from '@react-email/components';
import { render as reactEmailRender } from '@react-email/render';

describe('@react-email/components 1.0.12 differential oracle', () => {
	it('renders a static welcome document with the expected doctype', async () => {
		const html = await reactEmailRender(
			React.createElement(
				Html,
				{ lang: 'en' },
				React.createElement(Head),
				React.createElement(
					Body,
					{ style: { backgroundColor: '#f6f9fc', margin: 0 } },
					React.createElement(
						Container,
						{ style: { padding: '20px', backgroundColor: '#ffffff' } },
						React.createElement(Heading, { as: 'h2' }, 'Welcome'),
						React.createElement(Text, null, 'Hello, Ada'),
					),
				),
			),
		);

		expect(html.startsWith('<!DOCTYPE html PUBLIC')).toBe(true);
		expect(html).toContain('Hello, Ada');
	});
});
