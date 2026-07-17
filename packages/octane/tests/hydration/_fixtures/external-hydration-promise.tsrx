import { use } from 'octane';

export function ExternalBoundary(props) @{
	<section id="external-boundary">
		@try {
			const value = use(props.promise);
			<span class="resolved">
				{String(value) as string}
			</span>
		} @pending {
			<span class="pending">{'pending'}</span>
		} @catch (error) {
			<span class="rejected">
				{String(error?.message ?? error) as string}
			</span>
		}
	</section>
}

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

export function RichExternalValue(props) @{
	const value = use(props.promise);
	props.onValue?.(value);
	const summary =
		(value.date instanceof Date ? value.date.toISOString() : 'not-a-date') + '|' +
		(value.map instanceof Map ? value.map.get('answer') : 'not-a-map');
	<div id="rich-external-value">
		{summary as string}
	</div>
}
