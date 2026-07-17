import { createContext, useLayoutEffect, useState } from 'octane';
import { createUniversalHostBoundary } from '../../src/universal.js';

export const UniversalTheme = createContext('default');
const ObjectBoundary = createUniversalHostBoundary('object');

function ThrowAfterPrepare(props) @{
	if (props.fail) throw new Error('later sibling failed');
	<span class="after">{'after'}</span>
}

export function UniversalBoundaryFixture(props) @{
	useLayoutEffect(() => {
		props.log('dom-layout');
		return () => props.log('dom-cleanup');
	}, [props.log]);
	<>
		<UniversalTheme.Provider value={props.theme}>
			@try {
				<>
					<ObjectBoundary root={props.root} component={props.component} props={props.childProps} />
					<ThrowAfterPrepare fail={props.failAfterPrepare} />
				</>
			} @catch (error) {
				<span class="caught">
					{'caught: ' + error.message}
				</span>
			}
		</UniversalTheme.Provider>
	</>
}

export function UniversalSchedulerBridgeApp(props) @{
	const [version, setVersion] = useState(0);
	useLayoutEffect(() => props.captureUpdate(setVersion), [props.captureUpdate, setVersion]);

	<ObjectBoundary
		root={props.root}
		component={props.component}
		props={{ version, onLayout: props.onUniversalLayout }}
	/>
}
