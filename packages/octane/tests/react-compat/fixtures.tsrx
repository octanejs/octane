import { Activity, memo, use } from 'octane';
import { ReactCompat, bridgeReactContext } from 'octane/react';
import {
	Counter,
	ContextCounter,
	Fault,
	Lifecycle,
	LocalError,
	LocalSuspense,
	LocalTransition,
	Portal,
	Resource,
	Sequential,
	SuspendedLifecycle,
} from './components.react.js';
import { Theme, ReactTheme } from './contexts.js';

const themeBridge = [bridgeReactContext(Theme, ReactTheme)];

export function CounterApp(props) @{
	<div data-outer="">
		<span data-sibling="">{props.label as string}</span>
		@if (props.show !== false) {
			<ReactCompat>
				<Counter
					start={props.start}
					label={props.label}
					key={props.childKey}
					ref={props.ref}
					onChange={props.onChange}
					onCleanup={props.onCleanup}
				/>
			</ReactCompat>
		}
	</div>
}

export function PendingApp(props) @{
	<div>
		@try {
			<ReactCompat key={props.boundaryKey}>
				<Resource resource={props.resource} />
			</ReactCompat>
		} @pending {
			<p data-octane-pending="">Octane pending</p>
		} @catch (error, reset) {
			<button data-octane-caught="" onClick={reset}>{error.message as string}</button>
		}
	</div>
}

export function LocalPendingApp(props) @{
	@try {
		<ReactCompat>
			<LocalSuspense resource={props.resource} />
		</ReactCompat>
	} @pending {
		<p data-octane-pending="">Octane pending</p>
	}
}

export function ErrorApp(props) @{
	@try {
		<ReactCompat>
			<Fault error={props.error} effect={props.effect} />
		</ReactCompat>
	} @catch (error, reset) {
		<button data-octane-caught="" onClick={reset}>{error.message as string}</button>
	}
}

export function LocalErrorApp(props) @{
	@try {
		<ReactCompat>
			<LocalError error={props.error} />
		</ReactCompat>
	} @catch (error) {
		<p data-octane-caught="">{error.message as string}</p>
	}
}

function ContextIsland() @{
	<ReactCompat contexts={themeBridge}>
		<ContextCounter />
	</ReactCompat>
}
const MemoIsland = memo(ContextIsland);

export function ContextApp(props) @{
	<Theme value={props.value}>
		<MemoIsland />
	</Theme>
}

export function HiddenApp(props) @{
	<div>
		<Activity mode={props.hidden ? 'hidden' : 'visible'}>
			<ReactCompat>
				<Counter start={3} onCleanup={props.onCleanup} />
			</ReactCompat>
		</Activity>
	</div>
}

export function PortalApp(props) @{
	<ReactCompat>
		<Portal target={props.target} onCleanup={props.onCleanup} />
	</ReactCompat>
}

export function TransitionApp(props) @{
	@try {
		<ReactCompat>
			<LocalTransition next={props.next} />
		</ReactCompat>
	} @pending {
		<p data-octane-pending="">Octane pending</p>
	}
}

export function SequentialApp(props) @{
	@try {
		<ReactCompat>
			<Sequential first={props.first} second={props.second} />
		</ReactCompat>
	} @pending {
		<p data-octane-pending="">Octane pending</p>
	} @catch (error) {
		<p data-octane-caught="">{error.message as string}</p>
	}
}

function NativeResource(props) {
	if (props.resource) use(props.resource);
	return null;
}

export function ExternalPendingApp(props) @{
	@try {
		<div>
			<ReactCompat>
				<Lifecycle target={props.target} log={props.log} cleanupError={props.cleanupError} />
			</ReactCompat>
			<NativeResource resource={props.resource} />
		</div>
	} @pending {
		<p data-octane-pending="">Octane pending</p>
	} @catch (error) {
		<p data-octane-caught="">{error.message as string}</p>
	}
}

export function ActivityLifecycleApp(props) @{
	<div>
		<Activity mode={props.hidden ? 'hidden' : 'visible'}>
			<ReactCompat>
				<Lifecycle target={props.target} log={props.log} />
			</ReactCompat>
		</Activity>
	</div>
}

export function CleanupErrorApp(props) @{
	@try {
		<div>
			@if (props.show) {
				<ReactCompat>
					<Lifecycle target={props.target} log={props.log} cleanupError={props.cleanupError} />
				</ReactCompat>
			}
		</div>
	} @catch (error) {
		<p data-octane-caught="">{error.message as string}</p>
	}
}

export function PendingActivityApp(props) @{
	<Activity mode={props.hidden ? 'hidden' : 'visible'}>
		@try {
			<ReactCompat>
				<SuspendedLifecycle target={props.target} log={props.log} resource={props.resource} />
			</ReactCompat>
		} @pending {
			<p data-octane-pending="">Octane pending</p>
		}
	</Activity>
}

export function ComponentApp(props) @{
	@try {
		<ReactCompat component={props.component} props={props.props} />
	} @pending {
		<p data-octane-pending="">Octane pending</p>
	}
}

export function ExternalResourceApp(props) @{
	@try {
		<div>
			<ReactCompat>
				<Resource resource={props.react} />
			</ReactCompat>
			<NativeResource resource={props.native} />
		</div>
	} @pending {
		<p data-octane-pending="">Octane pending</p>
	}
}

export function HiddenErrorApp(props) @{
	@try {
		<div>
			@if (props.show !== false) {
				<Activity mode={props.hidden ? 'hidden' : 'visible'}>
					<ReactCompat>
						<Lifecycle target={props.target} log={props.log} cleanupError={props.error} />
					</ReactCompat>
				</Activity>
			}
		</div>
	} @catch (error) {
		<p data-octane-caught="">{error.message as string}</p>
	}
}
