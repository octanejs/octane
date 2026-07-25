/** @jsxImportSource octane */
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@octanejs/testing-library';
import { ComponentsTab } from '../src/panel/ComponentsTab';
import { OctaneDevtoolsEventClient } from '../src/client';

// globals: false in the octane-devtools vitest project — @octanejs/testing-library's
// auto-cleanup side effect only registers when a global afterEach exists, so this
// file registers it itself (same pattern as packages/tanstack-devtools's test-setup).
afterEach(() => cleanup());

describe('ComponentsTab', () => {
	it('renders the tree pushed over the client and inspects a selected node', async () => {
		const client = new OctaneDevtoolsEventClient();
		render(<ComponentsTab client={client} />);

		// The panel subscribes to 'tree'/'inspect' inside a useEffect. render() (from
		// @octanejs/testing-library) commits AND drains passive effects synchronously
		// before returning, so the subscription is already live here — emitting before
		// render() returned would be missed (there is no replay), which is exactly the
		// delivery regression this test is written to catch.
		client.emit('tree', {
			nodes: [
				{
					id: 1,
					name: 'App',
					kind: 'root',
					children: [{ id: 2, name: 'Leaf', kind: 'component', children: [] }],
				},
			],
		});

		// findByText retries (dom-testing-library's asyncWrapper settles pending
		// octane renders each attempt), covering the window-bus event's own async hop.
		expect(await screen.findByText('App')).toBeInTheDocument();
		expect(screen.getByText('Leaf')).toBeInTheDocument();

		// Selecting a node emits an inspect-request over the SAME client; the app
		// side (simulated here) answers with an inspect event carrying hook detail.
		screen.getByText('Leaf').click();
		client.emit('inspect', {
			id: 2,
			name: 'Leaf',
			hooks: [{ kind: 'state', value: 42 }],
			context: [],
			effectCount: 0,
		});

		expect(await screen.findByText(/state/)).toBeInTheDocument();
		expect(screen.getByText(/42/)).toBeInTheDocument();
	});
});
