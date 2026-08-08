import type { RegistryStoreOptions, StoreRegistry } from '@livestore/livestore';
import {
	StoreRegistryProvider,
	useStore,
	useStoreRegistry,
	withReactApi,
} from '@octanejs/livestore';
import { startTransition, useActionState } from 'octane';
import { useRcResource } from '../../src/useRcResource';

type Resource = { id: number };

export function ResourceReader(props: {
	scope: object;
	resourceKey: string;
	create: () => Resource;
	dispose: (resource: Resource) => void;
}) @{
	const resource = useRcResource(props.scope, props.resourceKey, props.create, props.dispose);
	<div class="resource">{resource.id as string}</div>
}

export function TwoResourceReaders(props: {
	scope: object;
	showSecond: boolean;
	create: () => Resource;
	dispose: (resource: Resource) => void;
}) @{
	<div>
		<ResourceReader
			scope={props.scope}
			resourceKey="shared"
			create={props.create}
			dispose={props.dispose}
		/>
		@if (props.showSecond) {
			<ResourceReader
				scope={props.scope}
				resourceKey="shared"
				create={props.create}
				dispose={props.dispose}
			/>
		}
	</div>
}

function RegistryValue(props: { override?: StoreRegistry; expected?: StoreRegistry }) @{
	const registry = useStoreRegistry(props.override);
	<div id="registry">
		{registry === props.override
			? 'override'
			: registry === props.expected
				? 'context'
				: 'unexpected'}
	</div>
}

export function ContextRegistryReader(props: { registry: StoreRegistry }) @{
	<StoreRegistryProvider storeRegistry={props.registry}>
		<RegistryValue expected={props.registry} />
	</StoreRegistryProvider>
}

export function OverrideRegistryReader(props: {
	registry: StoreRegistry;
	override: StoreRegistry;
}) @{
	<StoreRegistryProvider storeRegistry={props.registry}>
		<RegistryValue override={props.override} />
	</StoreRegistryProvider>
}

export function MissingRegistryReader() @{
	<RegistryValue />
}

function StoreValue(props: { options: RegistryStoreOptions<any> }) @{
	const store = useStore(props.options);
	<div id="store">{(store as any).id as string}</div>
}

export function SuspenseStoreReader(props: {
	registry: StoreRegistry;
	options: RegistryStoreOptions<any>;
}) @{
	<StoreRegistryProvider storeRegistry={props.registry}>
		@try {
			<StoreValue options={props.options} />
		} @pending {
			<div id="fallback">{'loading'}</div>
		}
	</StoreRegistryProvider>
}

/** Combines useStore with useActionState to test transition compatibility. */
function StoreWithActionState(props: { options: RegistryStoreOptions<any> }) @{
	useStore(props.options);
	const [state, dispatch, isPending] = useActionState(
		function action(_prev: string | undefined, value: string): string {
			return value;
		},
		undefined as string | undefined,
	);
	function onSubmit() {
		startTransition(function dispatchUpdate() {
			dispatch('updated');
		});
	}
	<div>
		<button id="submit" onClick={onSubmit}>{'Submit'}</button>
		<div id="state">{(state ?? 'none') as string}</div>
		<div id="pending">{String(isPending)}</div>
	</div>
}

export function SuspenseStoreWithActionState(props: {
	registry: StoreRegistry;
	options: RegistryStoreOptions<any>;
}) @{
	<StoreRegistryProvider storeRegistry={props.registry}>
		@try {
			<StoreWithActionState options={props.options} />
		} @pending {
			<div id="fallback">{'loading'}</div>
		}
	</StoreRegistryProvider>
}

export function augmentStore(store: object) {
	return withReactApi(store as any);
}
