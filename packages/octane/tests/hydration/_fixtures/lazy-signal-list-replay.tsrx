import { Hydrate, useLayoutEffect } from 'octane';
import type { ComponentBody } from 'octane';
import { condition } from 'octane/hydration';
import { useSignal$ } from 'octane/signals/client';
import type { WritableSignal } from 'octane/signals';
import 'octane/signals';

type View = { reversed: boolean; loading: boolean; rows: { id: string; label: string }[] };
type Props = {
	view: View;
	expose?: (view$: WritableSignal<View>) => void;
	onMount?: () => (() => void);
	onClick?: () => void;
};

export function Sections(props: Props) @{
	const view$ = useSignal$(() => props.view);
	props.expose?.(view$);
	useLayoutEffect(() => props.onMount?.());
	const view = view$.get();
	const sections = view.reversed
		? ['email', 'phone', 'divider', 'providers']
		: ['providers', 'divider', 'email', 'phone'];
	<div data-view="sections">
		<h2>Sign in</h2>
		@for (const section of sections; key section) {
			<>
				@if (section === 'providers') {
					<div data-row="providers">
						<button onClick={props.onClick}>Provider</button>
					</div>
				}
				@if (section === 'divider') {
					<div data-row="divider">
						<span>Or</span>
					</div>
				}
				@if (section === 'email') {
					<form data-row="email">
						<input type="email" />
					</form>
				}
				@if (section === 'phone') {
					<form data-row="phone">
						<select>
							<option>US</option>
						</select>
						<input type="tel" />
					</form>
				}
			</>
		}
	</div>
}

export function Adjacent(props: Props) @{
	const view$ = useSignal$(() => props.view);
	props.expose?.(view$);
	useLayoutEffect(() => props.onMount?.());
	const view = view$.get();
	<ul data-view="adjacent">
		@if (view.loading) {
			<li data-loading="true">Loading</li>
		}
		@for (const row of view.rows; key row.id) {
			<li data-row={row.id}>
				<button onClick={props.onClick}>{row.label as string}</button>
			</li>
		}
	</ul>
}

export function Deferred(props: Props & { Component: ComponentBody<Props> }) @{
	<Hydrate split={false} when={condition(true)}>
		<props.Component
			view={props.view}
			expose={props.expose}
			onMount={props.onMount}
			onClick={props.onClick}
		/>
	</Hydrate>
}
