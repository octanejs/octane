import { signal$ } from 'octane/signals';

export const ticks$ = signal$(0);
export const tone$ = signal$('calm');
export const renders = { counter: 0, row: 0, reader: 0 };

export function Counter() @{
	renders.counter++;
	<view tone={tone$}>
		<label>Ticks: {ticks$}</label>
	</view>
}

const cell0$ = signal$(0);
const cell1$ = signal$(1);
const cell2$ = signal$(2);
const cell3$ = signal$(3);
export const cells = [cell0$, cell1$, cell2$, cell3$];

export function Rows() @{
	<view>
		@for (const cell of cells; key cells.indexOf(cell)) {
			<item value={cell}>{cell}</item>
		}
	</view>
}

export function Reader() @{
	renders.reader++;
	<label>{ticks$.get() * 2}</label>
}

import { derived$ } from 'octane/signals';

export const doubled$ = derived$(() => ticks$.get() * 2);
export const gate$ = signal$(true);

function Badge(props: { label: any }) @{
	<badge label={props.label}>{props.label}</badge>
}

export function Forwarded() @{
	renders.counter++;
	<view>
		<Badge label={doubled$} />
	</view>
}

export function Gated() @{
	renders.reader++;
	<label>{gate$.get() ? ticks$.get() : 'off'}</label>
}
