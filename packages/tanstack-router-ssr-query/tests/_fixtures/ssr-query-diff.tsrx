import { useQueryClient } from '@octanejs/tanstack-query';

export function ExistingWrapper(props: { children?: unknown }) {
	return <section data-existing-wrapper="preserved">{props.children}</section>;
}

function QueryReader() {
	const queryClient = useQueryClient();
	return <output id="router-ssr-query">{String(
		queryClient.getQueryData(['parity-proof']),
	)}</output>;
}

export function WrappedQueryReader(props: {
	Wrap: (props: { children?: unknown }) => unknown;
}) {
	const Wrap = props.Wrap;
	return <Wrap>
		<QueryReader />
	</Wrap>;
}
