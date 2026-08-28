import type { OctaneNode } from 'octane';
import Select from '../src/index';
import makeAnimated from '../src/animated/index';
import { Collapse, Fade } from '../src/animated/transitions.tsrx';

let capturedInputProps: Record<string, unknown> = {};

function InputProbe(props: Record<string, unknown>) @{
	capturedInputProps = props;
	<input id="animated-input-probe" data-consumer={String(props.consumer)} />
}

function FadeProbe(props: Record<string, unknown>) @{
	const innerProps = props.innerProps as Record<string, unknown>;
	<div id="animated-fade-probe" data-consumer={String(props.consumer)} {...innerProps}>fade</div>
}

export function AnimatedInputFixture() @{
	const Input = makeAnimated({ Input: InputProbe as never }).Input!;
	<Input in onExited={() => {}} appear enter exit consumer="preserved" />
}

export function AnimatedSingleSelectFixture() @{
	<Select
		components={makeAnimated()}
		defaultValue={{ label: 'Selected option', value: 'selected' }}
		inputId="animated-single-input"
		instanceId="animated-single"
		options={[
			{ label: 'Selected option', value: 'selected' },
		]}
	/>
}

export function FadeFixture() @{
	<Fade component={FadeProbe} in duration={25} consumer="fade-consumer" />
}

export function FadeInnerPropsFixture() @{
	<Fade
		component={FadeProbe}
		in
		duration={25}
		consumer="fade-consumer"
		innerProps={{ id: 'fade-placeholder-id', style: { color: 'red' } }}
	/>
}

export function CollapseFixture(props: { children?: OctaneNode }) @{
	<Collapse in>{props.children ?? 'collapse'}</Collapse>
}

export function readCapturedInputProps() {
	return capturedInputProps;
}
