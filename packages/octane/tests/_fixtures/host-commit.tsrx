import { use } from 'octane';

function Wait(props: { wait: Promise<unknown> }) @{
	use(props.wait);
	<b>{'resolved'}</b>
}

function Probe(props: { probe: () => void }) @{
	props.probe();
	<u>{'probe'}</u>
}

// Hosts whose props resolve across writers (form cascades, spreads) and raw
// HTML, all over one label, which the spreads carry too. The probe renders
// after them; the gate suspends the whole root.
export function HostWrites(props: {
	label: string;
	attrs: Record<string, unknown>;
	html: Record<string, unknown>;
	probe: () => void;
	gate?: Promise<unknown> | null;
}) @{
	<section>
		<input id="cascade" readOnly title={props.label} value={props.label} defaultValue="default" />
		<input
			id="check"
			type="checkbox"
			readOnly
			checked={props.label === 'b'}
			defaultChecked={props.label !== 'b'}
		/>
		<div id="raw" dangerouslySetInnerHTML={{ __html: '<b>' + props.label + '</b>' }} />
		<script
			id="script"
			type="text/plain"
			dangerouslySetInnerHTML={{ __html: 'label ' + props.label }}
		/>
		<input id="spread-input" readOnly {...props.attrs} />
		<textarea id="spread-area" readOnly {...props.attrs} />
		<div id="spread-raw" {...props.html} />
		<Probe probe={props.probe} />
		@if (props.gate) {
			<Wait wait={props.gate} />
		}
	</section>
}
