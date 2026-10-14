import { use } from 'octane';

function Wait(props: { wait: Promise<unknown> }) @{
	use(props.wait);
	<b>{'resolved'}</b>
}

function Probe(props: { probe: () => void }) @{
	props.probe();
	<u>{'probe'}</u>
}

export function Item(props: { label: string }) @{
	<em>{props.label as string}</em>
}

function ReturnedValue(props: { value: unknown }) {
	return props.value;
}

// One value in a renderable hole: a component's returned value. The probe
// renders after it; the gate suspends the whole root.
export function TextHoles(props: {
	value: unknown;
	probe: () => void;
	gate?: Promise<unknown> | null;
}) @{
	<section>
		<div id="returned">
			<ReturnedValue value={props.value} />
		</div>
		<Probe probe={props.probe} />
		@if (props.gate) {
			<Wait wait={props.gate} />
		}
	</section>
}
