import { twMerge } from 'tailwind-merge';

type BadgeVariant =
	'default' | 'success' | 'warning' | 'error' | 'info' | 'purple' | 'teal' | 'orange';

type BadgeProps = {
	children: React.ReactNode;
	variant?: BadgeVariant;
	className?: string;
};

const variantStyles: Record<BadgeVariant, string> = {
	default: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300',
	success: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
	warning: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
	error: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
	info: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
	purple: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
	teal: 'bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-300',
	orange: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
};

export function Badge({ children, variant = 'default', className }: BadgeProps) {
	return (
		<span
			className={twMerge(
				'inline-flex items-center px-2 py-1 rounded-full text-xs font-medium',
				variantStyles[variant],
				className,
			)}
		>
			{children}
		</span>
	);
}
