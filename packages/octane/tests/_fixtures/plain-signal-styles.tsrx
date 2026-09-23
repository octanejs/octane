import type { SignalHandle } from 'octane/signals';
import 'octane/signals';

export function PlainStyles(props: { offset: number; colored: boolean }) @{
	<div
		style={{
			display: 'flex',
			marginTop: props.offset + 0,
			color: props.colored ? 'red' : '',
		}}
	>
		<input defaultValue="keep edit" />
		<span>{'styled'}</span>
	</div>
}

export function ReadStyles(props: { source$: SignalHandle<number> }) @{
	<div
		style={{
			display: 'flex',
			marginTop: props.source$.get() + 0,
			'--position': String(props.source$.get()),
		}}
	>
		<span>{'styled'}</span>
	</div>
}

export function GetterStyles(props: { readonly position: number }) @{
	<div style={{ display: 'flex', marginTop: props.position + 0 }}>
		<span>{'styled'}</span>
	</div>
}

export function AccessorStyles(props: { source$: SignalHandle<number> }) @{
	<div
		style={{
			display: 'flex',
			get marginTop() {
				return props.source$.get();
			},
		}}
	>
		<span>{'styled'}</span>
	</div>
}

export function SpreadStyles(props: { source$: SignalHandle<number> }) @{
	<div style={{ display: 'flex', ...{ marginTop: props.source$ } }}>
		<span>{'styled'}</span>
	</div>
}

export function ReturnedHandleStyles(props: { palette: { get: () => SignalHandle<number> } }) @{
	<div style={{ display: 'flex', marginTop: props.palette.get() }}>
		<span>{'styled'}</span>
	</div>
}

interface PaletteProps {
	palette: { get: () => SignalHandle<number> };
	enabled: boolean;
}

export function ConditionalReturnedHandleStyles(props: PaletteProps) @{
	<div style={{ marginTop: props.enabled ? props.palette.get() : 0 }} />
}

export function LogicalReturnedHandleStyles(props: PaletteProps) @{
	<div style={{ marginTop: (props.enabled ? null : 0) ?? props.palette.get() }} />
}

export function SequenceReturnedHandleStyles(props: PaletteProps) @{
	<div style={{ marginTop: (props.enabled, props.palette.get()) }} />
}

export function OptionalReturnedHandleStyles(props: PaletteProps) @{
	<div style={{ marginTop: props.palette.get?.() }} />
}

export function NestedHandleStyles(props: { outer$: SignalHandle<SignalHandle<number>> }) @{
	<div style={{ marginTop: props.outer$.get() }} />
}

export function InheritedHandleStyles(props: { source$: SignalHandle<number> }) @{
	<div
		style={{
			marginTop: {
				__proto__: props.source$,
				get: props.source$.get.bind(props.source$),
			} as unknown as SignalHandle<number>,
		}}
	/>
}

export function GuardedReadStyles(props: { source$: SignalHandle<number> }) @{
	<section>
		@try {
			<ReadStyles source$={props.source$} />
		} @pending {
			<p>{'waiting'}</p>
		} @catch (_error) {
			<p>{'failed'}</p>
		}
	</section>
}

export function PlainSvgStyles(props: { offset: number }) @{
	<svg style={{ opacity: props.offset / 10, '--position': props.offset + 0 }} />
}

export function OpaqueStyles(props: { color: string; offset: unknown }) @{
	<div style={{ display: 'flex', color: props.color, marginTop: props.offset as number }}>
		<span>{'styled'}</span>
	</div>
}
