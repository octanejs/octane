import type { ReactNode } from 'react';
import type { Client } from '@solana/kit';
import {
	ClientProvider,
	useClient,
	useClientCapability,
	type ClientProviderProps,
	type UseClientCapabilityConfig,
} from '@solana/react';

declare function expectType<T>(value: T): void;

expectType<typeof ClientProvider>(ClientProvider);
expectType<typeof useClient>(useClient);
expectType<typeof useClientCapability>(useClientCapability);

type ProviderChildren = ClientProviderProps['children'];
expectType<ReactNode | undefined>(null as unknown as ProviderChildren);

type ClientValue = ReturnType<typeof useClient>;
expectType<Client<object>>(null as unknown as ClientValue);

type CapabilityConfig = UseClientCapabilityConfig;
expectType<CapabilityConfig>(
	null as unknown as {
		capability: string;
		hookName: string;
		providerHint: string;
	},
);

// @ts-expect-error useClientCapability requires a capability config object
useClientCapability(null);

// @ts-expect-error ClientProvider requires a client
const missingClient: ClientProviderProps = { children: null };
void missingClient;
