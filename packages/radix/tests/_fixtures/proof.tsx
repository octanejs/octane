import { createElement } from 'octane';
import { Separator, Label, Slot } from '@octanejs/radix';

// Simple prop-only components (JSX).
export function SepPlain() {
	return <Separator.Root orientation="vertical" />;
}

export function SepDecorative() {
	return <Separator.Root decorative />;
}

export function LabelPlain() {
	return <Label.Root class="lbl">{'name'}</Label.Root>;
}

// asChild — the child element is passed as a DESCRIPTOR (via createElement) so `Slot` can
// inspect + clone it (in `.tsrx`/`.tsx`, children-position JSX would be a render function).
export function SepAsChild() {
	return createElement(
		Separator.Root,
		{ asChild: true, orientation: 'vertical', class: 'sep' },
		createElement('hr', { class: 'rule' }),
	);
}

// Slot directly: merges its props onto the child (class composes, data-*/id merge) while
// preserving the child's own props + children.
export function SlotMerge() {
	return createElement(
		Slot,
		{ class: 'from-slot', 'data-slot': 'yes', id: 'merged' },
		createElement('button', { class: 'btn', type: 'button' }, 'go'),
	);
}
