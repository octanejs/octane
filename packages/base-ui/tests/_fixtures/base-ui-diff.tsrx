import { useRef } from 'octane';
import { Separator } from '@octanejs/base-ui/separator';
import { useRender } from '@octanejs/base-ui/use-render';
import { Fieldset } from '@octanejs/base-ui/fieldset';
import { Meter } from '@octanejs/base-ui/meter';
import { NumberField } from '@octanejs/base-ui/number-field';
import { Progress } from '@octanejs/base-ui/progress';
import { Toggle } from '@octanejs/base-ui/toggle';
import { ToggleGroup } from '@octanejs/base-ui/toggle-group';
import { Avatar } from '@octanejs/base-ui/avatar';
import { Switch } from '@octanejs/base-ui/switch';
import { Checkbox } from '@octanejs/base-ui/checkbox';
import { CheckboxGroup } from '@octanejs/base-ui/checkbox-group';
import { Radio } from '@octanejs/base-ui/radio';
import { RadioGroup } from '@octanejs/base-ui/radio-group';
import { Field } from '@octanejs/base-ui/field';
import { Form } from '@octanejs/base-ui/form';
import { Input } from '@octanejs/base-ui/input';
import { Slider } from '@octanejs/base-ui/slider';
import { Dialog } from '@octanejs/base-ui/dialog';
import { AlertDialog } from '@octanejs/base-ui/alert-dialog';
import { Popover } from '@octanejs/base-ui/popover';
import { Menu } from '@octanejs/base-ui/menu';
import { Tooltip } from '@octanejs/base-ui/tooltip';
import { PreviewCard } from '@octanejs/base-ui/preview-card';
import { Button } from '@octanejs/base-ui/button';
import { CSPProvider } from '@octanejs/base-ui/csp-provider';
import { DirectionProvider, useDirection } from '@octanejs/base-ui/direction-provider';
import { useMediaQuery } from '@octanejs/base-ui/unstable-use-media-query';

// Self-contained differential fixtures: the SAME source runs on octane (via
// @octanejs/base-ui/<sub>) AND on React (the setup rewrites imports to the real
// `@base-ui/react/<sub>`), and the rig asserts byte-identical innerHTML.

const hrFn = (props) => <hr {...props} />;
const boldFn = (props) => <b {...props} />;
const orientClass = (state) => 'sep-' + state.orientation;
const legendSection = (props) => <section {...props} />;
const buttonSpanFn = (props) => <span {...props} />;

// Phase-3a probes: these hooks return values with no DOM of their own, so each probe
// renders the value as text and the rig compares it byte-for-byte.
function DirectionProbe() @{
	<span className="dir">{useDirection() as string}</span>
}

function MediaProbe(props) @{
	<span className="mq">{(useMediaQuery('(min-width: 600px)', {
		defaultMatches: props.defaultMatches,
	}) ? 'true' : 'false') as string}</span>
}

// Default (horizontal) — proves the intrinsic-tag render + state→data-* + role/aria.
export function SeparatorDefault() @{
	<Separator className="sep" />
}

// Vertical — state-driven data-orientation.
export function SeparatorVertical() @{
	<Separator orientation="vertical" className="sep" />
}

// render-prop ELEMENT form — the separator's props (role/aria/data-*) are cloned onto
// a user-supplied <hr/>, external className concatenates.
export function SeparatorRenderElement() @{
	<Separator className="sep" render={<hr data-user="1" />} />
}

// render-prop FUNCTION form — the callback receives merged props and returns JSX.
export function SeparatorRenderFn() @{
	<Separator orientation="vertical" render={hrFn} />
}

// className as a function of state.
export function SeparatorClassNameFn() @{
	<Separator className={orientClass} />
}

// useRender — the public engine hook. A custom <span> with merged props + state data-*.
export function UseRenderBasic() {
	return useRender({
		props: { className: 'ur', 'data-x': '1' },
		state: { active: true },
		defaultTagName: 'span',
	});
}

// useRender with a render-prop function.
export function UseRenderFn() {
	return useRender({
		render: boldFn,
		props: { className: 'urf' },
		defaultTagName: 'span',
	});
}

// Fieldset — proves plain-context provider/consumer + the legend→root id wiring:
// Legend's layout effect sets `legendId`, which the Root re-renders as
// `aria-labelledby`. `<fieldset>` intrinsic tag, `<div>` legend with a generated id.
export function FieldsetBasic() @{
	<Fieldset.Root className="fs">
		<Fieldset.Legend className="lg">Billing</Fieldset.Legend>
		<input type="text" />
	</Fieldset.Root>
}

// Disabled root — `disabled` attribute + `data-disabled` (state) on the fieldset, and
// the legend inherits `data-disabled` from context.
export function FieldsetDisabled() @{
	<Fieldset.Root className="fs" disabled>
		<Fieldset.Legend className="lg">Shipping</Fieldset.Legend>
	</Fieldset.Root>
}

// Explicit legend id wins over the generated one; still wired to aria-labelledby.
export function FieldsetLegendId() @{
	<Fieldset.Root className="fs">
		<Fieldset.Legend id="my-legend" className="lg">Account</Fieldset.Legend>
	</Fieldset.Root>
}

// Legend render-prop element/function form — renders a <section> yet keeps the id
// wiring, proving the render engine composes on a namespaced part.
export function FieldsetLegendRender() @{
	<Fieldset.Root className="fs">
		<Fieldset.Legend className="lg" render={legendSection}>Team</Fieldset.Legend>
	</Fieldset.Root>
}

// Meter — range math (value→percent), aria-value* wiring, indicator width%, value text.
// Proves the multi-part context + derived-state pattern and (via the indicator/root)
// style-object serialization parity with React.
export function MeterBasic() @{
	<Meter.Root className="meter" value={40} aria-label="Battery">
		<Meter.Label className="meter-label">Battery</Meter.Label>
		<Meter.Track className="meter-track">
			<Meter.Indicator className="meter-ind" />
		</Meter.Track>
		<Meter.Value className="meter-val" />
	</Meter.Root>
}

// Custom min/max — percentage is position within the range, not the raw value.
export function MeterRange() @{
	<Meter.Root className="meter" value={30} min={10} max={50} aria-label="Level">
		<Meter.Track className="meter-track">
			<Meter.Indicator className="meter-ind" />
		</Meter.Track>
		<Meter.Value className="meter-val" />
	</Meter.Root>
}

// NumberField — Root (+ hidden number input) / Group / Decrement / Input / Increment. The
// visible input shows the formatted value; the steppers are `type="button"` with aria-label.
// Proves the value/format state machine + the octane text-input value adaptation.
export function NumberFieldBasic() @{
	<NumberField.Root className="nf" defaultValue={5}>
		<NumberField.Group className="nf-group">
			<NumberField.Decrement className="nf-dec">-</NumberField.Decrement>
			<NumberField.Input className="nf-input" />
			<NumberField.Increment className="nf-inc">+</NumberField.Increment>
		</NumberField.Group>
	</NumberField.Root>
}

// The visually hidden number input is the form-facing native commit path. This
// fixture makes that host observable independently from the visible per-edit text
// field, so changing it to input-event semantics would break a consumer-visible
// value update.
export function NumberFieldHiddenNativeCommit() @{
	<NumberField.Root defaultValue={5} name="quantity">
		<NumberField.Input className="nf-input" />
	</NumberField.Root>
}

// Dialog (CLOSED) — Root + Trigger only. The popup/interactions are unmounted while closed, so
// this renders just the trigger button. Proves the whole Store-based popup foundation (DialogStore
// on ReactStore, the popups engine's trigger registration + open-change sync, useClick) produces a
// byte-identical closed trigger vs real Base UI.
export function DialogClosed() @{
	<Dialog.Root>
		<Dialog.Trigger className="dlg-trigger">Open</Dialog.Trigger>
	</Dialog.Root>
}

// Dialog (OPEN, modal, defaultOpen) — Portal/Backdrop/Popup/Title/Description/Close. The popup is
// portaled into an in-fixture host div (so the rig's `container.innerHTML` sees it) and wrapped in
// the reused `@octanejs/floating-ui` FocusManager. Proves the whole open-state stack (dismiss +
// scroll-lock + portal + focus-manager adapter + the parts) matches real Base UI byte-for-byte.
export function DialogOpen() @{
	const containerRef = useRef(null);
	<div>
		<div ref={containerRef} class="portal-host" />
		<Dialog.Root defaultOpen>
			<Dialog.Portal container={containerRef}>
				<Dialog.Backdrop className="dlg-backdrop" />
				<Dialog.Popup className="dlg-popup">
					<Dialog.Title className="dlg-title">Title</Dialog.Title>
					<Dialog.Description className="dlg-desc">Body</Dialog.Description>
					<Dialog.Close className="dlg-close">Close</Dialog.Close>
				</Dialog.Popup>
			</Dialog.Portal>
		</Dialog.Root>
	</div>
}

// Popover (CLOSED) — Root (wraps a FloatingTree) + Trigger only. Proves the Popover Store + the
// closed-trigger path (useClick, hover-stub, trigger focus-guards) render byte-identically to real
// Base UI while closed.
export function PopoverClosed() @{
	<Popover.Root>
		<Popover.Trigger className="pop-trigger">Open</Popover.Trigger>
	</Popover.Root>
}

// Popover (OPEN) — the full anchored-positioner path portaled into an in-fixture host div (so the
// rig's `container.innerHTML` sees it). jsdom has zero-size rects, so `useAnchorPositioning` computes
// deterministic default styles in BOTH octane and React — proving the Positioner (useFloating +
// @floating-ui/dom middleware) + Popup (FloatingFocusManager) + Arrow + Backdrop + Title/Description/
// Close render byte-for-byte identically to real Base UI, including the @floating-ui positioner
// styles (`transform`, `--available-width/height`, `--anchor-*`, `--transform-origin`).
//
// `modal` disables FloatingPortal's non-modal focus-guard tabbing management (a runtime focus-event
// side effect the differential rig is documented not to capture). Controlled-open WITHOUT a trigger
// keeps the anchor stable: with a trigger, its `element`↔`[guard,element,guard]` shape-flip on open
// remounts the button, which the positioner observes as a transient "trigger change" (sets
// `data-instant`) — a mount-timing/effect-ordering artifact the rig also can't see. The trigger's
// open/dismiss flow is covered by the behavior test on `PopoverInteractive` instead.
export function PopoverOpen() @{
	const containerRef = useRef(null);
	<div>
		<div ref={containerRef} class="portal-host" />
		<Popover.Root open modal>
			<Popover.Portal container={containerRef}>
				<Popover.Backdrop className="pop-backdrop" />
				<Popover.Positioner className="pop-positioner">
					<Popover.Popup className="pop-popup">
						<Popover.Arrow className="pop-arrow" />
						<Popover.Title className="pop-title">Title</Popover.Title>
						<Popover.Description className="pop-desc">Body</Popover.Description>
						<Popover.Close className="pop-close">Close</Popover.Close>
					</Popover.Popup>
				</Popover.Positioner>
			</Popover.Portal>
		</Popover.Root>
	</div>
}

// Popover (interactive) — a real trigger→open→dismiss flow, for behavior tests (focus/escape/close
// aren't visible in innerHTML so they can't be differential-tested).
export function PopoverInteractive() @{
	const hostRef = useRef(null);
	<div>
		<div ref={hostRef} class="pop-host" />
		<Popover.Root>
			<Popover.Trigger className="pop-trigger">Open</Popover.Trigger>
			<Popover.Portal container={hostRef}>
				<Popover.Positioner className="pop-positioner">
					<Popover.Popup className="pop-popup">
						<Popover.Close className="pop-close">Close</Popover.Close>
					</Popover.Popup>
				</Popover.Positioner>
			</Popover.Portal>
		</Popover.Root>
	</div>
}

// AlertDialog (OPEN) — a thin variant of Dialog: modal is forced, dismissal-on-outside-press is
// disabled, and the popup gets `role="alertdialog"`. All parts are Dialog's parts reused, so the open
// modal alert dialog must render byte-identically to real Base UI (only `role` differs from Dialog).
export function AlertDialogOpen() @{
	const containerRef = useRef(null);
	<div>
		<div ref={containerRef} class="portal-host" />
		<AlertDialog.Root defaultOpen>
			<AlertDialog.Portal container={containerRef}>
				<AlertDialog.Backdrop className="ad-backdrop" />
				<AlertDialog.Popup className="ad-popup">
					<AlertDialog.Title className="ad-title">Confirm</AlertDialog.Title>
					<AlertDialog.Description className="ad-desc">Are you sure?</AlertDialog.Description>
					<AlertDialog.Close className="ad-close">OK</AlertDialog.Close>
				</AlertDialog.Popup>
			</AlertDialog.Portal>
		</AlertDialog.Root>
	</div>
}

// AlertDialog (interactive) — trigger→open→dismiss for behavior tests. Outside-press dismissal is
// disabled (disablePointerDismissal), but Escape + the Close button still dismiss.
export function AlertDialogInteractive() @{
	const hostRef = useRef(null);
	<div>
		<div ref={hostRef} class="ad-host" />
		<AlertDialog.Root>
			<AlertDialog.Trigger className="ad-trigger">Open</AlertDialog.Trigger>
			<AlertDialog.Portal container={hostRef}>
				<AlertDialog.Popup className="ad-popup">
					<AlertDialog.Close className="ad-close">OK</AlertDialog.Close>
				</AlertDialog.Popup>
			</AlertDialog.Portal>
		</AlertDialog.Root>
	</div>
}

// Dialog (interactive) — a real trigger→open→dismiss flow, for behavior tests (focus/escape/close
// aren't visible in innerHTML so they can't be differential-tested).
export function DialogInteractive() @{
	const hostRef = useRef(null);
	<div>
		<div ref={hostRef} class="dlg-host" />
		<Dialog.Root>
			<Dialog.Trigger className="dlg-trigger">Open</Dialog.Trigger>
			<Dialog.Portal container={hostRef}>
				<Dialog.Popup className="dlg-popup">
					<Dialog.Close className="dlg-close">Close</Dialog.Close>
				</Dialog.Popup>
			</Dialog.Portal>
		</Dialog.Root>
	</div>
}

// Slider — Root (role=group) / Value (output) / Control / Track / Indicator / Thumb (a div +
// nested <input type=range>). With the default `center` alignment the thumb position + indicator
// width are pure math (valueToPercent), so mount renders byte-identically without layout. Proves
// the value state machine, the composite thumb registration (Value's `htmlFor`), and the octane
// range-input value adaptation.
export function SliderBasic() @{
	<Slider.Root className="sl" defaultValue={30}>
		<Slider.Value className="sl-value" />
		<Slider.Control className="sl-control">
			<Slider.Track className="sl-track">
				<Slider.Indicator className="sl-indicator" />
				<Slider.Thumb className="sl-thumb" />
			</Slider.Track>
		</Slider.Control>
	</Slider.Root>
}

// Range slider — two thumbs, two nested range inputs. Exercises the sorted value array, per-thumb
// aria-valuetext ("start range" / "end range"), and the multi-input `htmlFor` on Value.
export function SliderRange() @{
	<Slider.Root className="sl" defaultValue={[20, 60]}>
		<Slider.Value className="sl-value" />
		<Slider.Control className="sl-control">
			<Slider.Track className="sl-track">
				<Slider.Indicator className="sl-indicator" />
				<Slider.Thumb className="sl-thumb" index={0} />
				<Slider.Thumb className="sl-thumb" index={1} />
			</Slider.Track>
		</Slider.Control>
	</Slider.Root>
}

// At the max boundary — the Increment button is disabled (data-disabled + disabled attr).
export function NumberFieldBoundary() @{
	<NumberField.Root className="nf" defaultValue={10} max={10} min={0}>
		<NumberField.Group className="nf-group">
			<NumberField.Decrement className="nf-dec">-</NumberField.Decrement>
			<NumberField.Input className="nf-input" />
			<NumberField.Increment className="nf-inc">+</NumberField.Increment>
		</NumberField.Group>
	</NumberField.Root>
}

// Explicit Intl format — the value text + aria-valuetext format as a plain number.
export function MeterFormatted() @{
	<Meter.Root
		className="meter"
		value={72}
		format={{ style: 'unit', unit: 'percent' }}
		aria-label="Usage"
	>
		<Meter.Value className="meter-val" />
	</Meter.Root>
}

// Progress — like Meter but with a `status` state ('progressing' here) surfaced as
// `data-progressing` on EVERY part, plus aria-valuenow and the indicator width%.
export function ProgressBasic() @{
	<Progress.Root className="prog" value={40} aria-label="Upload">
		<Progress.Label className="prog-label">Upload</Progress.Label>
		<Progress.Track className="prog-track">
			<Progress.Indicator className="prog-ind" />
		</Progress.Track>
		<Progress.Value className="prog-val" />
	</Progress.Root>
}

// Complete — value === max flips status to 'complete' (data-complete on all parts).
export function ProgressComplete() @{
	<Progress.Root className="prog" value={100} aria-label="Upload">
		<Progress.Track className="prog-track">
			<Progress.Indicator className="prog-ind" />
		</Progress.Track>
		<Progress.Value className="prog-val" />
	</Progress.Root>
}

// Indeterminate — value={null}: status 'indeterminate', no aria-valuenow, empty indicator
// style + empty value text, data-indeterminate on all parts.
export function ProgressIndeterminate() @{
	<Progress.Root className="prog" value={null} aria-label="Upload">
		<Progress.Track className="prog-track">
			<Progress.Indicator className="prog-ind" />
		</Progress.Track>
		<Progress.Value className="prog-val" />
	</Progress.Root>
}

// Toggle — a two-state <button> (type="button", aria-pressed). Proves useButton's prop
// merge (type/tabIndex/focusable-when-disabled) + useControlled's uncontrolled toggle on
// click, all byte-identical to Base UI.
export function ToggleBasic() @{
	<Toggle className="tgl">Bold</Toggle>
}

// Uncontrolled default-pressed — aria-pressed starts "true".
export function ToggleDefaultPressed() @{
	<Toggle className="tgl" defaultPressed={true}>Bold</Toggle>
}

// Disabled — native `disabled` attribute; clicking does not toggle.
export function ToggleDisabled() @{
	<Toggle className="tgl" disabled>Bold</Toggle>
}

// Controlled — `pressed` is owned by the prop; clicking does NOT change the DOM (no
// onPressedChange wired), matching React's controlled Toggle.
export function ToggleControlled() @{
	<Toggle className="tgl" pressed={true}>Bold</Toggle>
}

// ToggleGroup — role="group" + data-orientation, composite roving focus (item 0 gets
// tabindex 0, the rest -1), and single-select value. Proves the whole composite system:
// CompositeRoot/CompositeList/CompositeItem registration + highlighted-index default +
// each Toggle deriving `aria-pressed` from the group value.
export function ToggleGroupSingle() @{
	<ToggleGroup className="tg" defaultValue={['left']} aria-label="Align">
		<Toggle className="ti" value="left">L</Toggle>
		<Toggle className="ti" value="center">C</Toggle>
		<Toggle className="ti" value="right">R</Toggle>
	</ToggleGroup>
}

// Multiple-select — data-multiple on the group; two items pressed at once.
export function ToggleGroupMultiple() @{
	<ToggleGroup className="tg" multiple defaultValue={['left', 'right']} aria-label="Format">
		<Toggle className="ti" value="left">B</Toggle>
		<Toggle className="ti" value="center">I</Toggle>
		<Toggle className="ti" value="right">U</Toggle>
	</ToggleGroup>
}

// Disabled group — data-disabled on the group; every button natively disabled.
export function ToggleGroupDisabled() @{
	<ToggleGroup className="tg" disabled defaultValue={['left']} aria-label="Align">
		<Toggle className="ti" value="left">L</Toggle>
		<Toggle className="ti" value="center">C</Toggle>
	</ToggleGroup>
}

// Avatar — Root/Image/Fallback. The image loads off-DOM and never resolves under jsdom, so
// (identically on both renderers) the <img> stays unmounted via the transition system and the
// Fallback shows. Proves the transition system + image-load hook + multi-part context render
// byte-identically to Base UI even when the image path is inert.
export function AvatarBasic() @{
	<Avatar.Root className="av">
		<Avatar.Image className="av-img" src="https://example.com/a.png" />
		<Avatar.Fallback className="av-fb">JD</Avatar.Fallback>
	</Avatar.Root>
}

// Fallback only — no <Avatar.Image>; the Fallback renders immediately.
export function AvatarFallbackOnly() @{
	<Avatar.Root className="av">
		<Avatar.Fallback className="av-fb">AB</Avatar.Fallback>
	</Avatar.Root>
}

// Switch — a role="switch" <span> + hidden checkbox <input>. Proves the octane
// uncontrolled-input adaptation (checked driven via the native property setter, NOT a
// `checked` attribute the way React's controlled input avoids) + the field-context surface
// (inert standalone). Clicking the switch dispatches a click on the hidden input, toggling
// aria-checked + data-checked/unchecked byte-identically to Base UI.
export function SwitchBasic() @{
	<Switch.Root className="sw">
		<Switch.Thumb className="sw-thumb" />
	</Switch.Root>
}

// Uncontrolled default-checked — aria-checked starts true, data-checked on root + thumb.
export function SwitchDefaultChecked() @{
	<Switch.Root className="sw" defaultChecked={true}>
		<Switch.Thumb className="sw-thumb" />
	</Switch.Root>
}

// Disabled — native disabled on the hidden input + data-disabled; click is a no-op.
export function SwitchDisabled() @{
	<Switch.Root className="sw" disabled>
		<Switch.Thumb className="sw-thumb" />
	</Switch.Root>
}

// Checkbox — role="checkbox" span + hidden input + a transition-mounted Indicator (only
// present when checked/indeterminate). Reuses the uncontrolled-input adaptation; clicking
// toggles aria-checked and mounts the Indicator, byte-identical to Base UI.
export function CheckboxBasic() @{
	<Checkbox.Root className="cb">
		<Checkbox.Indicator className="cb-ind" />
	</Checkbox.Root>
}

// Uncontrolled default-checked — aria-checked true, data-checked, Indicator present from mount.
export function CheckboxDefaultChecked() @{
	<Checkbox.Root className="cb" defaultChecked={true}>
		<Checkbox.Indicator className="cb-ind" />
	</Checkbox.Root>
}

// Indeterminate — aria-checked="mixed", data-indeterminate, Indicator present.
export function CheckboxIndeterminate() @{
	<Checkbox.Root className="cb" indeterminate={true}>
		<Checkbox.Indicator className="cb-ind" />
	</Checkbox.Root>
}

// Disabled — native disabled input + data-disabled; click is a no-op.
export function CheckboxDisabled() @{
	<Checkbox.Root className="cb" disabled>
		<Checkbox.Indicator className="cb-ind" />
	</Checkbox.Root>
}

// CheckboxGroup — a role="group" whose child checkboxes derive `checked` from the shared
// value array. Clicking a child adds/removes it from the group value, byte-identical to Base UI.
export function CheckboxGroupBasic() @{
	<CheckboxGroup className="cbg" defaultValue={['a']} aria-label="Options">
		<Checkbox.Root className="cb" name="a">
			<Checkbox.Indicator className="cb-ind" />
		</Checkbox.Root>
		<Checkbox.Root className="cb" name="b">
			<Checkbox.Indicator className="cb-ind" />
		</Checkbox.Root>
	</CheckboxGroup>
}

// Parent (select-all) checkbox — `allValues` + `parent` gives a 3-state parent that is
// indeterminate ("mixed") when only some children are ticked.
export function CheckboxGroupParent() @{
	<CheckboxGroup className="cbg" allValues={['a', 'b']} defaultValue={['a']} aria-label="Options">
		<Checkbox.Root className="cb cb-parent" parent>
			<Checkbox.Indicator className="cb-ind" />
		</Checkbox.Root>
		<Checkbox.Root className="cb" name="a">
			<Checkbox.Indicator className="cb-ind" />
		</Checkbox.Root>
		<Checkbox.Root className="cb" name="b">
			<Checkbox.Indicator className="cb-ind" />
		</Checkbox.Root>
	</CheckboxGroup>
}

// RadioGroup — role="radiogroup" (CompositeRoot roving focus) with radios. The selected
// radio holds the active tab stop; each radio derives aria-checked + data-checked from the
// group value. Clicking a radio moves the selection, byte-identical to Base UI.
export function RadioGroupBasic() @{
	<RadioGroup className="rg" defaultValue="a" aria-label="Choice">
		<Radio.Root className="r" value="a">
			<Radio.Indicator className="r-ind" />
		</Radio.Root>
		<Radio.Root className="r" value="b">
			<Radio.Indicator className="r-ind" />
		</Radio.Root>
		<Radio.Root className="r" value="c">
			<Radio.Indicator className="r-ind" />
		</Radio.Root>
	</RadioGroup>
}

// Disabled group — aria-disabled + every radio disabled; clicks are no-ops.
export function RadioGroupDisabled() @{
	<RadioGroup className="rg" defaultValue="a" disabled aria-label="Choice">
		<Radio.Root className="r" value="a">
			<Radio.Indicator className="r-ind" />
		</Radio.Root>
		<Radio.Root className="r" value="b">
			<Radio.Indicator className="r-ind" />
		</Radio.Root>
	</RadioGroup>
}

// Field — the label/control/description association: the Label's `for` = the Control's `id`,
// the Control's `aria-labelledby` = the Label's `id`, and `aria-describedby` = the Description's
// `id`. Proves LabelableProvider + FieldRoot + the real field contexts render byte-identically.
export function FieldBasic() @{
	<Field.Root className="f">
		<Field.Label className="f-label">Name</Field.Label>
		<Field.Control className="f-ctrl" />
		<Field.Description className="f-desc">Enter your name</Field.Description>
	</Field.Root>
}

// Disabled field — data-disabled propagates from Field.Root to label/control/description.
export function FieldDisabled() @{
	<Field.Root className="f" disabled>
		<Field.Label className="f-label">Name</Field.Label>
		<Field.Control className="f-ctrl" />
	</Field.Root>
}

// Standalone Input (= Field.Control with no Field.Root) — uses the inert default field context.
export function InputBasic() @{
	<Input className="in" />
}

// Form wrapping a Field — `<form novalidate>` provides the FormContext.
export function FormBasic() @{
	<Form className="form">
		<Field.Root className="f">
			<Field.Label className="f-label">Email</Field.Label>
			<Field.Control className="f-ctrl" name="email" />
		</Field.Root>
	</Form>
}

// ── Phase 3a ────────────────────────────────────────────────────────────────

// Button — a native <button> with type="button" from useButton.
export function ButtonBasic() @{
	<Button className="btn">Click me</Button>
}

// Disabled button — the native `disabled` attribute, no aria-disabled.
export function ButtonDisabled() @{
	<Button className="btn" disabled>Click me</Button>
}

// focusableWhenDisabled — the native attribute is dropped in favour of
// aria-disabled + a real tab stop, so the button stays reachable.
export function ButtonFocusableWhenDisabled() @{
	<Button className="btn" disabled focusableWhenDisabled>Click me</Button>
}

// Non-native render target — `nativeButton={false}` adds role/tabindex to the <span>.
export function ButtonNonNative() @{
	<Button className="btn" nativeButton={false} render={buttonSpanFn}>Click me</Button>
}

// A disabled non-native button reports aria-disabled instead of the attribute.
export function ButtonNonNativeDisabled() @{
	<Button className="btn" nativeButton={false} disabled render={buttonSpanFn}>Click me</Button>
}

// useDirection defaults to 'ltr' with no provider above it.
export function DirectionDefault() @{
	<DirectionProbe />
}

// DirectionProvider feeds the configured direction to descendants.
export function DirectionRtl() @{
	<DirectionProvider direction="rtl">
		<DirectionProbe />
	</DirectionProvider>
}

// Nested providers — the nearest one wins.
export function DirectionNested() @{
	<DirectionProvider direction="rtl">
		<DirectionProvider direction="ltr">
			<DirectionProbe />
		</DirectionProvider>
	</DirectionProvider>
}

// CSPProvider renders no DOM of its own and passes children straight through.
export function CspTransparent() @{
	<CSPProvider nonce="test-nonce">
		<span className="csp-child">child</span>
	</CSPProvider>
}

// useMediaQuery — jsdom's matchMedia never matches, so both renderers report false.
export function MediaQueryProbe() @{
	<MediaProbe />
}

// `defaultMatches` is only the pre-subscription value; the live snapshot still wins.
export function MediaQueryDefaultMatches() @{
	<MediaProbe defaultMatches={true} />
}

// Popover (open-on-hover) — `openOnHover` with no rest delay, for the hover behavior tests.
// Hover open/close is timing- and pointer-driven, so it is not differential-testable.
export function PopoverHover() @{
	const hostRef = useRef(null);
	<div>
		<div ref={hostRef} class="pop-host" />
		<Popover.Root>
			<Popover.Trigger className="pop-trigger" openOnHover delay={0} closeDelay={0}>
				Open
			</Popover.Trigger>
			<Popover.Portal container={hostRef}>
				<Popover.Positioner className="pop-positioner">
					<Popover.Popup className="pop-popup">
						<Popover.Close className="pop-close">Close</Popover.Close>
					</Popover.Popup>
				</Popover.Positioner>
			</Popover.Portal>
		</Popover.Root>
	</div>
}

// Popover (open-on-hover with a close delay) — leaving the trigger must not close it until the
// delay elapses.
export function PopoverHoverCloseDelay() @{
	const hostRef = useRef(null);
	<div>
		<div ref={hostRef} class="pop-host" />
		<Popover.Root>
			<Popover.Trigger className="pop-trigger" openOnHover delay={0} closeDelay={200}>
				Open
			</Popover.Trigger>
			<Popover.Portal container={hostRef}>
				<Popover.Positioner className="pop-positioner">
					<Popover.Popup className="pop-popup">
						<Popover.Close className="pop-close">Close</Popover.Close>
					</Popover.Popup>
				</Popover.Positioner>
			</Popover.Portal>
		</Popover.Root>
	</div>
}

// Dialog.Viewport — the scrollable positioning container between the portal and the popup.
// It carries role="presentation", `hidden` while unmounted, and the nested/open state attributes.
export function DialogViewportOpen() @{
	const containerRef = useRef(null);
	<div>
		<div ref={containerRef} class="portal-host" />
		<Dialog.Root defaultOpen>
			<Dialog.Portal container={containerRef}>
				<Dialog.Backdrop className="dlg-backdrop" />
				<Dialog.Viewport className="dlg-viewport">
					<Dialog.Popup className="dlg-popup">
						<Dialog.Title className="dlg-title">Title</Dialog.Title>
						<Dialog.Close className="dlg-close">Close</Dialog.Close>
					</Dialog.Popup>
				</Dialog.Viewport>
			</Dialog.Portal>
		</Dialog.Root>
	</div>
}

// A closed Dialog.Viewport stays mounted only when the portal keeps it mounted; by default the
// whole subtree unmounts, so this renders just the trigger.
export function DialogViewportClosed() @{
	<Dialog.Root>
		<Dialog.Trigger className="dlg-trigger">Open</Dialog.Trigger>
		<Dialog.Portal>
			<Dialog.Viewport className="dlg-viewport">
				<Dialog.Popup className="dlg-popup">Body</Dialog.Popup>
			</Dialog.Viewport>
		</Dialog.Portal>
	</Dialog.Root>
}

// Popover.Viewport — the content-transition container inside the popup. With a single trigger it
// never transitions, so it renders the current-content container around the children.
export function PopoverViewportOpen() @{
	const containerRef = useRef(null);
	<div>
		<div ref={containerRef} class="portal-host" />
		<Popover.Root open modal>
			<Popover.Portal container={containerRef}>
				<Popover.Positioner className="pop-positioner">
					<Popover.Popup className="pop-popup">
						<Popover.Viewport className="pop-viewport">
							<Popover.Title className="pop-title">Title</Popover.Title>
							<Popover.Close className="pop-close">Close</Popover.Close>
						</Popover.Viewport>
					</Popover.Popup>
				</Popover.Positioner>
			</Popover.Portal>
		</Popover.Root>
	</div>
}

// Tooltip (CLOSED) — Root + Trigger only. The popup subtree is unmounted while closed, so this is
// just the trigger button carrying the tooltip-trigger identifier attribute.
export function TooltipClosed() @{
	<Tooltip.Root>
		<Tooltip.Trigger className="tip-trigger">Hover me</Tooltip.Trigger>
	</Tooltip.Root>
}

// Tooltip (OPEN, controlled) — Portal/Positioner/Popup/Arrow. `open` is controlled and there is no
// trigger, so the anchored positioner has a stable (absent) anchor and the markup is comparable.
export function TooltipOpen() @{
	const containerRef = useRef(null);
	<div>
		<div ref={containerRef} class="portal-host" />
		<Tooltip.Root open>
			<Tooltip.Portal container={containerRef}>
				<Tooltip.Positioner className="tip-positioner">
					<Tooltip.Popup className="tip-popup">
						<Tooltip.Arrow className="tip-arrow" />
						Tooltip content
					</Tooltip.Popup>
				</Tooltip.Positioner>
			</Tooltip.Portal>
		</Tooltip.Root>
	</div>
}

// Tooltip with a Viewport — the content-transition container inside the popup.
export function TooltipViewportOpen() @{
	const containerRef = useRef(null);
	<div>
		<div ref={containerRef} class="portal-host" />
		<Tooltip.Root open>
			<Tooltip.Portal container={containerRef}>
				<Tooltip.Positioner className="tip-positioner">
					<Tooltip.Popup className="tip-popup">
						<Tooltip.Viewport className="tip-viewport">Tooltip content</Tooltip.Viewport>
					</Tooltip.Popup>
				</Tooltip.Positioner>
			</Tooltip.Portal>
		</Tooltip.Root>
	</div>
}

// A disabled trigger drops the tooltip-trigger identifier and gains data-trigger-disabled.
export function TooltipDisabledTrigger() @{
	<Tooltip.Root>
		<Tooltip.Trigger className="tip-trigger" disabled>Hover me</Tooltip.Trigger>
	</Tooltip.Root>
}

// Tooltip.Provider — shares one delay across a group; it renders no DOM of its own.
export function TooltipProviderGroup() @{
	<Tooltip.Provider delay={100} closeDelay={50}>
		<Tooltip.Root>
			<Tooltip.Trigger className="tip-trigger">One</Tooltip.Trigger>
		</Tooltip.Root>
		<Tooltip.Root>
			<Tooltip.Trigger className="tip-trigger-2">Two</Tooltip.Trigger>
		</Tooltip.Root>
	</Tooltip.Provider>
}

// Tooltip (interactive) — a real trigger with no open delay, for the hover behavior test.
export function TooltipInteractive() @{
	const hostRef = useRef(null);
	<div>
		<div ref={hostRef} class="tip-host" />
		<Tooltip.Root>
			<Tooltip.Trigger className="tip-trigger" delay={0} closeDelay={0}>
				Hover me
			</Tooltip.Trigger>
			<Tooltip.Portal container={hostRef}>
				<Tooltip.Positioner className="tip-positioner">
					<Tooltip.Popup className="tip-popup">Tooltip content</Tooltip.Popup>
				</Tooltip.Positioner>
			</Tooltip.Portal>
		</Tooltip.Root>
	</div>
}

// PreviewCard (CLOSED) — Root + Trigger only. The trigger is an <a>, and the popup subtree is
// unmounted while closed.
export function PreviewCardClosed() @{
	<PreviewCard.Root>
		<PreviewCard.Trigger className="pc-trigger" href="/profile">Base UI</PreviewCard.Trigger>
	</PreviewCard.Root>
}

// PreviewCard (OPEN, controlled) — Portal/Positioner/Popup/Arrow plus the backdrop.
export function PreviewCardOpen() @{
	const containerRef = useRef(null);
	<div>
		<div ref={containerRef} class="portal-host" />
		<PreviewCard.Root open>
			<PreviewCard.Portal container={containerRef}>
				<PreviewCard.Backdrop className="pc-backdrop" />
				<PreviewCard.Positioner className="pc-positioner">
					<PreviewCard.Popup className="pc-popup">
						<PreviewCard.Arrow className="pc-arrow" />
						Preview content
					</PreviewCard.Popup>
				</PreviewCard.Positioner>
			</PreviewCard.Portal>
		</PreviewCard.Root>
	</div>
}

// PreviewCard with a Viewport — the content-transition container inside the popup.
export function PreviewCardViewportOpen() @{
	const containerRef = useRef(null);
	<div>
		<div ref={containerRef} class="portal-host" />
		<PreviewCard.Root open>
			<PreviewCard.Portal container={containerRef}>
				<PreviewCard.Positioner className="pc-positioner">
					<PreviewCard.Popup className="pc-popup">
						<PreviewCard.Viewport className="pc-viewport">Preview content</PreviewCard.Viewport>
					</PreviewCard.Popup>
				</PreviewCard.Positioner>
			</PreviewCard.Portal>
		</PreviewCard.Root>
	</div>
}

// PreviewCard (interactive) — a real trigger with no open/close delay, for the hover behavior test.
export function PreviewCardInteractive() @{
	const hostRef = useRef(null);
	<div>
		<div ref={hostRef} class="pc-host" />
		<PreviewCard.Root>
			<PreviewCard.Trigger className="pc-trigger" href="/profile" delay={0} closeDelay={0}>
				Base UI
			</PreviewCard.Trigger>
			<PreviewCard.Portal container={hostRef}>
				<PreviewCard.Positioner className="pc-positioner">
					<PreviewCard.Popup className="pc-popup">Preview content</PreviewCard.Popup>
				</PreviewCard.Positioner>
			</PreviewCard.Portal>
		</PreviewCard.Root>
	</div>
}

// Two tooltips with NO Tooltip.Provider around them. Base UI's delay-group context has a
// module-level default whose refs every unscoped tooltip shares, so they still coordinate.
export function TooltipsWithoutProvider() @{
	const hostRef = useRef(null);
	<div>
		<div ref={hostRef} class="tip-host" />
		<Tooltip.Root>
			<Tooltip.Trigger className="tip-a" delay={0} closeDelay={0}>A</Tooltip.Trigger>
			<Tooltip.Portal container={hostRef}>
				<Tooltip.Positioner>
					<Tooltip.Popup className="pop-a">A content</Tooltip.Popup>
				</Tooltip.Positioner>
			</Tooltip.Portal>
		</Tooltip.Root>
		<Tooltip.Root>
			<Tooltip.Trigger className="tip-b" delay={0} closeDelay={0}>B</Tooltip.Trigger>
			<Tooltip.Portal container={hostRef}>
				<Tooltip.Positioner>
					<Tooltip.Popup className="pop-b">B content</Tooltip.Popup>
				</Tooltip.Positioner>
			</Tooltip.Portal>
		</Tooltip.Root>
	</div>
}

// AlertDialog re-uses Dialog's Viewport, so it must be reachable through the AlertDialog
// namespace too — Base UI lists it in AlertDialog's anatomy.
export function AlertDialogViewportOpen() @{
	const containerRef = useRef(null);
	<div>
		<div ref={containerRef} class="portal-host" />
		<AlertDialog.Root defaultOpen>
			<AlertDialog.Portal container={containerRef}>
				<AlertDialog.Backdrop className="ad-backdrop" />
				<AlertDialog.Viewport className="ad-viewport">
					<AlertDialog.Popup className="ad-popup">
						<AlertDialog.Title className="ad-title">Confirm</AlertDialog.Title>
						<AlertDialog.Close className="ad-close">OK</AlertDialog.Close>
					</AlertDialog.Popup>
				</AlertDialog.Viewport>
			</AlertDialog.Portal>
		</AlertDialog.Root>
	</div>
}

// Menu (CLOSED) — Root (wraps a FloatingTree) + Trigger only. Proves the Menu store, the parent
// resolution, and the closed-trigger path (useClick/useFocus/hover, the list-navigation + typeahead
// reference props Menu.Root merges into `inactiveTriggerProps`, and the trigger focus guards)
// render byte-identically to real Base UI while closed.
export function MenuClosed() @{
	<Menu.Root>
		<Menu.Trigger className="menu-trigger">Open menu</Menu.Trigger>
	</Menu.Root>
}

// Menu (OPEN) — the full anchored-dropdown path portaled into an in-fixture host div (so the rig's
// `container.innerHTML` sees it). jsdom has zero-size rects, so `useAnchorPositioning` computes
// deterministic default styles in BOTH octane and React — proving the Positioner (useFloating +
// @floating-ui/dom middleware, with Menu's DROPDOWN_COLLISION_AVOIDANCE), the modal InternalBackdrop
// and the Popup (role="menu", `data-rootownerid`, FloatingFocusManager) render byte-for-byte
// identically to real Base UI, including the @floating-ui positioner styles.
//
// Controlled-open WITHOUT a trigger keeps the anchor stable: with a trigger, its
// `element` ↔ `[guard, element, guard]` shape-flip on open remounts the button, which the
// positioner observes as a transient "trigger change" (sets `data-instant`) — a mount-timing
// artifact the rig can't see. The trigger's open/dismiss flow is covered by the behavior test on
// `MenuInteractive` instead.
export function MenuOpen() @{
	const containerRef = useRef(null);
	<div>
		<div ref={containerRef} class="portal-host" />
		<Menu.Root open>
			<Menu.Portal container={containerRef}>
				<Menu.Positioner className="menu-positioner">
					<Menu.Popup className="menu-popup">Menu body</Menu.Popup>
				</Menu.Positioner>
			</Menu.Portal>
		</Menu.Root>
	</div>
}

// Menu (OPEN, non-modal) — `modal={false}` drops the InternalBackdrop and the scroll lock, so the
// positioner/popup pair must still match Base UI exactly on the non-modal path.
export function MenuOpenNonModal() @{
	const containerRef = useRef(null);
	<div>
		<div ref={containerRef} class="portal-host" />
		<Menu.Root open modal={false}>
			<Menu.Portal container={containerRef}>
				<Menu.Positioner className="menu-positioner">
					<Menu.Popup className="menu-popup">Menu body</Menu.Popup>
				</Menu.Positioner>
			</Menu.Portal>
		</Menu.Root>
	</div>
}

// Menu (OPEN, explicit side/align) — the positioner's placement props flow through to the
// @floating-ui computation and the `data-side`/`data-align` state attributes.
export function MenuOpenPlacement() @{
	const containerRef = useRef(null);
	<div>
		<div ref={containerRef} class="portal-host" />
		<Menu.Root open modal={false}>
			<Menu.Portal container={containerRef}>
				<Menu.Positioner className="menu-positioner" side="right" align="start" sideOffset={8}>
					<Menu.Popup className="menu-popup">Menu body</Menu.Popup>
				</Menu.Positioner>
			</Menu.Portal>
		</Menu.Root>
	</div>
}

// Menu (OPEN, disabled root) — `disabled` gates useDismiss/useListNavigation/useTypeahead off; the
// rendered popup must still match.
export function MenuOpenDisabled() @{
	const containerRef = useRef(null);
	<div>
		<div ref={containerRef} class="portal-host" />
		<Menu.Root open modal={false} disabled>
			<Menu.Portal container={containerRef}>
				<Menu.Positioner className="menu-positioner">
					<Menu.Popup className="menu-popup">Menu body</Menu.Popup>
				</Menu.Positioner>
			</Menu.Portal>
		</Menu.Root>
	</div>
}

// Menu (interactive) — a real trigger → open → dismiss flow, for behavior tests (focus management,
// keyboard open/close and the store's roving-focus plumbing aren't visible in innerHTML, so they
// can't be differential-tested).
export function MenuInteractive() @{
	const hostRef = useRef(null);
	<div>
		<div ref={hostRef} class="menu-host" />
		<Menu.Root modal={false}>
			<Menu.Trigger className="menu-trigger">Open menu</Menu.Trigger>
			<Menu.Portal container={hostRef}>
				<Menu.Positioner className="menu-positioner">
					<Menu.Popup className="menu-popup">Menu body</Menu.Popup>
				</Menu.Positioner>
			</Menu.Portal>
		</Menu.Root>
	</div>
}

// Menu (DETACHED trigger via a handle) — the trigger sits OUTSIDE `Menu.Root` and is associated
// with it only through the shared `Menu.Handle`. This is the path where `MenuStore.setOpen` must
// reach `Menu.Root`'s `setOpen`: the store routes it through the floating root context's event bus
// rather than applying it directly, precisely so a holder of the store alone (a detached trigger,
// or `handle.open()`/`handle.close()`) drives the one Root that owns the open-change sequence.
export function MenuWithHandle({ handle }: { handle: any }) @{
	const hostRef = useRef(null);
	<div>
		<div ref={hostRef} class="menu-host" />
		<Menu.Trigger handle={handle} id="detached-menu-trigger" className="menu-trigger">
			Open menu
		</Menu.Trigger>
		<Menu.Root handle={handle} modal={false}>
			<Menu.Portal container={hostRef}>
				<Menu.Positioner className="menu-positioner">
					<Menu.Popup className="menu-popup">Menu body</Menu.Popup>
				</Menu.Positioner>
			</Menu.Portal>
		</Menu.Root>
	</div>
}

// Menu (OPEN, with items) — the stage-2 payload. Items register with the positioner's CompositeList,
// which is what gives `useListNavigation`/`useTypeahead` (Phase 3e) something to navigate. Covers
// the item roles/tabindex, the disabled item, Group + GroupLabel's `aria-labelledby` wiring, and
// `Menu.Separator` (the shared Separator reached through the Menu namespace).
export function MenuOpenWithItems() @{
	const containerRef = useRef(null);
	<div>
		<div ref={containerRef} class="portal-host" />
		<Menu.Root open modal={false}>
			<Menu.Portal container={containerRef}>
				<Menu.Positioner className="menu-positioner">
					<Menu.Popup className="menu-popup">
						<Menu.Item className="menu-item">Cut</Menu.Item>
						<Menu.Item className="menu-item">Copy</Menu.Item>
						<Menu.Item className="menu-item" disabled>Paste</Menu.Item>
						<Menu.Separator className="menu-sep" />
						<Menu.Group className="menu-group">
							<Menu.GroupLabel className="menu-group-label">More</Menu.GroupLabel>
							<Menu.Item className="menu-item">Duplicate</Menu.Item>
						</Menu.Group>
					</Menu.Popup>
				</Menu.Positioner>
			</Menu.Portal>
		</Menu.Root>
	</div>
}

// Menu (OPEN, checkbox items) — `role="menuitemcheckbox"`, `aria-checked`, and `itemMapping`'s
// present/absent `data-checked`/`data-unchecked` pair. The indicator is transition-mounted, so the
// unchecked item has no indicator element at all while the checked one does.
export function MenuOpenCheckboxItems() @{
	const containerRef = useRef(null);
	<div>
		<div ref={containerRef} class="portal-host" />
		<Menu.Root open modal={false}>
			<Menu.Portal container={containerRef}>
				<Menu.Positioner className="menu-positioner">
					<Menu.Popup className="menu-popup">
						<Menu.CheckboxItem className="menu-check" defaultChecked>
							<Menu.CheckboxItemIndicator className="menu-check-ind">x</Menu.CheckboxItemIndicator>
							Bold
						</Menu.CheckboxItem>
						<Menu.CheckboxItem className="menu-check">
							<Menu.CheckboxItemIndicator className="menu-check-ind">x</Menu.CheckboxItemIndicator>
							Italic
						</Menu.CheckboxItem>
						<Menu.CheckboxItem className="menu-check">
							<Menu.CheckboxItemIndicator className="menu-check-ind" keepMounted>
								x
							</Menu.CheckboxItemIndicator>
							Underline
						</Menu.CheckboxItem>
					</Menu.Popup>
				</Menu.Positioner>
			</Menu.Portal>
		</Menu.Root>
	</div>
}

// Menu (OPEN, radio group) — `role="group"` + the GroupLabel `aria-labelledby` wiring RadioGroup
// shares with Group, plus `role="menuitemradio"`/`aria-checked` and the selected item's indicator.
export function MenuOpenRadioGroup() @{
	const containerRef = useRef(null);
	<div>
		<div ref={containerRef} class="portal-host" />
		<Menu.Root open modal={false}>
			<Menu.Portal container={containerRef}>
				<Menu.Positioner className="menu-positioner">
					<Menu.Popup className="menu-popup">
						<Menu.RadioGroup className="menu-radio-group" defaultValue="md">
							<Menu.GroupLabel className="menu-group-label">Size</Menu.GroupLabel>
							<Menu.RadioItem className="menu-radio" value="sm">
								<Menu.RadioItemIndicator className="menu-radio-ind">o</Menu.RadioItemIndicator>
								Small
							</Menu.RadioItem>
							<Menu.RadioItem className="menu-radio" value="md">
								<Menu.RadioItemIndicator className="menu-radio-ind">o</Menu.RadioItemIndicator>
								Medium
							</Menu.RadioItem>
						</Menu.RadioGroup>
					</Menu.Popup>
				</Menu.Positioner>
			</Menu.Portal>
		</Menu.Root>
	</div>
}

// Menu (OPEN, link item + arrow + backdrop) — the remaining stage-2 parts. LinkItem renders an
// `<a>` that still carries the menuitem role and the composite tabindex; Arrow picks up the
// positioner's arrow styles; Backdrop is the user-facing overlay (distinct from the modal
// InternalBackdrop the positioner renders on its own).
export function MenuOpenLinkArrowBackdrop() @{
	const containerRef = useRef(null);
	<div>
		<div ref={containerRef} class="portal-host" />
		<Menu.Root open modal={false}>
			<Menu.Portal container={containerRef}>
				<Menu.Backdrop className="menu-backdrop" />
				<Menu.Positioner className="menu-positioner">
					<Menu.Popup className="menu-popup">
						<Menu.Arrow className="menu-arrow">^</Menu.Arrow>
						<Menu.LinkItem className="menu-link" href="https://example.com">Docs</Menu.LinkItem>
						<Menu.Item className="menu-item">Close</Menu.Item>
					</Menu.Popup>
				</Menu.Positioner>
			</Menu.Portal>
		</Menu.Root>
	</div>
}

// Menu (OPEN, viewport) — the content-transition container between the popup and its children.
export function MenuOpenViewport() @{
	const containerRef = useRef(null);
	<div>
		<div ref={containerRef} class="portal-host" />
		<Menu.Root open modal={false}>
			<Menu.Portal container={containerRef}>
				<Menu.Positioner className="menu-positioner">
					<Menu.Popup className="menu-popup">
						<Menu.Viewport className="menu-viewport">
							<Menu.Item className="menu-item">Cut</Menu.Item>
							<Menu.Item className="menu-item">Copy</Menu.Item>
						</Menu.Viewport>
					</Menu.Popup>
				</Menu.Positioner>
			</Menu.Portal>
		</Menu.Root>
	</div>
}

// Menu (interactive, with items) — for behavior tests: roving focus, typeahead, item activation,
// and checkbox/radio toggling, none of which are visible in a mount-time innerHTML snapshot.
export function MenuItemsInteractive() @{
	const hostRef = useRef(null);
	<div>
		<div ref={hostRef} class="menu-host" />
		<Menu.Root modal={false}>
			<Menu.Trigger className="menu-trigger">Open menu</Menu.Trigger>
			<Menu.Portal container={hostRef}>
				<Menu.Positioner className="menu-positioner">
					<Menu.Popup className="menu-popup">
						<Menu.Item className="menu-item">Apple</Menu.Item>
						<Menu.Item className="menu-item">Banana</Menu.Item>
						<Menu.Item className="menu-item">Cherry</Menu.Item>
						<Menu.CheckboxItem className="menu-check">
							<Menu.CheckboxItemIndicator className="menu-check-ind">x</Menu.CheckboxItemIndicator>
							Damson
						</Menu.CheckboxItem>
						<Menu.RadioGroup className="menu-radio-group" defaultValue="e1">
							<Menu.RadioItem className="menu-radio" value="e1">Elderberry</Menu.RadioItem>
							<Menu.RadioItem className="menu-radio" value="e2">Fig</Menu.RadioItem>
						</Menu.RadioGroup>
					</Menu.Popup>
				</Menu.Positioner>
			</Menu.Portal>
		</Menu.Root>
	</div>
}

// Menu (OPEN, with a closed submenu) — the stage-3 skeleton. `SubmenuTrigger` is simultaneously an
// item of the parent menu and the trigger of its own, so it carries the parent's `itemProps` and
// roving tabindex alongside `aria-haspopup`/`aria-expanded` and the trigger open-state attributes.
// The submenu itself is closed here, so only the trigger renders.
export function MenuOpenWithSubmenu() @{
	const containerRef = useRef(null);
	<div>
		<div ref={containerRef} class="portal-host" />
		<Menu.Root open modal={false}>
			<Menu.Portal container={containerRef}>
				<Menu.Positioner className="menu-positioner">
					<Menu.Popup className="menu-popup">
						<Menu.Item className="menu-item">Cut</Menu.Item>
						<Menu.SubmenuRoot>
							<Menu.SubmenuTrigger className="menu-subtrigger">Share</Menu.SubmenuTrigger>
							<Menu.Portal container={containerRef}>
								<Menu.Positioner className="submenu-positioner">
									<Menu.Popup className="submenu-popup">
										<Menu.Item className="submenu-item">Email</Menu.Item>
									</Menu.Popup>
								</Menu.Positioner>
							</Menu.Portal>
						</Menu.SubmenuRoot>
						<Menu.Item className="menu-item">Paste</Menu.Item>
					</Menu.Popup>
				</Menu.Positioner>
			</Menu.Portal>
		</Menu.Root>
	</div>
}

// Menu (OPEN, with an OPEN submenu) — both levels mounted. The nested `Menu.Root` resolves its
// parent to `{ type: 'menu' }` through `SubmenuRoot`'s context, which flips the submenu positioner
// to `inline-end`/`start` placement, marks the popup `data-nested`, and suppresses the modal
// backdrop for the nested level.
export function MenuOpenWithSubmenuOpen() @{
	const containerRef = useRef(null);
	<div>
		<div ref={containerRef} class="portal-host" />
		<Menu.Root open modal={false}>
			<Menu.Portal container={containerRef}>
				<Menu.Positioner className="menu-positioner">
					<Menu.Popup className="menu-popup">
						<Menu.Item className="menu-item">Cut</Menu.Item>
						<Menu.SubmenuRoot open>
							<Menu.SubmenuTrigger className="menu-subtrigger">Share</Menu.SubmenuTrigger>
							<Menu.Portal container={containerRef}>
								<Menu.Positioner className="submenu-positioner">
									<Menu.Popup className="submenu-popup">
										<Menu.Item className="submenu-item">Email</Menu.Item>
										<Menu.Item className="submenu-item">Message</Menu.Item>
									</Menu.Popup>
								</Menu.Positioner>
							</Menu.Portal>
						</Menu.SubmenuRoot>
					</Menu.Popup>
				</Menu.Positioner>
			</Menu.Portal>
		</Menu.Root>
	</div>
}

// Menu (interactive submenu) — for behavior tests: opening a submenu from its trigger, the
// parent/sibling close relays, and Escape closing only the child.
export function MenuSubmenuInteractive() @{
	const hostRef = useRef(null);
	<div>
		<div ref={hostRef} class="menu-host" />
		<Menu.Root modal={false}>
			<Menu.Trigger className="menu-trigger">Open menu</Menu.Trigger>
			<Menu.Portal container={hostRef}>
				<Menu.Positioner className="menu-positioner">
					<Menu.Popup className="menu-popup">
						<Menu.Item className="menu-item">Cut</Menu.Item>
						<Menu.SubmenuRoot>
							<Menu.SubmenuTrigger className="menu-subtrigger" openOnHover={false}>
								Share
							</Menu.SubmenuTrigger>
							<Menu.Portal container={hostRef}>
								<Menu.Positioner className="submenu-positioner">
									<Menu.Popup className="submenu-popup">
										<Menu.Item className="submenu-item">Email</Menu.Item>
									</Menu.Popup>
								</Menu.Positioner>
							</Menu.Portal>
						</Menu.SubmenuRoot>
					</Menu.Popup>
				</Menu.Positioner>
			</Menu.Portal>
		</Menu.Root>
	</div>
}
