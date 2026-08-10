import {
	Activity as ActivitySentinel,
	Fragment,
	createElement,
	use,
	type FragmentInstance,
	type OctaneNode,
} from 'octane';

type FragmentReference = { current: FragmentInstance | null };
const Activity = ActivitySentinel as unknown as
	(props: {
		mode: 'visible' | 'hidden';
		children?: OctaneNode;
	}) => null;

export function ActivityDescriptorFragment(props: {
	fragmentRef: FragmentReference;
	mode: 'visible' | 'hidden';
}) @{
	<main id="descriptor-activity-host">
		<Activity mode={props.mode}>{createElement(
			Fragment,
			{ ref: props.fragmentRef },
			createElement('button', { id: 'descriptor-activity-child' }, 'activity'),
		)}</Activity>
	</main>
}

function DescriptorSuspendGate(props: { promise: Promise<string> }) @{
	const value = use(props.promise);
	<span id="descriptor-suspend-value">{value as string}</span>
}

function DescriptorSuspenseContent(props: {
	fragmentRef: FragmentReference;
	promise: Promise<string>;
}) {
	return createElement(
		Fragment,
		{ ref: props.fragmentRef },
		createElement('button', { id: 'descriptor-suspense-child' }, 'suspense'),
		createElement(DescriptorSuspendGate, { promise: props.promise }),
	);
}

export function SuspenseDescriptorFragment(props: {
	fragmentRef: FragmentReference;
	promise: Promise<string>;
}) @{
	<main id="descriptor-suspense-host">
		@try {
			<DescriptorSuspenseContent fragmentRef={props.fragmentRef} promise={props.promise} />
		} @pending {
			<span id="descriptor-suspense-fallback">{'loading'}</span>
		}
	</main>
}
