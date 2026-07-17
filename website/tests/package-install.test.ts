// The docs' install snippet: npm/pnpm/yarn/bun tabs over one command block,
// derived per manager from the same package list. pnpm is the default; the
// rendered text is the exact command (no stray whitespace from the template),
// which is also what the copy button reads.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@octanejs/testing-library';
import { PackageInstall } from '../src/components/PackageInstall.tsrx';

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
	vi.useRealTimers();
});

function mount(props: { packages?: string; dev?: string }) {
	const utils = render(PackageInstall as any, { props });
	const tab = (name: string) =>
		Array.from(utils.container.querySelectorAll<HTMLButtonElement>('[role="tab"]')).find(
			(button) => button.textContent?.trim() === name,
		)!;
	// textContent of the <code> is exactly what the copy button copies
	// (codeEl.innerText), so asserting it guards the command AND copy together.
	const command = () => utils.container.querySelector('.pkg-code')!.textContent;
	return { ...utils, tab, command };
}

describe('PackageInstall', () => {
	it('defaults to pnpm and lists runtime then dev packages', () => {
		const { tab, command } = mount({ packages: 'octane @octanejs/vite-plugin', dev: 'vite' });
		expect(tab('pnpm').getAttribute('aria-selected')).toBe('true');
		expect(command()).toBe('pnpm add octane @octanejs/vite-plugin\npnpm add -D vite');
	});

	it('switches every command to the selected manager', () => {
		const { tab, command } = mount({ packages: 'octane', dev: 'vite' });

		fireEvent.click(tab('npm'));
		expect(command()).toBe('npm install octane\nnpm install -D vite');
		expect(tab('npm').getAttribute('aria-selected')).toBe('true');
		expect(tab('pnpm').getAttribute('aria-selected')).toBe('false');

		fireEvent.click(tab('yarn'));
		expect(command()).toBe('yarn add octane\nyarn add -D vite');

		// bun's dev flag is -d, not -D.
		fireEvent.click(tab('bun'));
		expect(command()).toBe('bun add octane\nbun add -d vite');
	});

	it('renders a single line when there are no dev packages', () => {
		const { command } = mount({ packages: '@octanejs/zustand' });
		expect(command()).toBe('pnpm add @octanejs/zustand');
	});

	it('moves selection with arrow keys and keeps one tab in the tab order', () => {
		const { container, tab, command } = mount({ packages: 'octane' });
		const tablist = container.querySelector('[role="tablist"]')!;

		// Roving tabindex: only the active tab is focusable.
		expect(tab('pnpm').tabIndex).toBe(0);
		expect(tab('npm').tabIndex).toBe(-1);

		fireEvent.keyDown(tablist, { key: 'ArrowRight' });
		expect(command()).toBe('yarn add octane');
		expect(tab('yarn').getAttribute('aria-selected')).toBe('true');
		expect(tab('yarn').tabIndex).toBe(0);
		expect(tab('pnpm').tabIndex).toBe(-1);

		fireEvent.keyDown(tablist, { key: 'ArrowLeft' });
		expect(command()).toBe('pnpm add octane');

		fireEvent.keyDown(tablist, { key: 'End' });
		expect(command()).toBe('bun add octane');
		// The list wraps.
		fireEvent.keyDown(tablist, { key: 'ArrowRight' });
		expect(command()).toBe('npm install octane');
	});

	it('associates each tab with the command panel', () => {
		const { container, tab } = mount({ packages: 'octane' });
		const panel = container.querySelector('[role="tabpanel"]')!;
		expect(panel.id).toBeTruthy();
		expect(tab('pnpm').getAttribute('aria-controls')).toBe(panel.id);
		expect(panel.getAttribute('aria-labelledby')).toBe(tab('pnpm').id);
	});

	it('copies the exact command, and a re-copy restarts the confirmation window', async () => {
		vi.useFakeTimers();
		const writeText = vi.fn(() => Promise.resolve());
		Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });

		const { container } = mount({ packages: 'octane', dev: 'vite' });
		const copy = container.querySelector<HTMLButtonElement>('.pkg-copy')!;

		fireEvent.click(copy);
		expect(writeText).toHaveBeenCalledWith('pnpm add octane\npnpm add -D vite');
		await waitFor(() => expect(copy.textContent).toContain('Copied'));

		// A second copy 1s in restarts the window: at t=2s (1s after the re-copy)
		// the label must still read "Copied", only clearing 1.5s after the click.
		vi.advanceTimersByTime(1_000);
		fireEvent.click(copy);
		await waitFor(() => expect(writeText).toHaveBeenCalledTimes(2));
		vi.advanceTimersByTime(1_000);
		expect(copy.textContent).toContain('Copied');
		vi.advanceTimersByTime(600);
		await waitFor(() => expect(copy.textContent).toContain('Copy'));
	});
});
