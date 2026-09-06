import type { StateAttributesMapping } from '../../internals/getStateAttributesProps';
import type { NumberFieldRootState } from '../root/NumberFieldRoot.tsrx';
import { fieldValidityMapping } from '../../internals/field-constants/constants';

export const stateAttributesMapping: StateAttributesMapping<NumberFieldRootState> = {
	inputValue: () => null,
	value: () => null,
	...fieldValidityMapping,
};
