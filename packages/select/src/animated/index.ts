import memoize from 'memoize-one';
import { defaultComponents, type SelectComponentsGeneric } from '../components.tsrx';
import { animatedInput } from './input.tsrx';
import { animatedMultiValue } from './multi-value.tsrx';
import { animatedPlaceholder } from './placeholder.tsrx';
import { animatedSingleValue } from './single-value.tsrx';
import { animatedValueContainer } from './value-container.tsrx';

function makeAnimated(
	externalComponents: Partial<SelectComponentsGeneric> = {},
): Partial<SelectComponentsGeneric> {
	const components = defaultComponents({ components: externalComponents });
	const { Input, MultiValue, Placeholder, SingleValue, ValueContainer, ...rest } = components;
	return {
		Input: animatedInput(Input),
		MultiValue: animatedMultiValue(MultiValue),
		Placeholder: animatedPlaceholder(Placeholder),
		SingleValue: animatedSingleValue(SingleValue),
		ValueContainer: animatedValueContainer(ValueContainer),
		...rest,
	};
}

const AnimatedComponents = makeAnimated();

export const Input = AnimatedComponents.Input;
export const MultiValue = AnimatedComponents.MultiValue;
export const Placeholder = AnimatedComponents.Placeholder;
export const SingleValue = AnimatedComponents.SingleValue;
export const ValueContainer = AnimatedComponents.ValueContainer;

export default memoize(makeAnimated);
