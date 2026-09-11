import { useState } from 'octane';
import { displayValue } from './style-literal-values.js';

const IDS = Array.from({ length: 1000 }, (_, index) => index);

function SingleRow(props) @{
	<tr class={props.selected ? 'selected' : ''} onClick={props.select}>
		<td
			style={{
				fontStyle: 'normal',
				fontWeight: props.version >= 0 && props.selected ? 'bold' : 'normal',
			}}
		>{String(props.id)}</td>
	</tr>
}

function MultiRow(props) @{
	<tr class={props.selected ? 'selected' : ''} onClick={props.select}>
		<td
			style={{
				fontStyle: 'normal',
				fontWeight: props.version >= 0 && props.selected ? 'bold' : 'normal',
				color: props.version >= 0 && props.selected ? 'red' : 'black',
			}}
		>{String(props.id)}</td>
	</tr>
}

function GenericRow(props) @{
	const style = {
		fontStyle: 'normal',
		fontWeight: props.version >= 0 && props.selected ? 'bold' : 'normal',
		color: props.version >= 0 && props.selected ? 'red' : 'black',
	};
	<tr class={props.selected ? 'selected' : ''} onClick={props.select}>
		<td style={style}>{String(props.id)}</td>
	</tr>
}

function InterleavedRow(props) @{
	const active = props.version >= 0 && props.selected;
	<tr class={props.selected ? 'selected' : ''} onClick={props.select}>
		<td
			style={{
				left: active ? 8 : 0,
				display: displayValue,
				right: active ? 4 : 0,
				opacity: 0.5,
			}}
		>{String(props.id)}</td>
	</tr>
}

export function StyleLiteralWork(props) @{
	const [ids, setIds] = useState([]);
	const [selected, setSelected] = useState(-1);
	const [version, setVersion] = useState(0);
	<div>
		<button id="run" onClick={() => setIds(IDS)}>{'Create 1,000 rows'}</button>
		<button
			id="update"
			onClick={() => setVersion((current) => current + 1)}
		>{'Unrelated update'}</button>
		<table>
			<tbody>
				@if (props.mode === 'single') {
					@for (const id of ids; key id) {
						<SingleRow
							id={id}
							selected={selected === id}
							version={version}
							select={() => setSelected(id)}
						/>
					}
				} @else if (props.mode === 'multi') {
					@for (const id of ids; key id) {
						<MultiRow
							id={id}
							selected={selected === id}
							version={version}
							select={() => setSelected(id)}
						/>
					}
				} @else if (props.mode === 'generic') {
					@for (const id of ids; key id) {
						<GenericRow
							id={id}
							selected={selected === id}
							version={version}
							select={() => setSelected(id)}
						/>
					}
				} @else {
					@for (const id of ids; key id) {
						<InterleavedRow
							id={id}
							selected={selected === id}
							version={version}
							select={() => setSelected(id)}
						/>
					}
				}
			</tbody>
		</table>
	</div>
}
