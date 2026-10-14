import { expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@octanejs/testing-library';
import { ThemeToggle } from '../src/components/ThemeToggle.tsrx';

it('honors the pre-applied light theme and switches it on the first click', async () => {
	const html = document.documentElement;
	const originalTheme = html.getAttribute('data-theme');
	const storage = window.localStorage;
	const originalPreference = storage.getItem('octane-theme');
	vi.stubGlobal('localStorage', storage);
	const meta = document.createElement('meta');
	meta.name = 'theme-color';
	meta.content = '#ffffff';
	document.head.appendChild(meta);
	html.setAttribute('data-theme', 'light');
	storage.setItem('octane-theme', 'light');

	try {
		const result = render(ThemeToggle);
		await waitFor(() => {
			expect(result.getByRole('button', { name: 'Switch to dark theme' })).toBeTruthy();
		});
		expect(html.getAttribute('data-theme')).toBe('light');
		expect(meta.content).toBe('#ffffff');

		fireEvent.click(result.getByRole('button', { name: 'Switch to dark theme' }));

		await waitFor(() => {
			expect(result.getByRole('button', { name: 'Switch to light theme' })).toBeTruthy();
		});
		expect(html.getAttribute('data-theme')).toBe('dark');
		expect(storage.getItem('octane-theme')).toBe('dark');
		expect(meta.content).toBe('#23272f');
	} finally {
		cleanup();
		meta.remove();
		if (originalTheme === null) html.removeAttribute('data-theme');
		else html.setAttribute('data-theme', originalTheme);
		if (originalPreference === null) storage.removeItem('octane-theme');
		else storage.setItem('octane-theme', originalPreference);
		vi.unstubAllGlobals();
	}
});
