import { twMerge } from 'tailwind-merge';
import { Loader2 } from '@octanejs/lucide';

interface SpinnerProps {
	className?: string;
}

export function Spinner({ className }: SpinnerProps) {
	return <Loader2
		className={twMerge('animate-spin text-gray-900 dark:text-white text-2xl', className)}
		aria-label="Loading"
	/>;
}
