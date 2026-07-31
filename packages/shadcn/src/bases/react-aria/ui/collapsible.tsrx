import {
	DisclosurePanel as CollapsibleContentPrimitive,
	Disclosure as CollapsiblePrimitive,
	Button as CollapsibleTriggerPrimitive,
	type ButtonProps,
	type DisclosurePanelProps,
	type DisclosureProps,
} from '@octanejs/aria/components';

export function Collapsible({ ...props }: DisclosureProps) {
	return <CollapsiblePrimitive data-slot="collapsible" {...props} />;
}

export function CollapsibleTrigger({ ...props }: ButtonProps) {
	return <CollapsibleTriggerPrimitive slot="trigger" data-slot="collapsible-trigger" {...props} />;
}

export function CollapsibleContent({ ...props }: DisclosurePanelProps) {
	return <CollapsibleContentPrimitive data-slot="collapsible-content" {...props} />;
}
