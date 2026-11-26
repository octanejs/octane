import { createFamily, createScope, signal$ } from 'octane/signals';
import { useSignal$ } from 'octane/signals/client';

export const renders = { local: 0, scoped: 0, family: 0, styled: 0 };

export const scope = createScope({ scopeKey: 'universal-scope' });
export const scopedCount$ = scope.signal$('count', 1);

export const rows = createFamily(scope, (id: number) => scope.signal$(null, id * 10));

export const color$ = signal$('red');
export const gap$ = signal$(4);

export const locals: { set: null | ((n: number) => void) } = { set: null };

export function Local() @{
	renders.local++;
	const local$ = useSignal$(0);
	locals.set = (n) => local$.set(n);
	<view count={local$}>{local$}</view>
}

export function Scoped() @{
	renders.scoped++;
	<view>{scopedCount$}</view>
}

export function Family() @{
	renders.family++;
	const row$ = rows.get(2);
	<view>{row$}</view>
}

export function Styled() @{
	renders.styled++;
	<view style={{ color: color$, gap: gap$, padding: 2 }} />
}

import { Activity, useState } from 'octane';

export const locals2: { handle: null | { get(): number } } = { handle: null };

function HandleLocal() @{
	const local$ = useSignal$(() => 3);
	locals2.handle = local$;
	<label>{local$}</label>
}

export const activity: { set: null | ((mode: 'visible' | 'hidden') => void) } = { set: null };

export function HiddenLocal() @{
	const [mode, setMode] = useState<'visible' | 'hidden'>('visible');
	activity.set = setMode;
	<view>
		<Activity mode={mode}>
			<HandleLocal />
		</Activity>
	</view>
}

export const shown: { set: null | ((on: boolean) => void) } = { set: null };

export function MaybeLocal() @{
	const [on, setOn] = useState(true);
	shown.set = setOn;
	<view>
		@if (on) {
			<HandleLocal />
		}
	</view>
}

export const restyle: { set: null | ((n: number) => void) } = { set: null };

export function Restyled() @{
	renders.styled++;
	const [pad, setPad] = useState(2);
	restyle.set = setPad;
	<view style={{ color: color$, padding: pad }} />
}

const order0$ = signal$(0);
const order1$ = signal$(1);
const order2$ = signal$(2);
export const orders = [order0$, order1$, order2$];

export function ProgramStyled() @{
	<view>
		@for (const order of orders; key orders.indexOf(order)) {
			<item style={{ order, color: 'red' }}>
				<label>{order}</label>
			</item>
		}
	</view>
}

export const handler$ = signal$(() => {});

export function EventHandle() @{
	<view onPress={handler$} />
}
