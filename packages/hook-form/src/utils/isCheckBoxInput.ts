// Vendored from react-hook-form@7.81.0 src/utils/isCheckBoxInput.ts (octane port).
import type { FieldElement } from '../types';

export default (element: FieldElement): element is HTMLInputElement => element.type === 'checkbox';
