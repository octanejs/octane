import {
	createQueryStore,
	type QueryResponseInitial,
	type UseQueryHook,
} from '@octanejs/sanity-loader';

const { useQuery } = createQueryStore({ client: false, ssr: true });
const query = '*[_type == "post"][0]';

export function InitialQuery() @{
	const { data, loading } = useQuery<{ title: string }>(query, {}, {
		initial: {
			data: { title: 'Octane and Sanity' },
			sourceMap: undefined,
		},
	});

	<output data-loading={loading ? 'true' : 'false'}>{data.title as string}</output>
}

export function QuerySnapshot({
	useQuery,
	query,
	initial,
}: {
	useQuery: UseQueryHook;
	query: string;
	initial: QueryResponseInitial<{ title: string }>;
}) @{
	const { data, loading } = useQuery<{ title: string }>(query, {}, { initial });
	const title = data?.title ?? '';

	<output data-loading={loading ? 'true' : 'false'}>{title}</output>
}
