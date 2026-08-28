import { Activity, use, useState } from 'octane';
import { ReactCompat } from 'octane/react';
import { Island } from './Island.react.js';
import type { AppProps } from './shared.js';

function NativeResource(props: { resource: Promise<string> | null }) {
	if (props.resource !== null) use(props.resource);
	return null;
}

export function App(props: AppProps) @{
	const [resource, setResource] = useState(props.initial);
	const [nativeResource, setNativeResource] = useState<Promise<string> | null>(null);
	const [hidden, setHidden] = useState(false);
	const [show, setShow] = useState(true);

	<main>
		<button data-suspend="" onClick={() => setResource(props.next)}>Suspend React</button>
		<button data-resolve="" onClick={props.resolve}>Resolve React</button>
		<button
			data-suspend-both=""
			onClick={() => {
				setResource(props.next);
				setNativeResource(props.nativeNext);
			}}
		>Suspend both renderers</button>
		<button data-resolve-native="" onClick={props.resolveNative}>Resolve Octane</button>
		<button data-activity="" onClick={() => setHidden(!hidden)}>
			{hidden ? 'Reveal Activity' : 'Hide Activity'}
		</button>
		<button data-remove="" onClick={() => setShow(false)}>Remove island</button>
		@if (show) {
			<Activity mode={hidden ? 'hidden' : 'visible'}>
				@try {
					<div>
						<ReactCompat>
							<Island
								resource={resource}
								target={props.target}
								ref={props.ref}
								onSubscription={props.onSubscription}
								onSignal={props.onSignal}
							/>
						</ReactCompat>
						<NativeResource resource={nativeResource} />
					</div>
				} @pending {
					<p data-octane-pending="">Octane pending</p>
				} @catch (error) {
					<p role="alert">{String(error)}</p>
				}
			</Activity>
		}
	</main>
}
