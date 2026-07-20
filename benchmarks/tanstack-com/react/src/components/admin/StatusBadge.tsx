import { Badge } from '~/ui';

type StatusBadgeProps = {
	status: string;
	className?: string;
};

const statusVariants: Record<string, 'success' | 'warning' | 'error' | 'info' | 'default'> = {
	// Approval statuses
	approved: 'success',
	pending: 'warning',
	denied: 'error',

	// Active/Inactive
	active: 'success',
	inactive: 'default',

	// Boolean states
	true: 'success',
	false: 'default',

	// OAuth providers
	github: 'default',
	google: 'info',
};

export function StatusBadge({ status, className }: StatusBadgeProps) {
	const variant = statusVariants[status.toLowerCase()] || 'default';

	return (
		<Badge variant={variant} className={className}>
			{status}
		</Badge>
	);
}
