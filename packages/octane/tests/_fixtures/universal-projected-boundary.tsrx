import { use } from 'octane';
import { Canvas } from '/packages/octane/tests/_fixtures/universal-renderer-boundaries.tsrx';
import {
	PreparedProjectedScene,
	ProjectedScene,
	SequentialProjectedScene,
} from './universal-projected-scene.object.tsrx';

function SiblingSuspender(props) @{
	const value = use(props.resource);
	<span class="projected-sibling">
		{value as string}
	</span>
}

export function ProjectedBoundaryApp(props) @{
	@try {
		<Canvas root={props.root}>
			<ProjectedScene resource={props.resource} />
		</Canvas>
	} @pending {
		<p class="projected-pending">{'pending'}</p>
	} @catch (error) {
		<p class="projected-error">
			{error.message as string}
		</p>
	}
}

export function SequentialProjectedBoundaryApp(props) @{
	@try {
		<Canvas root={props.root}>
			<SequentialProjectedScene first={props.first} secondFor={props.secondFor} />
		</Canvas>
	} @pending {
		<p class="projected-pending">{'pending'}</p>
	} @catch (error) {
		<p class="projected-error">
			{error.message as string}
		</p>
	}
}

export function PreparedThenSiblingBoundaryApp(props) @{
	@try {
		<>
			<Canvas root={props.root}>
				<PreparedProjectedScene value={props.value} />
			</Canvas>
			<SiblingSuspender resource={props.resource} />
		</>
	} @pending {
		<p class="projected-pending">{'pending'}</p>
	} @catch (error) {
		<p class="projected-error">
			{error.message as string}
		</p>
	}
}
