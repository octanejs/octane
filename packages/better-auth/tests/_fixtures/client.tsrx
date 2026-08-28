import { useStore } from '@octanejs/better-auth';
import type { MapStore, Store } from 'nanostores';

type SessionState = {
	data: { user: { name: string } } | null;
	isPending: boolean;
};

type AuthClient = {
	useSession: () => SessionState;
};

export function SessionReader(props: { client: AuthClient }) @{
	const session = props.client.useSession();
	<p id="session">
		{session.isPending ? 'pending' : session.data?.user.name ?? 'signed-out'}
	</p>
}

export function StoreReader(props: { store: Store<number> }) @{
	const value = useStore(props.store);
	<p id="store-value">{value as string}</p>
}

export function KeyStoreReader(props: {
	store: MapStore<{ selected: number; ignored: number }>;
	onRender: () => void;
}) @{
	const value = useStore(props.store, { keys: ['selected'] });
	props.onRender();
	<p id="key-store-value">{`${value.selected}:${value.ignored}`}</p>
}

export function PluginStoreReader(props: {
	client: { useActiveOrganization: () => string };
}) @{
	const organization = props.client.useActiveOrganization();
	<p id="organization">{organization}</p>
}
