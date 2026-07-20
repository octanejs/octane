import { Badge } from '~/ui';
import type { Capability } from '~/db/types';

type CapabilityBadgeProps = {
	capability: Capability | string;
	className?: string;
};

const capabilityVariants: Record<
	string,
	'error' | 'purple' | 'info' | 'orange' | 'success' | 'teal' | 'default'
> = {
	admin: 'error',
	disableAds: 'purple',
	builder: 'info',
	'moderate-feedback': 'success',
	'moderate-showcases': 'teal',
};

export function CapabilityBadge({ capability, className }: CapabilityBadgeProps) {
	const variant = capabilityVariants[capability] || 'default';

	return (
		<Badge variant={variant} className={className}>
			{capability}
		</Badge>
	);
}
