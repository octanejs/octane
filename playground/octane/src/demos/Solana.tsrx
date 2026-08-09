import { useState } from 'octane';
import { ClientProvider, useClient } from '@octanejs/solana-react';

type DemoClient = {
	readonly label: string;
	readonly cluster: string;
	readonly endpoint: string;
};

const clients = {
	local: {
		label: 'Local validator',
		cluster: 'localnet',
		endpoint: 'http://127.0.0.1:8899',
	},
	devnet: {
		label: 'Solana devnet',
		cluster: 'devnet',
		endpoint: 'https://api.devnet.solana.com',
	},
} as const;

function ClientProbe() @{
	const client = useClient() as DemoClient;

	<div class="panel">
		<h2 class="demo-title">{'Solana client context'}</h2>
		<p
			class="demo-blurb"
		>{'Switches client identity without making network requests—stable for visual regression and profiling.'}</p>
		<dl class="metrics-grid">
			<div>
				<dt>{'Client'}</dt>
				<dd data-testid="solana-client-label">{client.label}</dd>
			</div>
			<div>
				<dt>{'Cluster'}</dt>
				<dd>{client.cluster}</dd>
			</div>
			<div>
				<dt>{'Endpoint'}</dt>
				<dd class="metric-address">{client.endpoint}</dd>
			</div>
		</dl>
	</div>
}

export function SolanaDemo() @{
	const [selected, setSelected] = useState<'local' | 'devnet'>('local');
	const client = clients[selected];

	<div>
		<div class="row">
			<button
				class="btn"
				disabled={selected === 'local'}
				onClick={() => setSelected('local')}
			>{'Use local validator'}</button>
			<button
				class="btn"
				disabled={selected === 'devnet'}
				onClick={() => setSelected('devnet')}
			>{'Use devnet'}</button>
		</div>
		<ClientProvider client={client as never}>
			<ClientProbe />
		</ClientProvider>
	</div>
}
