import { User } from 'lucide-react';
import { twMerge } from 'tailwind-merge';

type AvatarSize = '2xs' | 'xs' | 'sm' | 'md' | 'lg' | 'xl';

const sizeClasses: Record<AvatarSize, { container: string; text: string }> = {
	'2xs': { container: 'w-4 h-4', text: 'text-[8px]' },
	xs: { container: 'w-6 h-6', text: 'text-xs' },
	sm: { container: 'w-8 h-8', text: 'text-sm' },
	md: { container: 'w-10 h-10', text: 'text-base' },
	lg: { container: 'w-14 h-14', text: 'text-lg' },
	xl: { container: 'w-20 h-20', text: 'text-xl' },
};

interface AvatarProps {
	image?: string | null;
	oauthImage?: string | null;
	name?: string | null;
	email?: string | null;
	size?: AvatarSize;
	className?: string;
}

function getInitials(name?: string | null, email?: string | null): string {
	if (name) {
		const parts = name.trim().split(/\s+/);
		if (parts.length >= 2) {
			return `${parts[0]![0]}${parts[parts.length - 1]![0]}`.toUpperCase();
		}
		return name.slice(0, 2).toUpperCase();
	}
	if (email) {
		return email.slice(0, 2).toUpperCase();
	}
	return '';
}

export function Avatar({
	image,
	oauthImage,
	name,
	email,
	size = 'md',
	className = '',
}: AvatarProps) {
	const displayImage = image || oauthImage;
	const initials = getInitials(name, email);
	const { container, text } = sizeClasses[size];

	if (displayImage) {
		return (
			<img
				src={displayImage}
				alt={name || email || 'User avatar'}
				className={twMerge(container, 'rounded-full object-cover', className)}
			/>
		);
	}

	if (initials) {
		return (
			<div
				className={twMerge(
					container,
					text,
					'rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center font-medium text-gray-600 dark:text-gray-300',
					className,
				)}
			>
				{initials}
			</div>
		);
	}

	return (
		<div
			className={twMerge(
				container,
				'rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-gray-500 dark:text-gray-400',
				className,
			)}
		>
			<User className="w-1/2 h-1/2" />
		</div>
	);
}
