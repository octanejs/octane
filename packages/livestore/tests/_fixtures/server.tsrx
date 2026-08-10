import type { Store, StoreRegistry } from '@livestore/livestore';
import { useStoreRegistry, useSyncStatus } from '@octanejs/livestore';

export function ServerView(props: { store: Store<any>; registry: StoreRegistry }) @{
	const registry = useStoreRegistry(props.registry);
	const status = useSyncStatus({ store: props.store });
	<p id="server-state">{`${JSON.stringify(registry)}/${status.isSynced}/${status.pendingCount}`}</p>
}
