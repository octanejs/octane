import {
	createResource,
	createScope,
	derived$,
	optimistic$,
	query,
	query$,
	signal$,
	skip,
	type Resource,
} from 'octane/signals';

const scope = createScope({ scopeKey: 'resource-types' });
const selected$ = scope.signal$('selected', 1);
const draft$ = signal$('', { key: 'draft' });
const draft: string = draft$.get();
const length$ = derived$(() => draft$.get().length, { key: 'length', sync: true });
const length: number = length$.get();
const keyedUser$ = query$(
	() => selected$.get(),
	async (id) => ({ id }),
	{
		key: 'selected-user',
		kind: 'promise',
	},
);
const keyedUserId: number = keyedUser$.get().id;
// @ts-expect-error — keys belong to the trailing options, not the initial-value position.
signal$('draft', '');
// @ts-expect-error — a derived declaration starts with its computation.
derived$('length', () => draft$.get().length);
query$(
	// @ts-expect-error — a query declaration starts with its selector and loader.
	'user',
	() => selected$.get(),
	async (id: number) => ({ id }),
);
const userQuery = query('user', async (id: number) => ({ id, name: `User ${id}` }));

const user$ = createResource(scope, 'user', () => userQuery(selected$.get()));
const user: { id: number; name: string } = user$.get();
const resource: Resource<{ id: number; name: string }> = user$;
resource.retry({ pending: true });

const optional$ = createResource(scope, 'optional', () =>
	selected$.get() > 0 ? userQuery(selected$.get()) : skip,
);
const optionalUser: { id: number; name: string } = optional$.get();
const idle$ = createResource<string>(scope, 'idle', () => skip);
const idleFallback: string = idle$.latest('waiting');

const saved$ = scope.signal$('saved', { revision: 1, name: 'Saved' });
const optimisticSaved$ = optimistic$(saved$, {
	compareAuthority: (incoming, current) => incoming.revision - current.revision,
});
const optimisticName: string = optimisticSaved$.get().name;

// @ts-expect-error — authority comparators return ordering numbers, not labels.
optimistic$(saved$, { compareAuthority: () => 'newer' });
// @ts-expect-error — both authority values retain the source payload type.
optimistic$(saved$, { compareAuthority: (incoming: string, current: string) => 0 });

// @ts-expect-error — resource values retain the query result type.
const wrongValue: string = user$.get();
// @ts-expect-error — a resource describes a query request, not a raw result.
createResource(scope, 'raw', () => ({ id: 1, name: 'User 1' }));
// @ts-expect-error — request descriptions run synchronously.
createResource(scope, 'async-description', async () => userQuery(1));
// @ts-expect-error — the owning scope must be supplied explicitly.
createResource('missing-owner', () => userQuery(1));
// @ts-expect-error — query argument types survive resource construction.
createResource(scope, 'wrong-argument', () => userQuery('1'));
// @ts-expect-error — resource values are published by their producer.
user$.set({ id: 2, name: 'User 2' });
// @ts-expect-error — explicit resources use the named createResource export.
scope.asyncSignal$('removed-method', () => userQuery(1));
