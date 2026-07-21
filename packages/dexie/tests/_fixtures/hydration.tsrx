import { useLiveQuery } from '@octanejs/dexie';

export function HydrationLiveQuery({ db }: { db: any }) @{
	const items = useLiveQuery(
		() => db.items.toArray().then((rows: Array<{ name: string }>) => rows.map((row) => row.name)),
		[db],
		['server'] as string[],
	) as string[];
	<div id="hydration-items">{items.join(',') as string}</div>
}
