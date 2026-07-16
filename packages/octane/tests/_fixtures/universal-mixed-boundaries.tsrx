import { UniversalTheme } from './universal-boundary.tsrx';
import { Scene } from './universal-mixed-scene.object.tsrx';
import {
	Canvas as SceneCanvas,
} from '/packages/octane/tests/_fixtures/universal-renderer-boundaries.tsrx';
import { Html } from '/packages/octane/tests/_fixtures/universal-renderer-boundaries.object.tsrx';

export function MixedBoundaryApp(props) @{
	<UniversalTheme.Provider value={props.theme}>
		<SceneCanvas root={props.root}>
			<Scene log={props.log} hostRef={props.hostRef} />
			<mesh kind="inline" />
		</SceneCanvas>
	</UniversalTheme.Provider>
}

function ThrowAfterBoundary() {
	throw new Error('DOM sibling failed after renderer boundary');
}

export function AbandonedBoundaryApp(props) @{
	<>
		<SceneCanvas root={props.root}>
			<Scene log={props.log} />
		</SceneCanvas>
		<ThrowAfterBoundary />
	</>
}

export function InlineAlternatingBoundaryApp(props) @{
	<SceneCanvas root={props.root}>
		<Html>
			<section class="overlay">
				{props.label as string}
				<SceneCanvas root={props.nestedRoot}>
					<nested-mesh depth="inner" />
				</SceneCanvas>
			</section>
		</Html>
	</SceneCanvas>
}
