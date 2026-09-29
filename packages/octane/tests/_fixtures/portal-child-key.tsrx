import { createPortal } from 'octane';

type Target = Element | DocumentFragment;

function Field() @{
	<input class="field" defaultValue="fresh" />
}

function OtherField() @{
	<input class="field other" defaultValue="other" />
}

// A component RETURNS a portal whose body is a keyed component element: the
// value-position createPortal path.
export function ReturnKeyedChild(props: { target: Target; id: string; portalKey?: string }) {
	return createPortal(<Field key={props.id} />, props.target, props.portalKey ?? 'stable');
}

// The same keyed child through the compiler's direct `{createPortal(...)}` child
// position.
export function DirectKeyedChild(props: { target: Target; id: string; portalKey?: string }) @{
	<div>{createPortal(<Field key={props.id} />, props.target, props.portalKey ?? 'stable')}</div>
}

// The portal body switches component type while its portal key stays put.
export function ReturnSwitchedChild(props: { target: Target; other: boolean }) {
	return createPortal(props.other ? <OtherField /> : <Field />, props.target, 'stable');
}

// The same switch through the compiler's direct `{createPortal(...)}` child
// position.
export function DirectSwitchedChild(props: { target: Target; other: boolean }) @{
	<div>{createPortal(props.other ? <OtherField /> : <Field />, props.target, 'stable')}</div>
}

// A keyed host element body.
export function ReturnKeyedHostChild(props: { target: Target; id: string }) {
	return createPortal(
		<input key={props.id} class="field" defaultValue="fresh" />,
		props.target,
		'stable',
	);
}
