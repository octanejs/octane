import { afterEach, describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { cleanup, fireEvent, render, screen, waitFor } from '@octanejs/testing-library';
import { App } from '@octane-eval-submission/integration.i18next-switcher/src/App.tsrx';

const requireFromBindingPackage = createRequire(
	resolve(process.cwd(), 'packages/i18next/package.json'),
);
const { createInstance } = requireFromBindingPackage('i18next');

afterEach(cleanup);

describe('i18next language switcher', () => {
	it('renders rich translations and reacts to language changes', async () => {
		const instance = createInstance();
		await instance.init({
			lng: 'en',
			fallbackLng: false,
			resources: {
				en: {
					translation: {
						greeting: 'Hello {{name}}',
						details: 'Read <strong>the profile</strong>',
					},
				},
				fr: {
					translation: {
						greeting: 'Bonjour {{name}}',
						details: 'Lire <strong>le profil</strong>',
					},
				},
			},
			interpolation: { escapeValue: false },
		});

		render(App, { props: { i18n: instance, name: 'Ada' } });
		expect(screen.getByRole('heading').textContent).toBe('Hello Ada');
		expect(screen.getByText('the profile').tagName).toBe('STRONG');
		expect(screen.getByRole('button', { name: 'English' }).getAttribute('aria-pressed')).toBe(
			'true',
		);
		expect(screen.getByRole('button', { name: 'French' }).getAttribute('aria-pressed')).toBe(
			'false',
		);

		fireEvent.click(screen.getByRole('button', { name: 'French' }));
		await waitFor(() => expect(screen.getByRole('heading').textContent).toBe('Bonjour Ada'));
		expect(screen.getByText('le profil').tagName).toBe('STRONG');
		expect(screen.getByRole('button', { name: 'English' }).getAttribute('aria-pressed')).toBe(
			'false',
		);
		expect(screen.getByRole('button', { name: 'French' }).getAttribute('aria-pressed')).toBe(
			'true',
		);

		fireEvent.click(screen.getByRole('button', { name: 'English' }));
		await waitFor(() => expect(screen.getByRole('heading').textContent).toBe('Hello Ada'));
	});
});
