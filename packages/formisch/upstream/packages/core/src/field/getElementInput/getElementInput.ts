import { untrack } from '../../framework/index.ts';
import type { FieldElement, InternalFieldStore } from '../../types/index.ts';
import { getFieldInput } from '../getFieldInput/index.ts';

/**
 * Returns the current input of the element. Handles special cases for select
 * multiple, checkbox groups, radio groups, and file inputs.
 *
 * @param element The field element.
 * @param internalFieldStore The internal field store.
 *
 * @returns The element input.
 */
// @__NO_SIDE_EFFECTS__
export function getElementInput(
  element: FieldElement,
  internalFieldStore: InternalFieldStore
): unknown {
  // If element is select with multiple option, return selected values
  // @ts-expect-error
  if (element.options && element.multiple) {
    // @ts-expect-error
    return [...element.options]
      .filter((option) => option.selected && !option.disabled)
      .map((option) => option.value);
  }

  // If element is checkbox, handle single or group
  if (element.type === 'checkbox') {
    // Get all checkboxes with same name
    const options = document.getElementsByName(element.name);

    // If checkbox group, return array of checked values
    if (options.length > 1) {
      // @ts-expect-error
      return [...options]
        .filter((option) => option.checked)
        .map((option) => option.value);
    }

    // Return single checkbox checked state
    // @ts-expect-error
    return element.checked;
  }

  // If element is radio, handle as string
  if (element.type === 'radio') {
    // If radio is checked, return its value
    // @ts-expect-error
    if (element.checked) {
      return element.value;
    }

    // Otherwise, return previous value
    return untrack(() => getFieldInput(internalFieldStore));
  }

  // If element is file input, handle single or multiple
  if (element.type === 'file') {
    // If multiple files allowed, return files array
    // @ts-expect-error
    if (element.multiple) {
      return [
        // @ts-expect-error
        ...element.files,
      ];
    }

    // Return single file
    // @ts-expect-error
    return element.files[0];
  }

  // Return element value for all other input types
  return element.value;
}
