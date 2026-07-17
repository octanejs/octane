import { useRef, useState } from 'octane';
// Direct source imports: the Phase-1 exports are not wired into the package index files
// yet (owned by the integrating session); behavior is identical either way.
import { useToggleState } from '../../src/stately/toggle/useToggleState';
import { useToggle } from '../../src/toggle/useToggle';
import { useCheckboxGroupState } from '../../src/stately/checkbox/useCheckboxGroupState';
import { useRadioGroupState } from '../../src/stately/radio/useRadioGroupState';
import {
	FormValidationContext,
	useFormValidationState,
} from '../../src/stately/form/useFormValidationState';
import { I18nProvider, useLocale } from '../../src/i18n/I18nProvider';
import { useNumberFormatter } from '../../src/i18n/useNumberFormatter';
import { useFilter } from '../../src/i18n/useFilter';

// --- useToggleState ---

// Uncontrolled: defaultSelected seeds the state; toggle() flips it and onChange observes
// each new value; defaultSelected is stable across updates.
export function ToggleUncontrolled() {
	const [log, setLog] = useState('none');
	const state = useToggleState({
		defaultSelected: true,
		onChange: (v: boolean) => setLog(String(v)),
	});
	return (
		<div>
			<button data-testid="toggle" onClick={() => state.toggle()}>
				{'toggle'}
			</button>
			<output data-testid="selected">{'sel:' + state.isSelected}</output>
			<output data-testid="default">{'def:' + state.defaultSelected}</output>
			<output data-testid="log">{'log:' + log}</output>
		</div>
	);
}

// Read only: toggle() and setSelected() are ignored and onChange never fires.
export function ToggleReadOnly() {
	const [log, setLog] = useState('none');
	const state = useToggleState({
		isReadOnly: true,
		defaultSelected: false,
		onChange: (v: boolean) => setLog(String(v)),
	});
	return (
		<div>
			<button data-testid="toggle" onClick={() => state.toggle()}>
				{'toggle'}
			</button>
			<button data-testid="on" onClick={() => state.setSelected(true)}>
				{'on'}
			</button>
			<output data-testid="selected">{'sel:' + state.isSelected}</output>
			<output data-testid="log">{'log:' + log}</output>
		</div>
	);
}

// Controlled: the parent wires onChange back into isSelected, so toggle() drives the
// rendered value through the parent.
export function ToggleControlled() {
	const [on, setOn] = useState(false);
	const state = useToggleState({ isSelected: on, onChange: setOn });
	return (
		<div>
			<button data-testid="toggle" onClick={() => state.toggle()}>
				{'toggle'}
			</button>
			<output data-testid="selected">{'sel:' + state.isSelected}</output>
		</div>
	);
}

// --- useToggle (aria) ---

// The returned inputProps drive a real checkbox input: `checked` follows the state and
// the native `input` event (octane's per-interaction event — there is no synthetic
// onChange) updates ToggleState with the input's checked value.
export function ToggleInputHarness() {
	const ref = useRef<HTMLInputElement | null>(null);
	const state = useToggleState({ defaultSelected: false });
	const { inputProps, isSelected } = useToggle({ 'aria-label': 'demo' }, state, ref);
	return (
		<div>
			<input {...inputProps} ref={ref} data-testid="input" />
			<output data-testid="selected">{'sel:' + isSelected}</output>
		</div>
	);
}

// --- useCheckboxGroupState ---

export function CheckboxGroupHarness() {
	const [log, setLog] = useState('none');
	const state = useCheckboxGroupState({
		defaultValue: ['a'],
		onChange: (v: string[]) => setLog(v.join('|') || 'empty'),
	});
	return (
		<div>
			<button data-testid="add-b" onClick={() => state.addValue('b')}>
				{'add b'}
			</button>
			<button data-testid="add-a" onClick={() => state.addValue('a')}>
				{'add a'}
			</button>
			<button data-testid="remove-a" onClick={() => state.removeValue('a')}>
				{'remove a'}
			</button>
			<button data-testid="toggle-c" onClick={() => state.toggleValue('c')}>
				{'toggle c'}
			</button>
			<output data-testid="value">{'v:' + state.value.join(',')}</output>
			<output data-testid="sel-a">{'a:' + state.isSelected('a')}</output>
			<output data-testid="log">{'log:' + log}</output>
		</div>
	);
}

// --- useRadioGroupState ---

export function RadioGroupHarness() {
	const [log, setLog] = useState('none');
	const state = useRadioGroupState({ defaultValue: 'a', onChange: (v: string) => setLog(v) });
	return (
		<div>
			<button data-testid="select-b" onClick={() => state.setSelectedValue('b')}>
				{'select b'}
			</button>
			<output data-testid="selected">{'v:' + state.selectedValue}</output>
			<output data-testid="default">{'def:' + state.defaultSelectedValue}</output>
			<output data-testid="log">{'log:' + log}</output>
		</div>
	);
}

export function RadioGroupControlled() {
	const [value, setValue] = useState<string | null>('x');
	const state = useRadioGroupState({ value, onChange: setValue });
	return (
		<div>
			<button data-testid="select-y" onClick={() => state.setSelectedValue('y')}>
				{'select y'}
			</button>
			<output data-testid="selected">{'v:' + state.selectedValue}</output>
		</div>
	);
}

export function RadioGroupReadOnly() {
	const state = useRadioGroupState({ defaultValue: 'a', isReadOnly: true });
	return (
		<div>
			<button data-testid="select-b" onClick={() => state.setSelectedValue('b')}>
				{'select b'}
			</button>
			<output data-testid="selected">{'v:' + state.selectedValue}</output>
		</div>
	);
}

// --- useFormValidationState ---

// Client validation with the default validationBehavior="aria": errors surface in both
// realtimeValidation and displayValidation as the value changes, with the custom-error
// validity shape.
export function FormValidationClient() {
	const [value, setValue] = useState('good');
	const validation = useFormValidationState({
		value,
		validate: (v: string) => (v === 'bad' ? 'Bad value' : null),
	});
	const d = validation.displayValidation;
	const r = validation.realtimeValidation;
	return (
		<div>
			<button data-testid="set-bad" onClick={() => setValue('bad')}>
				{'bad'}
			</button>
			<button data-testid="set-good" onClick={() => setValue('good')}>
				{'good'}
			</button>
			<output data-testid="display">
				{'d:' + d.isInvalid + ':' + d.validationErrors.join('|')}
			</output>
			<output data-testid="realtime">
				{'r:' + r.isInvalid + ':' + r.validationErrors.join('|')}
			</output>
			<output data-testid="details">
				{'custom:' + d.validationDetails.customError + ':valid:' + d.validationDetails.valid}
			</output>
		</div>
	);
}

function ServerField() {
	const validation = useFormValidationState({ value: 'x', name: 'username' });
	const d = validation.displayValidation;
	const r = validation.realtimeValidation;
	return (
		<div>
			<button data-testid="commit" onClick={() => validation.commitValidation()}>
				{'commit'}
			</button>
			<output data-testid="display">
				{'d:' + d.isInvalid + ':' + d.validationErrors.join('|')}
			</output>
			<output data-testid="realtime">
				{'r:' + r.isInvalid + ':' + r.validationErrors.join('|')}
			</output>
		</div>
	);
}

// Server errors arrive through FormValidationContext keyed by field name, and clear once
// the user commits a change.
export function FormValidationServer() {
	return (
		<FormValidationContext.Provider value={{ username: 'Username taken' }}>
			<ServerField />
		</FormValidationContext.Provider>
	);
}

// --- i18n ---

function LocaleProbe() {
	const { locale, direction } = useLocale();
	return <output data-testid="locale">{locale + ':' + direction}</output>;
}

export function LocaleWithProvider() {
	return (
		<I18nProvider locale="ar-AE">
			<LocaleProbe />
		</I18nProvider>
	);
}

export function LocaleDefault() {
	return <LocaleProbe />;
}

function NumberProbe() {
	const formatter = useNumberFormatter();
	return <output data-testid="number">{'n:' + formatter.format(1234.56)}</output>;
}

export function NumberDE() {
	return (
		<I18nProvider locale="de-DE">
			<NumberProbe />
		</I18nProvider>
	);
}

export function NumberUS() {
	return (
		<I18nProvider locale="en-US">
			<NumberProbe />
		</I18nProvider>
	);
}

// Case- and diacritic-insensitive matching via collator sensitivity "base".
export function FilterHarness() {
	const filter = useFilter({ sensitivity: 'base' });
	const results = [
		filter.contains('Hello World', 'o w'),
		filter.contains('café', 'CAFE'),
		filter.contains('Hello', 'xyz'),
		filter.startsWith('Testing', 'test'),
		filter.startsWith('Testing', 'ing'),
		filter.endsWith('Testing', 'ING'),
	];
	return <output data-testid="filter">{'f:' + results.join(',')}</output>;
}
