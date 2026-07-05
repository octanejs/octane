import { Separator } from '@octanejs/base-ui/separator';
import { useRender } from '@octanejs/base-ui/use-render';
import { Fieldset } from '@octanejs/base-ui/fieldset';
import { Meter } from '@octanejs/base-ui/meter';
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

// Self-contained differential fixtures: the SAME source runs on octane (via
// @octanejs/base-ui/<sub>) AND on React (the setup rewrites imports to the real
// `@base-ui/react/<sub>`), and the rig asserts byte-identical innerHTML.

const hrFn = (props) => <hr {...props} />;
const boldFn = (props) => <b {...props} />;
const orientClass = (state) => 'sep-' + state.orientation;
const legendSection = (props) => <section {...props} />;

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
