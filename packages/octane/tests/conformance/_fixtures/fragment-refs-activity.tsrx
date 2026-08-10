import {
	Activity as ActivitySentinel,
	Fragment,
	createPortal,
	type FragmentInstance,
	type OctaneNode,
} from 'octane';

type ActivityMode = 'visible' | 'hidden';
type FragmentReference = { current: FragmentInstance | null };
const Activity = ActivitySentinel as unknown as
	(props: {
		mode: ActivityMode;
		children?: OctaneNode;
	}) => null;

export function ActivityFragmentGroup(props: {
	mode: ActivityMode;
	fragmentRef: FragmentReference;
	innerRef: FragmentReference;
	wrappedRef: FragmentReference;
}) @{
	<main id="activity-fragment-host">
		<Fragment ref={props.fragmentRef}>
			<Activity mode={props.mode}>
				<button id="activity-first" type="button">{'first'}</button>
				<Fragment ref={props.innerRef}>
					<button id="activity-nested" type="button">{'nested'}</button>
				</Fragment>
				<div id="activity-wrapped">
					<Fragment ref={props.wrappedRef}>
						<button id="activity-wrapped-child" type="button">{'wrapped'}</button>
					</Fragment>
				</div>
				{'activity text' as string}
			</Activity>
			<button id="activity-visible" type="button">{'visible'}</button>
			<div id="authored-hidden" style="display: none">{'authored'}</div>
			<Activity mode={props.mode}>
				<button id="activity-last" type="button">{'last'}</button>
			</Activity>
		</Fragment>
	</main>
}

export function NestedActivityFragmentGroup(props: {
	outerMode: ActivityMode;
	innerMode: ActivityMode;
	fragmentRef: FragmentReference;
}) @{
	<main id="nested-activity-fragment-host">
		<Fragment ref={props.fragmentRef}>
			<Activity mode={props.outerMode}>
				<Activity mode={props.innerMode}>
					<button id="double-hidden" type="button">{'nested'}</button>
				</Activity>
			</Activity>
			<button id="nested-visible" type="button">{'visible'}</button>
		</Fragment>
	</main>
}

export function ActivityFragmentPortal(props: {
	mode: ActivityMode;
	fragmentRef: FragmentReference;
	target: Element;
}) @{
	<main id="activity-portal-host">
		<Fragment ref={props.fragmentRef}>
			<button id="activity-portal-inline" type="button">{'inline'}</button>
			<Activity mode={props.mode}>{createPortal(
				<button id="activity-portal-child" type="button">{'portal'}</button>,
				props.target,
			)}</Activity>
		</Fragment>
	</main>
}
