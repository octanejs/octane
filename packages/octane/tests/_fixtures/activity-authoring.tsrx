import * as Octane from 'octane';
import {
	Activity,
	Activity as PreservedActivity,
	createElement,
	use,
	useEffect,
	useState,
	type OctaneNode,
} from 'octane';

type Mode = 'visible' | 'hidden';

interface ChildProps {
	label: string;
	onEffect?: (event: string) => void;
}

interface ActivityProps extends ChildProps {
	mode: Mode;
	activityKey?: string;
	config?: { mode?: Mode; key?: string; children?: OctaneNode };
	boundary?: typeof Activity;
}

export function ActivityAuthoringChild(props: ChildProps) @{
	const [count, setCount] = useState(0);
	useEffect(() => {
		props.onEffect?.('mount:' + props.label);
		return () => props.onEffect?.('cleanup:' + props.label);
	}, [props.label]);
	<button data-activity-child={props.label} onClick={() => setCount((value) => value + 1)}>
		{props.label + ':' + count}
	</button>
}

export function DirectActivity(props: ActivityProps) @{
	<Activity mode={props.mode}>
		<ActivityAuthoringChild label={props.label} onEffect={props.onEffect} />
	</Activity>
}

export function AliasedActivity(props: ActivityProps) @{
	<PreservedActivity mode={props.mode}>
		<ActivityAuthoringChild label={props.label} onEffect={props.onEffect} />
	</PreservedActivity>
}

export function NamespacedActivity(props: ActivityProps) @{
	<Octane.Activity mode={props.mode}>
		<ActivityAuthoringChild label={props.label} onEffect={props.onEffect} />
	</Octane.Activity>
}

export function DynamicActivity(props: ActivityProps) @{
	const Boundary = props.boundary ?? Activity;
	<Boundary mode={props.mode}>
		<ActivityAuthoringChild label={props.label} onEffect={props.onEffect} />
	</Boundary>
}

export function DynamicSpreadActivity(props: ActivityProps) @{
	const Boundary = props.boundary ?? Activity;
	<Boundary {...props.config}>
		<ActivityAuthoringChild label={props.label} onEffect={props.onEffect} />
	</Boundary>
}

export function DynamicSpreadWinsActivity(props: ActivityProps) @{
	const Boundary = props.boundary ?? Activity;
	<Boundary key={props.activityKey} {...props.config}>
		<ActivityAuthoringChild label={props.label} onEffect={props.onEffect} />
	</Boundary>
}

export function DynamicExplicitWinsActivity(props: ActivityProps) @{
	const Boundary = props.boundary ?? Activity;
	<Boundary {...props.config} key={props.activityKey}>
		<ActivityAuthoringChild label={props.label} onEffect={props.onEffect} />
	</Boundary>
}

export function DynamicActivityConfigOrder(props: {
	config: { mode?: Mode; key?: string };
	readKey(): string;
	readMode(): Mode;
	readLabel(): string;
}) @{
	const Boundary = Activity;
	<Boundary key={props.readKey()} {...props.config} mode={props.readMode()}>
		<ActivityAuthoringChild label={props.readLabel()} />
	</Boundary>
}

export function SpreadActivity(props: ActivityProps) @{
	<Activity {...props.config}>
		<ActivityAuthoringChild label={props.label} onEffect={props.onEffect} />
	</Activity>
}

export function KeyedActivity(props: ActivityProps) @{
	<Activity key={props.activityKey} mode={props.mode}>
		<ActivityAuthoringChild label={props.label} onEffect={props.onEffect} />
	</Activity>
}

export function ActivityChildrenProp(props: ActivityProps) @{
	<Activity
		mode={props.mode}
		children={createElement(ActivityAuthoringChild, {
			label: props.label,
			onEffect: props.onEffect,
		})}
	/>
}

export function ActivityPropPrecedence(props: ActivityProps) @{
	<div>
		<Activity mode="hidden" {...props.config}>
			<ActivityAuthoringChild label="spread-wins" />
		</Activity>
		<Activity {...props.config} mode="hidden">
			<ActivityAuthoringChild label="explicit-wins" />
		</Activity>
		<Activity {...props.config} mode="visible">
			<ActivityAuthoringChild label="nested-wins" />
		</Activity>
	</div>
}

export function OrdinaryActivity(props: { children?: OctaneNode; mode?: string }) @{
	<div data-ordinary-activity={props.mode}>{props.children}</div>
}

export function ShadowedActivity(props: ChildProps) @{
	const Activity = OrdinaryActivity;
	<Activity mode="hidden">
		<ActivityAuthoringChild label={props.label} />
	</Activity>
}

export function ActivityDirectiveChildren(props: ActivityProps & { show: boolean }) @{
	<Activity {...props.config}>
		@if (props.show) {
			<ActivityAuthoringChild label={props.label} />
		} @else {
			<span data-activity-empty>{'empty'}</span>
		}
	</Activity>
}

function ActivityRenderLoopChild(props: { pending?: Promise<never> }) @{
	const [value, setValue] = useState(0);
	// Bounded so a missing runtime guard fails the test instead of hanging it.
	if (value < 80) setValue(value + 1);
	if (props.pending !== undefined) use(props.pending);
	<span>{value as number}</span>
}

export function ActivityRenderLoop(props: { pending?: Promise<never> }) @{
	<Activity mode="hidden">
		<ActivityRenderLoopChild pending={props.pending} />
	</Activity>
}
