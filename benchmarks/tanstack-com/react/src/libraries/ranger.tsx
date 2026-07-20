import { MessageCircleQuestionMark, PlugZap, RotateCw } from 'lucide-react';
import { twMerge } from 'tailwind-merge';
import { ranger } from './libraries';

const textStyles = 'text-black dark:text-gray-100';

export const rangerProject = {
	...ranger,
	description: `Headless, lightweight, and extensible primitives for building range and multi-range sliders.`,
	latestBranch: 'main',
	featureHighlights: [
		{
			title: 'Typesafe & powerful, yet familiarly simple',
			icon: <PlugZap className={twMerge('scale-125 animate-pulse', textStyles)} />,
			description: (
				<div>
					Hooks for building range and multi-range sliders in React{' '}
					<span className={twMerge('font-semibold', textStyles)}>
						100% typesafe without compromising on DX
					</span>
					.
				</div>
			),
		},
		{
			title: '"Headless" UI library',
			icon: (
				<RotateCw
					className={twMerge('animate-spin', textStyles)}
					style={{
						animationDuration: '3s',
						animationTimingFunction: 'ease-in-out',
					}}
				/>
			),
			description: (
				<div>
					Headless and extensible. Ranger doesn't render or supply any actual UI elements. It's a{' '}
					<span className={twMerge('font-semibold', textStyles)}>
						utility for building your own custom-designed UI components
					</span>
					.
				</div>
			),
		},
		{
			title: 'Extensible',
			icon: <MessageCircleQuestionMark className={twMerge('', textStyles)} />,
			description: (
				<div>
					Designed with maximum inversion of control in mind, Ranger is built to be{' '}
					<span className={twMerge('font-semibold', textStyles)}>
						easily extended and customized
					</span>{' '}
					to fit your needs.
				</div>
			),
		},
	],
};
