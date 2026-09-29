import { createPortal } from 'octane';

// A `() => @{ … }` sub-template compiles into a helper inside the component,
// but its control-flow arms and lifted event handlers are hoisted to module
// scope. Every name visible in the sub-template, its own and the component's,
// has to reach them through the env tuple.

export function ValueArm({ value }: { value: string }) @{
	const el = <section class="value-arm">
		{() => @{
			const trimmed = value.trim();
			@if (trimmed !== '') {
				<b>{trimmed as string}</b>
			} @else {
				<i>{'empty'}</i>
			}
		}}
	</section>;
	<div>{el}</div>
}

export function OutputRows(props: { items: string[]; loud: boolean }) @{
	<section class="output-rows">
		{() => @{
			const suffix = props.loud ? '!' : '.';
			<ul>
				@for (const item of props.items; key item) {
					<li>{item + suffix as string}</li>
				}
			</ul>
		}}
	</section>
}

// Production compiles lift a multi-statement handler to module scope and pass
// it the locals it reads.
export function OutputHandler(props: { loud: boolean; log: string[] }) @{
	<section class="output-handler">
		{() => @{
			const suffix = props.loud ? '!' : '.';
			<button
				onClick={(event) => {
					props.log.push(suffix);
					props.log.push(event.type);
				}}
			>{'log' + suffix as string}</button>
		}}
	</section>
}

export function ParamSwitchTry(props: { mode: string }) @{
	const Child = ({ mode }: { mode: string }) => @{
		const tone = mode.toUpperCase();
		<>
			@switch (mode) {
				@case 'a': {
					<b>{tone as string}</b>
				}
				@default: {
					<i>{tone as string}</i>
				}
			}
			@try {
				<u>{tone as string}</u>
			} @catch (error) {
				<s>{'failed'}</s>
			}
		</>
	};
	<div class="switch-try">
		<Child mode={props.mode} />
	</div>
}

// A portal body is compiled in place rather than hoisted into the component,
// and the handler it lifts reads both a component local and its own.
export function PortalHandler(props: { value: string; log: string[]; target: HTMLElement }) @{
	<div class="portal-handler">{createPortal(
		() => @{
			const tag = props.value + '#';
			<button
				class="portal-handler-action"
				onClick={(event) => {
					props.log.push(tag);
					props.log.push(event.type);
				}}
			>{tag as string}</button>
		},
		props.target,
	)}</div>
}
