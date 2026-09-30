import {
	use,
	useEffect,
	useEffectEvent,
	useInsertionEffect,
	useLayoutEffect,
	useOptimistic,
	useState,
	useSyncExternalStore,
} from 'octane';

export function RootFreshPromiseScene(props) @{
	const first = use(props.loadFirst(props.input));
	const second = use(props.loadSecond(props.input, first));
	useLayoutEffect(() => props.committed(props.input, second), [
		props.committed,
		props.input,
		second,
	]);
	<fresh-result input={props.input} value={second} />
}

function LocalFreshPromise(props) @{
	const value = use(props.load(props.input));
	<local-result value={value} />
}

export function LocalFreshPromiseScene(props) @{
	<local-scene>
		@try {
			<LocalFreshPromise input={props.input} load={props.load} />
		} @pending {
			<local-pending />
		}
	</local-scene>
}

function KeyedFreshPromise(props) @{
	const value = use(props.load());
	<keyed-result value={value} />
}

export function KeyedFreshPromiseScene(props) @{
	<keyed-scene>
		@for (const item of props.items; key item.id) {
			@try {
				<KeyedFreshPromise load={props.load} />
			} @pending {
				<keyed-pending id={item.id} />
			}
		}
	</keyed-scene>
}

function EffectEventCleanupChild(props) @{
	const read = useEffectEvent(() => props.value);
	useInsertionEffect(() => () => props.log(`insertion:${read()}`), []);
	useLayoutEffect(() => () => props.log(`layout:${read()}`), []);
	useEffect(() => () => props.log(`passive:${read()}`), []);
	<cleanup-child />
}

export function EffectEventCleanupScene(props) @{
	<cleanup-scene>
		@if (props.show) {
			<EffectEventCleanupChild value={props.value} log={props.log} />
		}
	</cleanup-scene>
}

export function OptimisticOmittedReducerScene(props) @{
	const [value, update] = useOptimistic(props.value);
	props.expose(update);
	<optimistic-result value={value} />
}

export function ExternalStoreWithoutServerScene(props) @{
	if (props.includeFirst) {
		useSyncExternalStore(props.first.subscribe, props.first.getSnapshot);
	}
	const value = useSyncExternalStore(props.second.subscribe, props.second.getSnapshot);
	<store-result value={value} />
}

export function ExternalStoreWithServerScene(props) @{
	if (props.includeFirst) {
		useSyncExternalStore(
			props.first.subscribe,
			props.first.getSnapshot,
			props.first.getServerSnapshot,
		);
	}
	const value = useSyncExternalStore(
		props.second.subscribe,
		props.second.getSnapshot,
		props.second.getServerSnapshot,
	);
	<store-result value={value} />
}

export function UnkeyedHostIdentityScene(props) {
	if (props.leading) {
		return <identity-scene>
			<leading />
			<target ref={props.targetRef} />
		</identity-scene>;
	}
	return <identity-scene>
		<target ref={props.targetRef} />
	</identity-scene>;
}

export function RecursiveMultiRefScene(props) @{
	<multi-ref-host
		ref={[props.callback, [props.objectRef, [props.cleanupCallback]]]}
		value={props.value}
	/>
}

export function WrongOwnerRegionPropScene(props) @{
	<wrong-owner-region region={props.region} />
}

// Module-scope helpers that JSX never mounts stay ordinary functions, so they
// may be `async` or generator functions. The synchronous-body restriction only
// applies once a function is actually compiled as a component.
async function loadAsyncLabel() {
	return 'async-loaded';
}

const loadArrowLabel = async () => 'arrow-loaded';

function* generatedLabel() {
	yield 'from-generator';
}

export function AsyncHelperScene(props) @{
	const [label, setLabel] = useState('idle');
	<scene>
		<async-action
			value={label}
			onPress={() => {
				void loadAsyncLabel().then(setLabel);
			}}
		/>
		<arrow-action
			onPress={() => {
				void loadArrowLabel().then(setLabel);
			}}
		/>
		<generator-value value={generatedLabel().next().value} />
	</scene>
}
