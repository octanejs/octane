import { createPortal, useLayoutEffect, useState } from 'octane';
import type { OctaneNode } from 'octane';
import { useQuery } from '@octanejs/tanstack-query';

export const queryKey = ['router-provider-hydration'];

function QueryValue(props: { portal?: boolean }) @{
	const query = useQuery({
		queryKey,
		queryFn: async () => 'unexpected-fetch',
		staleTime: Infinity,
	});
	<output data-query-value={props.portal ? 'portal' : 'page'}>
		{query.data ?? 'missing' as string}
	</output>
}

export function ExistingWrapper(props: { children?: OctaneNode }) @{
	<section data-existing-wrapper>{props.children}</section>
}

export function ProviderHydration(props: {
	Wrap: (props: { children?: OctaneNode }) => OctaneNode;
	portal?: HTMLElement;
}) @{
	const Wrap = props.Wrap;
	const [mounted, setMounted] = useState(false);
	useLayoutEffect(() => {
		setMounted(true);
	}, []);
	<Wrap>
		<input aria-label="Hydrated note" defaultValue="server note" />
		<QueryValue />
		@if (mounted && props.portal) {
			<>
				{createPortal(<QueryValue portal />, props.portal)}
			</>
		}
	</Wrap>
}
