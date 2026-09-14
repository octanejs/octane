// Adapted from react-hook-form@7.88.0 src/utils/isRadioInput.ts for Octane.
import type { FieldElement } from '../types';

export default (element: FieldElement): element is HTMLInputElement => element.type === 'radio';
