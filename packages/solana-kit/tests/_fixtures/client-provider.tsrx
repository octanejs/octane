import type { Client } from '@solana/kit';
import { ClientProvider, useClient } from '@octanejs/solana-kit';

export type FixtureClient =
	Client<object> & {
		label: string;
	};

export type ClientProviderFixtureProps =
	Readonly<{
		client: FixtureClient;
	}>;

function ClientLabel() @{
	const client = useClient() as FixtureClient;
	<output id="solana-client-label">{client.label}</output>
}

export function ClientProviderFixture(props: ClientProviderFixtureProps) @{
	<ClientProvider client={props.client}>
		<main id="solana-client-provider">
			<ClientLabel />
		</main>
	</ClientProvider>
}
