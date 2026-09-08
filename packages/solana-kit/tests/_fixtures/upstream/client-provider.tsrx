import type { Client } from '@solana/kit';
import { ClientProvider, useClient } from '@octanejs/solana-kit';

export function ClientProbe(props: { onRender: (client: Client<object>) => void }) @{
	props.onRender(useClient());
	null;
}

export function NestedClientProbes(props: {
	outer: Client<object>;
	inner: Client<object>;
	onRenderOuter: (client: Client<object>) => void;
	onRenderInner: (client: Client<object>) => void;
}) @{
	<ClientProvider client={props.outer}>
		<ClientProbe onRender={props.onRenderOuter} />
		<ClientProvider client={props.inner}>
			<ClientProbe onRender={props.onRenderInner} />
		</ClientProvider>
	</ClientProvider>
}

export function SingleClientProbe(props: {
	client: Client<object>;
	onRender: (client: Client<object>) => void;
}) @{
	<ClientProvider client={props.client}>
		<ClientProbe onRender={props.onRender} />
	</ClientProvider>
}
