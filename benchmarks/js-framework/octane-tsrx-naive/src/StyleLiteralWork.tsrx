import { useState } from 'octane';
import {
	displayValue,
	recordColor,
	styleBase,
	styleExtra,
	styleCollision,
} from './style-literal-values.js';

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

function DuplicateStaticRow(props) @{
	<tr class={props.selected ? 'selected' : ''} onClick={props.select}>
		<td
			style={{
				color: recordColor(props.version >= 0 ? props.color : 'transparent'),
				color: 'red',
				background: props.background,
			}}
		>{String(props.id)}</td>
	</tr>
}

function DuplicateDynamicRow(props) @{
	<tr class={props.selected ? 'selected' : ''} onClick={props.select}>
		<td
			style={{
				color: 'red',
				color: recordColor(props.version >= 0 ? props.color : 'transparent'),
				background: props.background,
			}}
		>{String(props.id)}</td>
	</tr>
}

function LeadingSpreadRow(props) @{
	<tr class={props.selected ? 'selected' : ''} onClick={props.select}>
		<td
			style={{
				...styleBase,
				...styleExtra,
				fontWeight: props.version >= 0 && props.selected ? 'bold' : 'normal',
				color: props.version >= 0 && props.selected ? 'red' : 'black',
			}}
		>{String(props.id)}</td>
	</tr>
}

function LeadingGenericRow(props) @{
	const style = {
		...styleBase,
		...styleExtra,
		fontWeight: props.version >= 0 && props.selected ? 'bold' : 'normal',
		color: props.version >= 0 && props.selected ? 'red' : 'black',
	};
	<tr class={props.selected ? 'selected' : ''} onClick={props.select}>
		<td style={style}>{String(props.id)}</td>
	</tr>
}

function CollisionSpreadRow(props) @{
	<tr class={props.selected ? 'selected' : ''} onClick={props.select}>
		<td
			style={{
				...styleCollision,
				...styleExtra,
				fontWeight: props.version >= 0 && props.selected ? 'bold' : 'normal',
				color: props.version >= 0 && props.selected ? 'red' : 'black',
			}}
		>{String(props.id)}</td>
	</tr>
}

function CollisionGenericRow(props) @{
	const style = {
		...styleCollision,
		...styleExtra,
		fontWeight: props.version >= 0 && props.selected ? 'bold' : 'normal',
		color: props.version >= 0 && props.selected ? 'red' : 'black',
	};
	<tr class={props.selected ? 'selected' : ''} onClick={props.select}>
		<td style={style}>{String(props.id)}</td>
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
				} @else if (props.mode === 'leadingSpread') {
					@for (const id of ids; key id) {
						<LeadingSpreadRow
							id={id}
							selected={selected === id}
							version={version}
							select={() => setSelected(id)}
						/>
					}
				} @else if (props.mode === 'leadingGeneric') {
					@for (const id of ids; key id) {
						<LeadingGenericRow
							id={id}
							selected={selected === id}
							version={version}
							select={() => setSelected(id)}
						/>
					}
				} @else if (props.mode === 'collisionSpread') {
					@for (const id of ids; key id) {
						<CollisionSpreadRow
							id={id}
							selected={selected === id}
							version={version}
							select={() => setSelected(id)}
						/>
					}
				} @else if (props.mode === 'collisionGeneric') {
					@for (const id of ids; key id) {
						<CollisionGenericRow
							id={id}
							selected={selected === id}
							version={version}
							select={() => setSelected(id)}
						/>
					}
				} @else if (props.mode === 'interleaved') {
					@for (const id of ids; key id) {
						<InterleavedRow
							id={id}
							selected={selected === id}
							version={version}
							select={() => setSelected(id)}
						/>
					}
				} @else if (props.mode === 'duplicateStatic') {
					@for (const id of ids; key id) {
						<DuplicateStaticRow
							id={id}
							selected={selected === id}
							version={version}
							color={version >= 0 && selected === id ? 'blue' : 'black'}
							background={version >= 0 && selected === id ? 'yellow' : 'white'}
							select={() => setSelected(id)}
						/>
					}
				} @else {
					@for (const id of ids; key id) {
						<DuplicateDynamicRow
							id={id}
							selected={selected === id}
							version={version}
							color={version >= 0 && selected === id ? 'blue' : 'black'}
							background={version >= 0 && selected === id ? 'yellow' : 'white'}
							select={() => setSelected(id)}
						/>
					}
				}
			</tbody>
		</table>
	</div>
}
