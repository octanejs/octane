import { WandSparkles, Zap } from 'lucide-react';
import { twMerge } from 'tailwind-merge';
import { CogsIcon } from '~/components/icons/CogsIcon';
import { devtools } from './libraries';

const textStyles = 'text-black dark:text-gray-100';

export const devtoolsProject = {
	...devtools,
	description: `A unified devtools panel that houses all TanStack devtools and allows you to create and integrate your own custom devtools.`,
	latestBranch: 'main',
	featureHighlights: [
		{
			title: 'Unified Devtools Panel',
			icon: <WandSparkles className="text-black dark:text-gray-100" />,
			description: (
				<div>
					TanStack Devtools provides a centralized panel that houses all TanStack library devtools
					in one place. No more switching between different devtools panels - everything you need is{' '}
					<span className={twMerge('font-semibold', textStyles)}>
						organized and accessible from a single interface
					</span>{' '}
					for a streamlined development experience.
				</div>
			),
		},
		{
			title: 'Framework Agnostic',
			icon: <Zap className="text-black dark:text-gray-100" />,
			description: (
				<div>
					Built with Solid.js for lightweight performance, but designed to work within any
					framework. Create and integrate your own custom devtools regardless of your tech stack.{' '}
					<span className={twMerge('font-semibold', textStyles)}>
						Whether you're using React, Vue, Angular, or any other framework,
					</span>{' '}
					TanStack Devtools provides the flexibility you need.
				</div>
			),
		},
		{
			title: 'Custom Devtools Support',
			icon: <CogsIcon className="text-black dark:text-gray-100" />,
			description: (
				<div>
					Extend the devtools panel with your own custom devtools. The platform is designed to be
					extensible, allowing you to create devtools for your specific needs and integrate them
					seamlessly.{' '}
					<span className={twMerge('font-semibold', textStyles)}>
						Build, share, and use custom devtools that enhance your development workflow
					</span>{' '}
					while maintaining the same unified experience.
				</div>
			),
		},
	],
};
