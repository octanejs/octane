/** @jsxImportSource octane */
import * as Octane from 'octane';
import { Activity as PreservedActivity, type OctaneNode } from 'octane';

function Ordinary(props: { mode?: string; children?: OctaneNode }) {
	return <div data-ordinary-activity={props.mode}>{props.children}</div>;
}

const Activity = Ordinary;

export function ModuleShadowedActivity() {
	return (
		<Activity mode="hidden">
			<span>ordinary</span>
		</Activity>
	);
}

const moduleCallbackChildren = [Ordinary].map((PreservedActivity) => (
	<PreservedActivity key="callback" mode="hidden">
		<span>callback</span>
	</PreservedActivity>
));

const namespaceCallbackChildren = [{ Activity: Ordinary }].map((Octane) => (
	<Octane.Activity key="namespace" mode="hidden">
		<span>namespace</span>
	</Octane.Activity>
));

export function CallbackShadowedActivity() {
	return (
		<section>
			{moduleCallbackChildren}
			{namespaceCallbackChildren}
		</section>
	);
}

export function BlockShadowedActivity(props: { ordinary: boolean }) {
	if (props.ordinary) {
		const PreservedActivity = Ordinary;
		return (
			<PreservedActivity mode="hidden">
				<span>block</span>
			</PreservedActivity>
		);
	}
	return (
		<Octane.Activity mode="visible">
			<span>builtin</span>
		</Octane.Activity>
	);
}
