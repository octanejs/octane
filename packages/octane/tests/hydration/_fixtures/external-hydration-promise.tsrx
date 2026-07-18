import { use } from 'octane';

export function MixedHydrationOwners(props) @{
	const external = use(props.external);
	const ordinary = use(props.ordinary);
	<div
		id="mixed-hydration-owners"
		data-external={String(external)}
		data-ordinary={String(ordinary)}
	>
		{String(external) + ':' + String(ordinary) as string}
	</div>
}

export function ExternalBoundary(props) @{
	@try {
		<span class="resolved">
			{String(use(props.promise)) as string}
		</span>
	} @pending {
		<span class="pending">pending</span>
	}
}
