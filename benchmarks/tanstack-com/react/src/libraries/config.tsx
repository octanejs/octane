import { WandSparkles, Zap } from 'lucide-react';
import { twMerge } from 'tailwind-merge';
import { CogsIcon } from '~/components/icons/CogsIcon';
import { config } from './libraries';

const textStyles = 'text-black dark:text-gray-100';

export const configProject = {
	...config,
	description: `Opinionated tooling to lint, build, test, version, and publish JS/TS packages — minimal config, consistent results.`,
	latestBranch: 'main',
	featureHighlights: [
		{
			title: 'Intuitive Configuration',
			icon: <WandSparkles className="text-black dark:text-gray-100" />,
			description: (
				<div>
					TanStack Config offers a seamless and intuitive configuration management system that
					simplifies the process of building and publishing high-quality JavaScript packages.
					TanStack Config{' '}
					<span className={twMerge('font-semibold', textStyles)}>
						streamlines the configuration process, allowing developers to focus on writing code
					</span>{' '}
					without the hassle of intricate setup procedures.
				</div>
			),
		},
		{
			title: 'Vite-Powered Builds',
			icon: <Zap className="text-black dark:text-gray-100" />,
			description: (
				<div>
					TanStack Config's build configuration harnesses the Vite ecosystem. Customize and extend
					your build workflows with ease, tailoring them to meet the unique requirements of your
					project.{' '}
					<span className={twMerge('font-semibold', textStyles)}>
						Whether you need advanced optimizations, pre-processors, or other specialized tools,
					</span>{' '}
					TanStack Config provides a robust foundation for crafting a build pipeline that suits your
					specific needs.
				</div>
			),
		},
		{
			title: 'Effortless Publication',
			icon: <CogsIcon className="text-black dark:text-gray-100" />,
			description: (
				<div>
					Say goodbye to the complexities of code publishing. This package provides tools designed
					to automate the publication of your projects. Developers can effortlessly publish updates,
					manage versioning, and release on npm and GitHub.{' '}
					<span className={twMerge('font-semibold', textStyles)}>
						TanStack Config takes care of the tedious aspects of package publishing,
					</span>{' '}
					empowering developers to share their work with the community efficiently.
				</div>
			),
		},
	],
};
