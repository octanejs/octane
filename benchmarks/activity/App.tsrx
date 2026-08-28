import { Activity, useEffect, useLayoutEffect, useState } from 'octane';
import { GROUPS, ROW_INDICES } from './contract.mjs';
import type { AppProps, Model } from './model';

type RowProps = { model: Model; index: number; generation: number };

function Row(props: RowProps) @{
	const [local, setLocal] = useState(0);
	const model = props.model;
	const index = props.index;
	useLayoutEffect(() => model.connectLayout(index, setLocal), [model, index]);
	useEffect(() => model.connectPassive(index), [model, index]);
	<article
		data-row={String(index)}
		data-generation={String(props.generation)}
		data-local={String(local)}
		style={model.displayStyle}
	>
		<button
			type="button"
			onClick={() => setLocal((value) => value + 1)}
		>{`${index}:${props.generation}:${local}` as string}</button>
		<input aria-label={`Draft ${index}`} defaultValue={`row-${index}`} />
	</article>
}

function Rows(props: { model: Model; indices: readonly number[]; generation: number }) @{
	<>
		@for (const index of props.indices; key index) {
			<Row model={props.model} index={index} generation={props.generation} />
		}
	</>
}

// This exact authored source is compiled for both targets. The React build
// resolves the public `octane` import above to React and uses @tsrx/react plus
// the repository's production React Compiler preset.
export function App(props: AppProps) @{
	<section data-shell="activity">
		<output data-tick="">{String(props.tick) as string}</output>
		@if (props.shape === 'plain') {
			<Rows model={props.model} indices={ROW_INDICES} generation={props.generation} />
		} @else {
			<Activity mode={props.mode}>
				@if (props.shape === 'nested') {
					@for (const group of GROUPS; key group.id) {
						<Activity mode={props.innerMode}>
							<Rows model={props.model} indices={group.indices} generation={props.generation} />
						</Activity>
					}
				} @else {
					<Rows model={props.model} indices={ROW_INDICES} generation={props.generation} />
				}
			</Activity>
		}
	</section>
}
