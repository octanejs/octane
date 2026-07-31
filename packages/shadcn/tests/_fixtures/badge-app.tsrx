// Minimal fixtures for the Badge proof component.
import { createElement } from 'octane';
import { Badge } from '@octanejs/shadcn/Badge';

export function DefaultBadge() @{
	<Badge>New</Badge>
}

export function SecondaryBadge() @{
	<Badge variant="secondary" className="custom-extra">Beta</Badge>
}

export function OverridingBadge() @{
	<Badge className="overflow-visible" id="host-props" title="badge">x</Badge>
}

// asChild composes an element DESCRIPTOR (the documented radix Slot contract),
// so the child anchor is created via createElement rather than .tsrx children.
export function AsChildBadge() {
	return createElement(
		Badge,
		{ asChild: true, variant: 'outline' },
		createElement('a', { href: '#releases' }, 'Releases'),
	);
}
