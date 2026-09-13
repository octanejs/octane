/** @jsxImportSource octane */
import type { DerivedSignal, WritableSignal } from 'octane/signals';
import type { ComponentProps } from 'octane';
import type { JSX } from 'octane/jsx-runtime';

declare const text: WritableSignal<string>;
declare const label: DerivedSignal<string>;
declare const enabled: WritableSignal<boolean>;
declare const width: DerivedSignal<number>;
declare const invalid: WritableSignal<{ invalid: true }>;
declare const clickHandler: DerivedSignal<NonNullable<ComponentProps<'button'>['onClick']>>;
declare const elementRef: DerivedSignal<NonNullable<ComponentProps<'div'>['ref']>>;

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
			{/* @ts-expect-error Even a signal containing a native handler is not a callback. */}
			<button onClick={clickHandler}>Invalid</button>
			{/* @ts-expect-error Uncontrolled initialization does not install a live binding. */}
			<input defaultValue={text} />
			{/* @ts-expect-error Uncontrolled checked state does not install a live binding. */}
			<input defaultChecked={enabled} />
			{/* @ts-expect-error Identity is not a live native attribute. */}
			<div key={text} />
			{/* @ts-expect-error Refs retain their callback, object, and array contract. */}
			<div ref={elementRef} />
			{/* @ts-expect-error Invalid CSS payloads do not become valid inside a handle. */}
			<div style={{ width: invalid }} />
		</>
	);
}

function InputWrapper({ value, ...props }: ComponentProps<'input'>) {
	const primitive: string | number | readonly string[] | undefined = value;
	return <input {...props} value={primitive} />;
}
const plainWrappedInput = <InputWrapper value="ready" />;
// @ts-expect-error A component inspecting scalar props does not opt into live bindings.
const signalWrappedInput = <InputWrapper value={text} />;

function BindingInputWrapper(props: JSX.IntrinsicElements['input']) {
	return <input {...props} />;
}
const explicitBindingInput = <BindingInputWrapper value={text} />;
