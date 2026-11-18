/** @jsxImportSource octane */
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@octanejs/testing-library';
import { ComponentsTab } from '../src/panel/ComponentsTab';
import { OctaneDevtoolsEventClient, type WireTreeNode } from '../src/client';

// globals: false in the octane-devtools vitest project — @octanejs/testing-library's
// auto-cleanup side effect only registers when a global afterEach exists, so this
// file registers it itself (same pattern as packages/tanstack-devtools's test-setup).
afterEach(() => cleanup());

describe('ComponentsTab', () => {
	it('shows native ownership and stream metadata and clears a retired selection', async () => {
		const client = new OctaneDevtoolsEventClient();
		render(<ComponentsTab client={client} />);
		client.emit('tree', {
			nodes: [{ id: 1, name: 'NativeReader', kind: 'component', children: [] }],
		});
		(await screen.findByText('NativeReader')).click();
		client.emit('inspect', {
			id: 1,
			name: 'NativeReader',
			hooks: [],
			context: [],
			effectCount: 0,
			nativeReads: {
				ownerId: 2,
				committed: {
					mixed: false,
					reads: [
						{
							observedVersion: 2,
							currentVersion: 3,
							source: {
								scopeKey: 'tasks',
								key: 'feed',
								read: 'latest',
								kind: 'async',
								status: 'ready',
								revision: 3,
								epoch: 0,
								retired: false,
								historical: false,
								retained: true,
								refreshing: true,
								connection: 'open',
								complete: false,
								dependencies: [{ scopeKey: 'tasks', key: 'filter' }],
							},
						},
					],
				},
				pending: [],
				retry: [],
			},
		});
		expect(await screen.findByText('Native reads')).toBeInTheDocument();
		expect(screen.getByText('Scheduled owner #2')).toBeInTheDocument();
		expect(screen.getByText('tasks:feed')).toBeInTheDocument();
		expect(screen.getByText('Read revision 2 → 3')).toBeInTheDocument();
		expect(screen.getByText('retained value')).toBeInTheDocument();
		expect(screen.getByText('refreshing')).toBeInTheDocument();
		expect(screen.getByText('stream: open')).toBeInTheDocument();
		expect(screen.getByText('Dependencies: tasks:filter')).toBeInTheDocument();
		client.emit('inspect-clear', { id: 1 });
		expect(await screen.findByText('Select a component.')).toBeInTheDocument();
		expect(screen.queryByText('tasks:feed')).not.toBeInTheDocument();
	});

	it('renders a deep tree without growing the stack per level', async () => {
		// #3021: a recursive row component added runtime frames per nesting level,
		// so a deep app tree overflowed the stack while mounting the panel.
		const depth = 1000;
		let root: WireTreeNode = { id: depth, name: 'Leaf', kind: 'component', children: [] };
		for (let id = depth - 1; id >= 1; id--) {
			root = { id, name: 'Node' + id, kind: 'component', children: [root] };
		}
		const client = new OctaneDevtoolsEventClient();
		render(<ComponentsTab client={client} />);
		client.emit('tree', { nodes: [root] });

		const leaf = (await screen.findByText('Leaf')).closest('button');
		expect(leaf).toHaveStyle({ paddingLeft: `${6 + (depth - 1) * 12}px` });
		expect(screen.getByText('Node1').closest('button')).toHaveStyle({ paddingLeft: '6px' });
	});

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
