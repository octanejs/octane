import { adoptBindings, type BindingSource } from 'octane/behavior';
import { View, type ViewProps } from './View.tsrx';

export function activate(root: Element, source: BindingSource<ViewProps>, signal: AbortSignal) {
	return adoptBindings(root, View, source, { signal });
}
