import { use } from 'octane';

type Resource = (name: 'parent' | 'child', version: number) => Promise<string>;

function AsyncChild(props: { load: Resource; version: number }) @{
	const value = use(props.load('child', props.version));
	<span id="warm-child">{value as string}</span>
}

export default function WarmPlanControl(props: { load: Resource; version: number }) @{
	@try {
		const own = use(props.load('parent', props.version));
		<main id="warm-control">
			<strong id="warm-parent">{own as string}</strong>
			<AsyncChild load={props.load} version={props.version} />
		</main>
	} @pending {
		<p id="warm-pending">{'waiting'}</p>
	}
}
