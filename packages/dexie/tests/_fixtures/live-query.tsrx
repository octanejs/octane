import { useLiveQuery } from '@octanejs/dexie';

type Item = {
	id: number;
	group: string;
	name: string;
};

export function LiveQueryReader({ db, group }: { db: any; group: string }) @{
	const items = useLiveQuery(
		() => db.items.where('group').equals(group).sortBy('id'),
		[db, group],
		[] as Item[],
	) as Item[];
	<ul id="items">{items.map(
		(item) => <li key={item.id}>
			{item.name as string}
		</li>,
	)}</ul>
}

export function AsyncLiveQueryReader({
	querier,
	token,
}: {
	querier: () => Promise<Item[]>;
	token: number;
}) @{
	const items = useLiveQuery(querier, [token], [] as Item[]) as Item[];
	<ul id="async-items">{items.map(
		(item) => <li key={item.id}>
			{item.name as string}
		</li>,
	)}</ul>
}

function QueryErrorContent({ querier }: { querier: () => Promise<unknown> }) @{
	const value = useLiveQuery(querier, [], 'unused');
	<div id="query-value">
		{value as string}
	</div>
}

export function QueryErrorBoundary({ querier }: { querier: () => Promise<unknown> }) @{
	@try {
		<QueryErrorContent querier={querier} />
	} @catch (error) {
		<div id="query-error">
			{(error as Error).message as string}
		</div>
	}
}
