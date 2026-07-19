import { useState } from 'octane';
import {
	Button,
	Checkbox,
	Disclosure,
	DisclosurePanel,
	Heading,
	Input,
	Label,
	TextField,
	ToggleButton,
} from '@octanejs/aria/components';

// Phase-4 differential fixtures: the SAME react-aria-components trees run through
// @octanejs/aria/components (octane) and the real react-aria-components 1.19.0
// (tests/differential/_setup.ts rewrites the import). RAC's data-* state attributes
// (data-hovered/pressed/selected/expanded) make interaction state visible to the
// HTML-only byte compare, per the migration plan's Phase-4 exit criterion.

function pressedClass(values: { isPressed: boolean; isHovered: boolean }) {
	return 'btn' + (values.isPressed ? ' is-pressed' : '') + (values.isHovered ? ' is-hovered' : '');
}

export function ButtonSpec() {
	const [count, setCount] = useState(0);
	return <div>
		<Button id="btn" className={pressedClass} onPress={() => setCount((c: number) => c + 1)}>
			Press me
		</Button>
		<output>
			{'presses:' + count}
		</output>
	</div>;
}

export function ToggleButtonSpec() {
	return <ToggleButton id="toggle">Bold</ToggleButton>;
}

function checkboxClass(values: { isSelected: boolean }) {
	return 'cb' + (values.isSelected ? ' is-selected' : '');
}

export function CheckboxSpec() {
	return <Checkbox className={checkboxClass}>
		Agree to terms
	</Checkbox>;
}

export function TextFieldSpec() {
	return <TextField defaultValue="">
		<Label>Name</Label>
		<Input id="name-input" />
	</TextField>;
}

export function DisclosureSpec() {
	return <Disclosure>
		<Heading>
			<Button slot="trigger">Show details</Button>
		</Heading>
		<DisclosurePanel>
			<p>The hidden details.</p>
		</DisclosurePanel>
	</Disclosure>;
}
