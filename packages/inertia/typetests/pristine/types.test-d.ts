// Pristine side: published @inertiajs/react 3.6.1 typings, compiled with plain
// tsc. Assertion groups are listed in ../assertions.md and must stay
// one-for-one with ../adapted/types.test-d.ts.
import {
	http,
	progress,
	router,
	useForm,
	useHttp,
	usePage,
	usePoll,
	usePrefetch,
	useRemember,
} from '@inertiajs/react';
import server from '@inertiajs/react/server';

declare function expectType<T>(value: T): void;

// 1. Framework-neutral core identities are re-exported.
expectType<typeof import('@inertiajs/core').http>(http);
expectType<typeof import('@inertiajs/core').progress>(progress);
expectType<typeof import('@inertiajs/core').router>(router);
expectType<typeof import('@inertiajs/core/server').default>(server);

// 2. useForm exposes typed data and setData by key path.
const form = useForm({ profile: { name: 'Ada' } });
expectType<string>(form.data.profile.name);
form.setData('profile.name', 'Grace');

// 3. useHttp returns a typed direct HTTP helper.
const direct = useHttp<{ query: string }, { total: number }>({ query: 'octane' });
expectType<Promise<{ total: number }>>(direct.get('/search'));

// 4. Hook exports keep their function identities.
expectType<typeof usePage>(usePage);
expectType<typeof usePoll>(usePoll);
expectType<typeof usePrefetch>(usePrefetch);
expectType<typeof useRemember>(useRemember);

// 5. usePage rejects being called with a non-generic value argument.
// @ts-expect-error usePage takes no runtime arguments
usePage({ component: 'Dashboard' });
