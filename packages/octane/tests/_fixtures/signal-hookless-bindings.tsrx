import type { SignalHandle } from 'octane/signals';

function HooklessKey(props: { key$: SignalHandle<string> }) @{
	<output class="hookless-key" title={props.key$}>
		{props.key$}
	</output>
}

function HooklessValue(props: { value$: SignalHandle<string> }) @{
	<i class="hookless-value">{props.value$}</i>
}

// Hookless components that receive signal handles render without a Block of
// their own: a transition that writes what they present renders the Block
// that owns them.
export function HooklessBindings(props: {
	key$: SignalHandle<string>;
	value$: SignalHandle<string>;
}) @{
	<section>
		<HooklessKey key$={props.key$} />
		<HooklessValue value$={props.value$} />
	</section>
}

export function HooklessArm(props: { show: boolean; key$: SignalHandle<string> }) @{
	<section>
		@if (props.show) {
			<output class="arm-key" title={props.key$}>
				{props.key$}
			</output>
		}
	</section>
}
