import { use, useState } from 'octane';

export interface Row {
	id: number;
	label: string;
}

export const rows = (ids: number[]): Row[] => ids.map((id) => ({ id, label: 'row-' + id }));

/**
 * A keyed list whose root render applies `steps` one reconcile at a time, as
 * render-phase updates of one attempt, then suspends on `gate`. Until the gate
 * settles, the root keeps the committed rows. `before` is committed first by
 * its own click, so a later held render starts from a reordered list.
 */
export function HeldRows({
	initial,
	before,
	steps,
	gate,
}: {
	initial: Row[];
	before?: Row[];
	steps: Row[][];
	gate: Promise<string>;
}) @{
	const [items, setItems] = useState(initial);
	const [stage, setStage] = useState(0);
	<div>
		<button
			id="before"
			onClick={() => {
				if (before !== undefined) setItems(before);
			}}
		>{'before'}</button>
		<button
			id="go"
			onClick={() => {
				setItems(steps[0]);
				setStage(1);
			}}
		>{'go'}</button>
		<ul>
			@for (const item of items; key item.id) {
				<li class="row">{item.label}</li>
			}
		</ul>
		@{
			if (stage > 0 && stage < steps.length) {
				setItems(steps[stage]);
				setStage(stage + 1);
			} else if (stage > 0 && stage === steps.length) use(gate);
		}
	</div>
}
