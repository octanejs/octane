import { useQueryClient } from '@octanejs/tanstack-query';
import type { OctaneNode } from 'octane';

type Wrapper = (props: { children?: unknown }) => OctaneNode;

function QueryReader() @{
	const client = useQueryClient();
	const value = client.getQueryData<string>(['router-ssr-proof']) ?? 'missing';

	<output id="router-ssr-query">{value as string}</output>
}

export function WrappedQueryReader(props: { Wrap: Wrapper }) @{
	const Wrap = props.Wrap;

	<Wrap>
		<QueryReader />
	</Wrap>
}

export function ExistingRouterWrapper(props: { children?: unknown }) @{
	<section data-existing-router-wrapper="preserved">{props.children as OctaneNode}</section>
}
