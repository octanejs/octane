import { createPortal } from 'octane';

// `<tsrx>…</tsrx>` at expression position is gone. The new TSRX equivalent
// is an arrow returning a `@{ }` block — same semantics: the body is
// rendered wherever the consumer (e.g. createPortal) decides.

export function PortalledWithTsrx(props: { label: string; target: HTMLElement }) @{
	const slot = () => @{
		<div class="from-tsrx">{props.label as string}</div>
	};
	<div class="host">{createPortal(slot, props.target)}</div>
}

// Inline arrow returning a @{ } block — directly as createPortal's body argument.
export function InlineTsrx(props: { target: HTMLElement }) @{
	<div class="host">
		{createPortal(() => @{
			<span class="inline">{'inline'}</span>
		}, props.target)}
	</div>
}

// A sub-template's params and locals, and the enclosing component's locals,
// must reach the control-flow arms hoisted out of it.
export function SubtemplateParamBranch(props: { value: string; enabled: boolean }) @{
	const Child = ({ label, show }: { label: string; show: boolean }) => @{
		@if (show) {
			<b>{label as string}</b>
		} @else {
			<i>{label as string}</i>
		}
	};
	<div class="param-host">
		<Child label={props.value} show={props.enabled} />
	</div>
}

export function NestedTemplateReadsOuterLocal(props: { value: string; enabled: boolean }) @{
	const outer = props.value;
	function Inner({ show }: { show: boolean }) @{
		const own = outer.length;
		@if (show) {
			<b>{outer + ':' + own}</b>
		} @else {
			<i>{outer as string}</i>
		}
	}
	<div class="nested-host">
		<Inner show={props.enabled} />
	</div>
}

export function PortalBranchReadsOuterLocal(props: {
	value: string;
	enabled: boolean;
	target: HTMLElement;
}) @{
	const outer = props.value;
	<div class="portal-host">
		{createPortal(() => @{
			@if (props.enabled) {
				<b>{outer as string}</b>
			} @else {
				<i>{outer as string}</i>
			}
		}, props.target)}
	</div>
}
