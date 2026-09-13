import { createQueryStore } from '@octanejs/sanity-loader';
import { createQueryStore as createServerQueryStore } from '@octanejs/sanity-loader/rsc';

type Equal<A, B> =
	(<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Assert<T extends true> = T;

const store = createQueryStore({ client: false, ssr: true });
const snapshot = store.useQuery<{ title: string }>(
	'*[]',
	{},
	{
		initial: { data: { title: 'Sanity' }, sourceMap: undefined },
	},
);
export type QueryTitleIsString = Assert<Equal<typeof snapshot.data.title, string>>;
const server = createServerQueryStore({ client: false, ssr: true });
const result = server.loadQuery<{ title: string }>('*[]');
export type LoadedTitleIsString = Assert<Equal<Awaited<typeof result>['data']['title'], string>>;

store.useLiveMode({ studioUrl: 'https://example.com/studio?variant=preview' });
// @ts-expect-error Query data retains the declared response shape.
snapshot.data.missing;
// @ts-expect-error The Studio URL option is not numeric.
store.useLiveMode({ studioUrl: 123 });
