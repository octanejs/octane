import { Activity } from 'octane';
import { ROW_INDICES } from './contract.mjs';
import type { Mode } from './model';
import type { RefProps } from './ref-model';

function RefLayer(props: RefProps) @{
	<>
		@if (props.depth > 0) {
			<RefLayer
				model={props.model}
				present={props.present}
				variant={props.variant}
				depth={props.depth - 1}
			/>
		} @else {
			@if (props.present) {
				@for (const index of ROW_INDICES; key index) {
					<button
						type="button"
						data-ref-row={String(index)}
						data-variant={String(props.variant)}
						ref={props.model.callbacks[props.variant][index]}
					>{`${index}:${props.variant}` as string}</button>
				}
			}
		}
	</>
}

export function RefControl(props: RefProps) @{
	<section data-ref-shell="">
		<RefLayer
			model={props.model}
			present={props.present}
			variant={props.variant}
			depth={props.depth}
		/>
	</section>
}

// Rendered only by the primed lanes, in a separate root that is either unmounted
// before measurement or deliberately kept hidden throughout the ordinary work.
export function ActivityRefPrimer(props: { mode: Mode }) @{
	<Activity mode={props.mode}>
		<span>prime Activity</span>
	</Activity>
}
