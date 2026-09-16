import { adoptBindings, type BindingSource } from 'octane/behavior';
import { View, type Props } from './View.tsrx';

export function activate(root: Element, source: BindingSource<Props>) {
	return adoptBindings(root, View, source);
}
