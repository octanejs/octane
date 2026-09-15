// Adapted from react-hook-form@7.88.0 src/logic/getFieldValue.ts for Octane.
import type { Field } from '../types';
import isCheckBox from '../utils/isCheckBoxInput';
import isFileInput from '../utils/isFileInput';
import isMultipleSelect from '../utils/isMultipleSelect';
import isRadioInput from '../utils/isRadioInput';

import getCheckboxValue from './getCheckboxValue';
import getFieldValueAs from './getFieldValueAs';
import getRadioValue from './getRadioValue';

export default function getFieldValue(_f: Field['_f']) {
	const ref = _f.ref;

	if (isFileInput(ref)) {
		return ref.files;
	}

	if (isRadioInput(ref)) {
		return getRadioValue(_f.refs).value;
	}

	if (isMultipleSelect(ref)) {
		return [...ref.selectedOptions].map(({ value }) => value);
	}

	if (isCheckBox(ref)) {
		return getCheckboxValue(_f.refs).value;
	}

	return getFieldValueAs(ref.value, _f);
}
