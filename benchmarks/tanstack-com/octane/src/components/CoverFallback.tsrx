import { twMerge } from 'tailwind-merge';
import { gradientBackgroundCss } from '~/utils/ogGradient';

type CoverFallbackProps = {
	slug: string;
	library?: string;
	className?: string;
	style?: any;
};

export function CoverFallback({ slug, library, className, style }: CoverFallbackProps) {
	return <div
		aria-hidden="true"
		class={twMerge(
			'bg-gray-100 dark:bg-gray-900 ring-1 ring-gray-200 dark:ring-gray-800',
			className,
		)}
		style={{
			...style,
			backgroundImage: gradientBackgroundCss(slug, library),
		}}
	/>;
}
