import { useQuery } from '@octanejs/sanity-loader';

const query = '*[_type == "post"][0]';

function QueryOnly() @{
	const { error } = useQuery<unknown, Error>(query);
	const message = error?.message ?? 'No error';

	<span data-call="query-only">{message}</span>
}

function QueryWithParams() @{
	const { error } = useQuery<unknown, Error>(query, { slug: 'octane' });
	const message = error?.message ?? 'No error';

	<span data-call="query-with-params">{message}</span>
}

export function OptionalQueryArguments() @{
	<output>
		<QueryOnly />
		<QueryWithParams />
	</output>
}
