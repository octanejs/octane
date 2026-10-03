import { use, useState } from 'octane';

type Load = (name: string, version: number) => Promise<string>;

function CheckpointLeaf(props: { load: Load; version: number }) @{
	const value = use(props.load('leaf', props.version));
	<span class="checkpoint-leaf">{value as string}</span>
}

// Its request depends on its own state, so no ancestor plan can warm it.
function CheckpointBumper(props: {
	load: Load;
	expose: (set: (version: number) => void) => void;
}) @{
	const [version, setVersion] = useState(0);
	props.expose(setVersion);
	const value = use(props.load('bumper', version));
	<span class="checkpoint-bumper">{value as string}</span>
}

// A full render frame (it holds a hook) whose child-only plan warms the leaf.
export function FullCheckpointFrame(props: {
	load: Load;
	version: number;
	expose: (set: (version: number) => void) => void;
}) @{
	const [label] = useState('full-frame');
	<main class={label}>
		<CheckpointLeaf load={props.load} version={props.version} />
		@try {
			<CheckpointBumper load={props.load} expose={props.expose} />
		} @pending {
			<p class="checkpoint-pending">{'pending'}</p>
		}
	</main>
}

// A hookless frame renders through the lite component path and still
// registers the plan that warms its leaf.
function LiteCheckpointFrame(props: { load: Load; version: number }) @{
	<section class="lite-frame">
		<CheckpointLeaf load={props.load} version={props.version} />
	</section>
}

export function LiteCheckpointHost(props: {
	load: Load;
	version: number;
	expose: (set: (version: number) => void) => void;
}) @{
	const [label] = useState('lite-host');
	<main class={label}>
		<LiteCheckpointFrame load={props.load} version={props.version} />
		@try {
			<CheckpointBumper load={props.load} expose={props.expose} />
		} @pending {
			<p class="checkpoint-pending">{'pending'}</p>
		}
	</main>
}
