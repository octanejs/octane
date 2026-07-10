// Vendored from react-hook-form@7.81.0 src/utils/isMultipleSelect.ts (octane port).
import type { FieldElement } from '../types';

export default (element: FieldElement): element is HTMLSelectElement =>
	element.type === `select-multiple`;
