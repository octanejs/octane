import { useContext, useState } from 'octane';
import { Provider } from '../../src/components/utils';
import { Button } from '../../src/components/Button';
import { FieldError, FieldErrorContext } from '../../src/components/FieldError';
import { Form } from '../../src/components/Form';
import { Group } from '../../src/components/Group';
import { Header } from '../../src/components/Header';
import { Heading } from '../../src/components/Heading';
import { Input, InputContext } from '../../src/components/Input';
import { Label, LabelContext } from '../../src/components/Label';
import { Link } from '../../src/components/Link';
import { ProgressBar } from '../../src/components/ProgressBar';
import { Separator } from '../../src/components/Separator';
import { TextArea } from '../../src/components/TextArea';
import { Toolbar } from '../../src/components/Toolbar';
import { FormValidationContext } from '../../src/stately/form/useFormValidationState';

// ---------------------------------------------------------------------------
// Button: press/hover interaction state lands in data-* attributes and in the
// className render-prop values; onPress fires through octane's native events.
// ---------------------------------------------------------------------------

export function ButtonScenario() {
	const [count, setCount] = useState(0);
	return (
		<Button
			className={(v: any) =>
				String(v.defaultClassName) +
				(v.isPressed ? ' is-pressed' : '') +
				(v.isHovered ? ' is-hovered' : '')
			}
			onPress={() => setCount((c) => c + 1)}
		>
			{'presses:' + count}
		</Button>
	);
}

// Pending state: disables press while retaining focusability and rewires the
// accessible name to include the progress announcement.
export function PendingButton() {
	const [pending, setPending] = useState(false);
	return (
		<div>
			<button id="toggle-pending" onClick={() => setPending(true)}>
				start
			</button>
			<Button id="save-btn" aria-label="Save" isPending={pending}>
				Save
			</Button>
		</div>
	);
}

// ---------------------------------------------------------------------------
// Label/Input/TextArea wired through TextField-style contexts under Provider.
// ---------------------------------------------------------------------------

export function LabeledField() {
	return (
		<Provider
			values={
				[
					[LabelContext, { id: 'field-label', htmlFor: 'field-input' }],
					[InputContext, { id: 'field-input', 'aria-labelledby': 'field-label' }],
				] as any
			}
		>
			<Label>Name</Label>
			<Input placeholder="name" />
			<TextArea data-testid="notes" />
		</Provider>
	);
}

// ---------------------------------------------------------------------------
// FieldError renders only when the field-level validation context is invalid.
// The provider stays mounted; only its value toggles (stable tree).
// ---------------------------------------------------------------------------

const validValidation = {
	isInvalid: false,
	validationErrors: [] as string[],
	validationDetails: {} as any,
};
const invalidValidation = {
	isInvalid: true,
	validationErrors: ['Value is required.', 'Too short.'],
	validationDetails: {} as any,
};

export function FieldErrorScenario() {
	const [invalid, setInvalid] = useState(false);
	return (
		<div>
			<button id="make-invalid" onClick={() => setInvalid(true)}>
				invalidate
			</button>
			<FieldErrorContext.Provider value={invalid ? invalidValidation : validValidation}>
				<FieldError data-testid="error" />
				<FieldError
					data-testid="error-fn"
					children={(v: any) => 'errors:' + (v.validationErrors as string[]).join('+')}
				/>
			</FieldErrorContext.Provider>
		</div>
	);
}

// ---------------------------------------------------------------------------
// ProgressBar: ARIA value attributes plus the percentage/valueText render prop;
// a slotted <Label> child links up via aria-labelledby.
// ---------------------------------------------------------------------------

export function ProgressScenario() {
	return (
		<div>
			<ProgressBar
				id="pb"
				value={30}
				aria-label="Loading"
				children={(v: any) => 'pct:' + String(v.percentage) + '|' + String(v.valueText)}
			/>
			<ProgressBar id="pb-labeled" value={25}>
				<Label>Upload</Label>
			</ProgressBar>
		</div>
	);
}

// ---------------------------------------------------------------------------
// Link: renders <a> when href is present (and not disabled), otherwise a
// <span role="link">; hover state lands in data-hovered.
// ---------------------------------------------------------------------------

export function LinkScenario() {
	return (
		<div>
			<Link id="real-link" href="https://example.com/docs" target="_blank">
				Docs
			</Link>
			<Link id="span-link">Fake</Link>
			<Link id="disabled-link" href="https://example.com" isDisabled>
				Nope
			</Link>
		</div>
	);
}

// ---------------------------------------------------------------------------
// Layout primitives: Group/Toolbar/Separator/Header/Heading roles and tags.
// ---------------------------------------------------------------------------

export function LayoutScenario() {
	return (
		<div>
			<Group id="grp" aria-label="Controls">
				<span>child</span>
			</Group>
			<Toolbar id="tb" aria-label="Tools" orientation="vertical">
				<Button>B1</Button>
			</Toolbar>
			<Separator id="sep" />
			<Separator id="vsep" orientation="vertical" />
			<Header id="hd">Section</Header>
			<Heading id="h-default">Title</Heading>
			<Heading id="h-one" level={1}>
				Big
			</Heading>
		</div>
	);
}

// ---------------------------------------------------------------------------
// Form: validationBehavior drives noValidate, validationErrors flow into
// FormValidationContext, and a native reset restores default values.
// ---------------------------------------------------------------------------

function ErrorsProbe() {
	const errors = useContext(FormValidationContext);
	return <span data-testid="server-errors">{'username:' + String((errors as any).username)}</span>;
}

export function FormScenario() {
	const [behavior, setBehavior] = useState<'native' | 'aria'>('native');
	return (
		<div>
			<button id="use-aria" onClick={() => setBehavior('aria')}>
				aria
			</button>
			<Form
				id="the-form"
				validationBehavior={behavior}
				validationErrors={{ username: 'Username is taken.' }}
			>
				<Input id="uname" name="username" defaultValue="alice" />
				<ErrorsProbe />
			</Form>
		</div>
	);
}
