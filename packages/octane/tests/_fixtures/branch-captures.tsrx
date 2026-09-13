import { useState } from 'octane';

export function NestedCaptures(props) @{
	<section>
		@if (props.read()) {
			<div class="outer">
				@if (props.inner) {
					const [count, setCount] = useState(0);
					<button
						onClick={() => {
							props.onPick(props.label);
							setCount(count + 1);
						}}
					>
						{props.label + ':' + count}
					</button>
				}
			</div>
		}
	</section>
}

export function ShadowedCaptures(props) @{
	const label = props.label;
	<section>
		@if (props.visible) {
			const label = 'inner:' + props.label;
			<div>
				@if (props.inner) {
					<button onClick={() => props.onPick(label)}>{label}</button>
				}
			</div>
		} @else {
			<span>{label}</span>
		}
	</section>
}

export function FoldedCaptures(props) {
	const label = props.label;
	return <section>
		@if (props.read()) {
			<button onClick={() => props.onPick(label)}>{label}</button>
		}
	</section>;
}

export function ElseCaptures(props) @{
	const label = props.label;
	<section>
		{props.read() ? null : <button onClick={() => props.onPick(label)}>{label}</button>}
	</section>
}

export function ReorderedCaptures(props) @{
	<section>
		@for (const item of props.items; key item.id) {
			<div data-id={item.id}>
				@if (props.visible) {
					@if (props.inner) {
						<button onClick={() => props.onPick(item.label + ':' + props.label)}>
							{item.label + ':' + props.label}
						</button>
					}
				}
			</div>
		}
	</section>
}

export function ArgumentMutation(props) @{
	<section>
		@if (props.visible) {
			props.mutate(arguments);
			<div>
				@if (props.inner) {
					<span>{props.label}</span>
				}
			</div>
		}
	</section>
}

export function NestedArgumentMutation(props) @{
	<section>
		@if (props.visible) {
			<div>
				@if (props.inner) {
					props.mutate(arguments);
					<span>{props.label}</span>
				}
				@if (props.inner) {
					<p>{props.label}</p>
				}
			</div>
		}
	</section>
}

export function EvalArgumentMutation(props) @{
	<section>
		@if (props.visible) {
			eval('props.mutate(arguments)');
			<div>
				@if (props.inner) {
					<span>{props.label}</span>
				}
			</div>
		}
	</section>
}
