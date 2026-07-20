import { twMerge } from 'tailwind-merge';
import { useLocation, useParams } from '@tanstack/react-router';
import { findLibrary } from '~/libraries';

export function BackgroundGradient() {
	let libraryId = useParams({
		select: (p) => p.libraryId,
		strict: false,
	}) as string;
	const location = useLocation();

	if (!libraryId) {
		const pathnameLibraryId = location.pathname.split('/')[1];

		if (pathnameLibraryId) {
			libraryId = pathnameLibraryId;
		}
	}

	const library = findLibrary(libraryId);

	return (
		<div
			className={twMerge(
				'fixed inset-0 z-0 pointer-events-none',
				'transition-opacity duration-[2s] ease-linear',
				'bg-radial',
				'to-transparent',
				...(library?.bgRadial
					? [library.bgRadial]
					: [
							'from-gray-300 via-gray-300/50',
							'dark:from-gray-300 dark:via-gray-300/30',
							'to-transparent',
						]),
				'opacity-20 dark:opacity-20',
			)}
		/>
	);
}
