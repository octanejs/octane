/** @jsxImportSource octane */
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@octanejs/testing-library';
import { OctanePanel } from '../src/panel/OctanePanel.tsrx';
import { OctaneDevtoolsEventClient } from '../src/client';

// globals: false in the octane-devtools vitest project — @octanejs/testing-library's
// auto-cleanup side effect only registers when a global afterEach exists, so this
// file registers it itself (same pattern as components-tab.test.tsx).
afterEach(() => cleanup());

describe('OctanePanel', () => {
	it('defaults to the Components tab and switches to Profiler', async () => {
		const client = new OctaneDevtoolsEventClient();
		render(<OctanePanel client={client} />);

		// Components tab is active by default (its empty state shows).
		expect(screen.getByText(/no mounted roots yet/i)).toBeInTheDocument();

		// Switch to Profiler.
		screen.getByRole('button', { name: /profiler/i }).click();
		expect(await screen.findByText(/no profiling data/i)).toBeInTheDocument();
	});

	it('switches to the Transitions tab', async () => {
		const client = new OctaneDevtoolsEventClient();
		render(<OctanePanel client={client} />);
		screen.getByRole('button', { name: /transitions/i }).click();
		expect(await screen.findByText(/pending transitions: 0/i)).toBeInTheDocument();
	});

	it('switches to the Performance tab', async () => {
		const client = new OctaneDevtoolsEventClient();
		render(<OctanePanel client={client} />);
		screen.getByRole('button', { name: /performance/i }).click();
		expect(await screen.findByText(/no performance data yet/i)).toBeInTheDocument();
	});
});
