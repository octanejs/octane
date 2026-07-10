// Vendored from react-hook-form@7.81.0 src/utils/isRadioOrCheckbox.ts (octane port).
import type { FieldElement } from '../types';

import isCheckBoxInput from './isCheckBoxInput';
import isRadioInput from './isRadioInput';

export default (ref: FieldElement): ref is HTMLInputElement =>
	isRadioInput(ref) || isCheckBoxInput(ref);
