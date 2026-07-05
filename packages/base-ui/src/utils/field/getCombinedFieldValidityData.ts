// Ported from .base-ui/packages/react/src/field/utils/getCombinedFieldValidityData.ts.
// Folds the external `invalid` flag into the field's stateful validity.
import type { FieldValidityData } from './constants';

export function getCombinedFieldValidityData(
	validityData: FieldValidityData,
	invalid: boolean | undefined,
): FieldValidityData {
	return {
		...validityData,
		state: {
			...validityData.state,
			valid: !invalid && validityData.state.valid,
		},
	};
}
