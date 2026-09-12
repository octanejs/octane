/** @jsxImportSource octane */
import type { DerivedSignal, WritableSignal } from 'octane/signals';

declare const text: WritableSignal<string>;
declare const label: DerivedSignal<string>;
declare const enabled: WritableSignal<boolean>;
declare const width: DerivedSignal<number>;
declare const invalid: WritableSignal<{ invalid: true }>;

// Readonly capabilities are one-way bindings; writable value/checked handles
// opt into native two-way control behavior. Names and aliases are irrelevant.
export function DirectSignalProps() {
	return (
		<>
			<input value={text} checked={enabled} aria-label={label} />
			<textarea value={label} />
			<input {...{ value: text }} />
			<button disabled={enabled} title={label}>
				Action
			</button>
			<label for={label}>Label</label>
			<div style={{ color: label, width, opacity: width }} />
			<svg>
				<circle cx={width} />
			</svg>
			{/* @ts-expect-error A boolean handle is not a text value. */}
			<textarea value={enabled} />
			{/* @ts-expect-error An object payload is not a native attribute value. */}
			<input value={invalid} />
			{/* @ts-expect-error Event callbacks remain native functions, not signals. */}
			<button onClick={enabled}>Invalid</button>
			{/* @ts-expect-error Uncontrolled initialization does not install a live binding. */}
			<input defaultValue={text} />
			{/* @ts-expect-error Invalid CSS payloads do not become valid inside a handle. */}
			<div style={{ width: invalid }} />
		</>
	);
}
