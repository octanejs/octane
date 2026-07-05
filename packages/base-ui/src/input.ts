// Ported from .base-ui/packages/react/src/input/Input.tsx (v1.6.0). A native `<input>` that
// works with Field out of the box — literally `<Field.Control/>`.
import { createElement } from 'octane';

import { Field } from './field';

export function Input(props: any): any {
	return createElement(Field.Control, props);
}
