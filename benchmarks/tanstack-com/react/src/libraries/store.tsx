import { WandSparkles } from 'lucide-react';
import { twMerge } from 'tailwind-merge';
import { store } from './libraries';

const textStyles = 'text-twine-600 dark:text-twine-500';

export const storeProject = {
	...store,
	description: `The immutable-reactive data store that powers the core of TanStack libraries and their framework adapters.`,
	latestBranch: 'main',
	bgRadial: 'from-twine-500 via-twine-700/50 to-transparent',
	textColor: 'text-twine-700',
	defaultDocs: 'overview',
	featureHighlights: [
		{
			title: 'Battle-Tested',
			icon: <WandSparkles className={twMerge(textStyles)} />,
			description: (
				<div>
					TanStack Store is widely adopted across the TanStack ecosystem, powering libraries like
					TanStack Form, TanStack Router, and more. It has been{' '}
					<span className={twMerge('font-semibold', textStyles)}>
						battle-tested in production environments, ensuring reliability and performance
					</span>{' '}
					for developers.
				</div>
			),
		},
		{
			title: 'Tiny Bundle Size',
			icon: <WandSparkles className={twMerge(textStyles)} />,
			description: (
				<div>
					Designed with a focus on performance and efficiency, boasting a{' '}
					<span className={twMerge('font-semibold', textStyles)}>tiny bundle size</span> that
					ensures fast loading times and minimal impact on application performance. This makes it an
					ideal choice for developers looking to optimize their applications.
				</div>
			),
		},
		{
			title: 'Framework Agnostic',
			icon: <WandSparkles className={twMerge(textStyles)} />,
			description: (
				<div>
					TanStack Store is{' '}
					<span className={twMerge('font-semibold', textStyles)}>framework agnostic</span>, with
					adapters available for popular frameworks like React, Vue, Angular, Solid, and Svelte.
					This flexibility allows developers to use the store in their preferred framework without
					being locked into a specific ecosystem.
				</div>
			),
		},
	],
};
