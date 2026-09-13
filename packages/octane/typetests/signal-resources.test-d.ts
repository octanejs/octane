import { createResource, createScope, query, skip, type Resource } from 'octane/signals';

const scope = createScope({ scopeKey: 'resource-types' });
const selected$ = scope.signal$('selected', 1);
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
