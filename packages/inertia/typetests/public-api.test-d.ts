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
} from '@octanejs/inertia';
import server from '@octanejs/inertia/server';

declare function expectType<T>(value: T): void;

expectType<typeof import('@inertiajs/core').http>(http);
expectType<typeof import('@inertiajs/core').progress>(progress);
expectType<typeof import('@inertiajs/core').router>(router);
expectType<typeof import('@inertiajs/core/server').default>(server);

const form = useForm({ profile: { name: 'Ada' } });
expectType<string>(form.data.profile.name);
form.setData('profile.name', 'Grace');

const direct = useHttp<{ query: string }, { total: number }>({ query: 'octane' });
expectType<Promise<{ total: number }>>(direct.get('/search'));

expectType<typeof usePage>(usePage);
expectType<typeof usePoll>(usePoll);
expectType<typeof usePrefetch>(usePrefetch);
expectType<typeof useRemember>(useRemember);
