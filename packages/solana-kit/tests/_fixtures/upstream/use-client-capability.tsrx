import type { Client } from '@solana/kit';
import { ClientProvider, useClientCapability } from '@octanejs/solana-kit';

export function CapabilityProbe(props: {
	capability: string | readonly string[];
	hookName: string;
	providerHint: string;
	onRender: (client: Client<object>) => void;
}) @{
	props.onRender(
		useClientCapability({
			capability: props.capability,
			hookName: props.hookName,
			providerHint: props.providerHint,
		}),
	);
	null;
}

export function CapabilityApp(props: {
	client: Client<object>;
	capability: string | readonly string[];
	hookName: string;
	providerHint: string;
	onRender: (client: Client<object>) => void;
}) @{
	<ClientProvider client={props.client}>
		<CapabilityProbe
			capability={props.capability}
			hookName={props.hookName}
			providerHint={props.providerHint}
			onRender={props.onRender}
		/>
	</ClientProvider>
}
