import { User } from 'lucide-react';
import { twMerge } from 'tailwind-merge';

type UserAvatarProps = {
	image?: string | null;
	name?: string | null;
	size?: 'sm' | 'md' | 'lg';
	className?: string;
};

const sizeClasses = {
	sm: 'h-6 w-6',
	md: 'h-8 w-8',
	lg: 'h-10 w-10',
};

const iconSizes = {
	sm: 'w-3 h-3',
	md: 'w-4 h-4',
	lg: 'w-5 h-5',
};

export function UserAvatar({ image, name, size = 'md', className }: UserAvatarProps) {
	const sizeClass = sizeClasses[size];
	const iconSize = iconSizes[size];

	if (image) {
		return (
			<img className={twMerge('rounded-full', sizeClass, className)} src={image} alt={name || ''} />
		);
	}

	return (
		<div
			className={twMerge(
				'rounded-full bg-gray-300 dark:bg-gray-600 flex items-center justify-center',
				sizeClass,
				className,
			)}
		>
			<User className={twMerge('text-gray-500 dark:text-gray-400', iconSize)} />
		</div>
	);
}
