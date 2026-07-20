import { PersonStanding, Zap } from 'lucide-react';
import { twMerge } from 'tailwind-merge';
import { CogsIcon } from '~/components/icons/CogsIcon';
import { virtual } from './libraries';

const textStyles = 'text-violet-700 dark:text-violet-400';

export const virtualProject = {
	...virtual,
	description: `Virtualize only the visible content for massive scrollable DOM nodes at 60FPS in TS/JS, React, Vue, Solid, Svelte, Lit, Angular & Marko while retaining 100% control over markup and styles.`,
	latestBranch: 'main',
	bgRadial: 'from-purple-500 via-violet-600/50 to-transparent',
	textColor: 'text-purple-600',
	defaultDocs: 'introduction',
	legacyPackages: ['react-virtual'],
	testimonials: [
		{
			quote:
				'We chose TanStack Virtual for our virtualization needs - it handles our massive lists without breaking a sweat.',
			author: 'Evan Bacon',
			role: '@Baconbrix',
			company: 'Expo',
		},
		{
			quote:
				'TanStack Virtual is the answer when you need to render thousands of rows without destroying performance. Headless, flexible, and just works.',
			author: 'Developer Review',
			role: 'Community',
			company: '',
		},
		{
			quote:
				'For anyone dealing with large datasets in React, TanStack Virtual is a must. The row virtualizer alone saved our app.',
			author: 'Community Developer',
			role: 'GitHub Discussion',
			company: '',
		},
	],
	featureHighlights: [
		{
			title: 'Designed for zero design',
			icon: (
				<div className="text-center overflow-hidden">
					<PersonStanding className="text-purple-400" />
				</div>
			),
			description: (
				<div>
					Headless Virtualization means you're always in control of your{' '}
					<span className={twMerge('font-semibold', textStyles)}>
						markup, styles and components
					</span>
					. Go design and implement the most beautiful UI you can dream up and let us take care of
					the hard parts.
				</div>
			),
		},
		{
			title: 'Big Power, Small Package',
			icon: <Zap className="text-purple-500" />,
			description: (
				<div>
					Don't be fooled by the small bundle size. TanStack Virtual uses every byte to deliver
					powerful performance. After all,{' '}
					<span className={twMerge('font-semibold', textStyles)}>60FPS is table stakes</span> these
					days and we refuse to sacrifice anything for that 🧈-y smooth UX.
				</div>
			),
		},
		{
			title: 'Maximum Composability',
			icon: <CogsIcon className="text-purple-600" />,
			description: (
				<div>
					With a single function/hook, you'll get limitless virtualization for{' '}
					<span className={twMerge('font-semibold', textStyles)}>
						vertical, horizontal, and grid-style{' '}
					</span>
					layouts. The API is tiny (literally 1 function), but its composability is not.
				</div>
			),
		},
	],
};
