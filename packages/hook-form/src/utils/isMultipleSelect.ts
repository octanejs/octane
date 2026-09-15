// Adapted from react-hook-form@7.88.0 src/utils/isMultipleSelect.ts for Octane.
import type { FieldElement } from '../types';

export default (element: FieldElement): element is HTMLSelectElement =>
	element.type === `select-multiple`;
