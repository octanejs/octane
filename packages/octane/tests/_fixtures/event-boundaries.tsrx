declare module 'octane/jsx-runtime' {
	namespace Octane {
		namespace JSX {
			interface IntrinsicElements {
				'event-probe-host': IntrinsicElements['div'];
			}
		}
	}
}

export type EventProbeProps = {
	record(label: string, event: Event): void;
};

export function SameRoot(props: EventProbeProps) @{
	<section
		data-name="parent"
		onClickCapture={(event) => props.record('parent:capture', event)}
		onClick={(event) => props.record('parent:bubble', event)}
	>
		<button
			data-name="target"
			data-target
			onClickCapture={(event) => props.record('target:capture', event)}
			onClick={(event) => props.record('target:bubble', event)}
		>Click</button>
	</section>
}

export function OuterNested(props: EventProbeProps) @{
	<section
		data-name="outer"
		onClickCapture={(event) => props.record('outer:capture', event)}
		onClick={(event) => props.record('outer:bubble', event)}
	>
		<div data-name="middle" data-middle>
			<div data-inner-root />
		</div>
	</section>
}

export function Inner(props: EventProbeProps) @{
	<section
		data-name="inner"
		onClickCapture={(event) => props.record('inner:capture', event)}
		onClick={(event) => props.record('inner:bubble', event)}
	>
		<button data-name="target" data-target>Click</button>
	</section>
}

export function OuterShadow(props: EventProbeProps) @{
	<section
		data-name="outer"
		onClickCapture={(event) => props.record('outer:capture', event)}
		onClick={(event) => props.record('outer:bubble', event)}
	>
		<event-probe-host data-name="host" data-host />
	</section>
}

export function OuterSlot(props: EventProbeProps) @{
	<section
		data-name="outer"
		onClickCapture={(event) => props.record('outer:capture', event)}
		onClick={(event) => props.record('outer:bubble', event)}
	>
		<event-probe-host data-name="host" data-host>
			<button
				data-name="light"
				data-target
				slot="content"
				onClickCapture={(event) => props.record('light:capture', event)}
				onClick={(event) => props.record('light:bubble', event)}
			>Click</button>
		</event-probe-host>
	</section>
}

export function SlotInner(props: EventProbeProps) @{
	<section
		data-name="inner"
		onClickCapture={(event) => props.record('inner:capture', event)}
		onClick={(event) => props.record('inner:bubble', event)}
	>
		<slot name="content" />
	</section>
}
