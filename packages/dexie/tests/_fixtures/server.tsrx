import { useLiveQuery } from '@octanejs/dexie';

export function ServerLiveQuery({ db }: { db: any }) @{
	const items = useLiveQuery(() => db.items.toArray(), [], ['server-default']) as string[];
	<div id="server-items">
		{items.join(',') as string}
	</div>
}
