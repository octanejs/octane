/** @jsxImportSource octane */
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@octanejs/testing-library';
import { TransitionsTab } from '../src/panel/TransitionsTab.tsrx';
import { OctaneDevtoolsEventClient } from '../src/client';

// globals: false in the octane-devtools vitest project — @octanejs/testing-library's
// auto-cleanup side effect only registers when a global afterEach exists, so this
// file registers it itself (same pattern as profiler-tab.test.tsx).
afterEach(() => cleanup());

describe('TransitionsTab', () => {
	it('renders the pending count and boundary states from a transition event', async () => {
		const client = new OctaneDevtoolsEventClient();
		render(<TransitionsTab client={client} />);

		// The tab subscribes to 'transition' inside a useEffect, already live by the
		// time render() returns (see components-tab.test.tsx for why this ordering matters).
		client.emit('transition', {
			pendingCount: 2,
			boundaries: [
				{ id: 1, branch: 2, state: 'pending', hasResolved: false, label: 'List' },
				{ id: 2, branch: 1, state: 'resolved', hasResolved: true, label: 'Detail' },
			],
		});

		expect(await screen.findByText(/pending transitions: 2/i)).toBeInTheDocument();
		expect(screen.getByText(/List/)).toBeInTheDocument();
		expect(screen.getByText(/pending/)).toBeInTheDocument();
		expect(screen.getByText(/Detail/)).toBeInTheDocument();
		expect(screen.getByText(/resolved/)).toBeInTheDocument();
	});

	it('shows a zero/empty state before any event', () => {
		const client = new OctaneDevtoolsEventClient();
		render(<TransitionsTab client={client} />);
		expect(screen.getByText(/pending transitions: 0/i)).toBeInTheDocument();
		expect(screen.getByText(/no suspense boundaries/i)).toBeInTheDocument();
	});
});
