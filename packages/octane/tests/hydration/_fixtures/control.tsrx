import { useState } from 'octane';

// SSR Phase 6 (M3) — @if / @switch hydration. The server wraps the TAKEN branch
// in a `<!--[-->…<!--]-->` range; the client adopts it as the slot, brackets the
// already-present branch content with branch markers, and adopts it via the
// hydration cursor (no content rebuild) — then the branch's handlers work.

export function Toggle(props) @{
	const [n, setN] = useState(0);
	<div id="toggle">
		@if (props.on) {
			<button id="hit" class="on" onClick={() => setN(n + 1)}>{'on:' + n as string}</button>
		} @else {
			<span class="off">{'off' as string}</span>
		}
	</div>
}

export function Pick(props) @{
	<div id="pick">
		@switch (props.k) {
			@case 'a': {
				<span class="a">{'AAA' as string}</span>
			}
			@case 'b': {
				<span class="b">{'BBB' as string}</span>
			}
			@default: {
				<span class="d">{'???' as string}</span>
			}
		}
	</div>
}

function FragmentTags(props: {
	provisional: boolean;
	isLeg: boolean;
	condition: 'sunny' | 'rainy' | 'none';
}) @{
	<>
		@if (props.provisional) {
			<span class="tag-confirm">{'confirm'}</span>
		}
		@if (props.isLeg) {
			<span class="tag-mode">{'transit'}</span>
		}
		@if (props.condition === 'sunny') {
			<span class="tag-weather">{'sunny'}</span>
		}
		@if (props.condition === 'rainy') {
			<span class="tag-weather">{'rainy'}</span>
		}
	</>
}

function FragmentRow(props: {
	name: string;
	a: boolean;
	b: boolean;
	condition: 'sunny' | 'rainy' | 'none';
}) @{
	<>
		<div class="time-row">
			<span class="place">{props.name as string}</span>
			<FragmentTags provisional={props.a} isLeg={props.b} condition={props.condition} />
		</div>
	</>
}

type FragmentRowData = {
	id: string;
	name: string;
	a: boolean;
	b: boolean;
	condition: 'sunny' | 'rainy' | 'none';
};

export function FragmentIfRows() @{
	const rows: FragmentRowData[] = [
		{ id: 'r1', name: 'A', a: true, b: true, condition: 'none' },
		{ id: 'r2', name: 'B', a: true, b: false, condition: 'sunny' },
	];
	<ol class="timeline">
		@for (const row of rows; key row.id) {
			<li>
				<FragmentRow name={row.name} a={row.a} b={row.b} condition={row.condition} />
			</li>
		}
	</ol>
}
