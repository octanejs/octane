import { usePermissions, useSuspendingLiveQuery } from '@octanejs/dexie';

export function SuspendingValue({
	querier,
	cacheKey,
}: {
	querier: () => Promise<string>;
	cacheKey: string[];
}) @{
	const value = useSuspendingLiveQuery(querier, cacheKey);
	<div id="suspending-value">
		{value as string}
	</div>
}

export function SuspendingBoundary({
	querier,
	cacheKey,
}: {
	querier: () => Promise<string>;
	cacheKey: string[];
}) @{
	@try {
		<SuspendingValue querier={querier} cacheKey={cacheKey} />
	} @pending {
		<div id="suspending-pending">loading</div>
	} @catch (error) {
		<div id="suspending-error">
			{(error as Error).message as string}
		</div>
	}
}

export function SequentialSuspendingValues({
	firstQuerier,
	secondQuerier,
}: {
	firstQuerier: () => Promise<string>;
	secondQuerier: () => Promise<string>;
}) @{
	@try {
		<div>
			<SuspendingValue querier={firstQuerier} cacheKey={['first']} />
			<SuspendingValue querier={secondQuerier} cacheKey={['second']} />
		</div>
	} @pending {
		<div id="sequential-pending">loading</div>
	}
}

export function PermissionReader({ db, table, obj }: { db: any; table: string; obj: any }) @{
	const permissions = usePermissions(db, table, obj);
	<div id="permission">
		{'add=' + (permissions?.add(table) ?? false)}
	</div>
}
