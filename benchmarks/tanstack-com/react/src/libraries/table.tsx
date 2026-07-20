import { PersonStanding, Zap } from 'lucide-react';
import { twMerge } from 'tailwind-merge';
import { CogsIcon } from '~/components/icons/CogsIcon';
import { table } from './libraries';

const textStyles = 'text-blue-500 dark:text-blue-400';

export const tableProject = {
	...table,
	description: `Supercharge your tables or build a datagrid from scratch for TS/JS, React, Vue, Solid, Svelte, Qwik, Angular, and Lit while retaining 100% control over markup and styles.`,
	latestBranch: 'main',
	bgRadial: 'from-cyan-500 via-blue-600/50 to-transparent',
	textColor: 'text-blue-600',
	defaultDocs: 'introduction',
	legacyPackages: ['react-table'],
	testimonials: [
		{
			quote:
				'Introducing Table and Data Table components. Powered by TanStack Table. With Pagination, Row Selection, Sorting, Filters, Row Actions and Keyboard Navigation.',
			author: 'shadcn',
			role: '@shadcn',
			company: 'Vercel',
		},
		{
			quote:
				'I made a version using React Aria Components with arrow key navigation, multi selection, screen reader announcements, and more. Works great with TanStack Table too!',
			author: 'Devon Govett',
			role: '@devongovett',
			company: 'Adobe',
		},
		{
			quote:
				'TanStack Table is the perfect choice if you need a lightweight, unopinionated, and fully customizable solution. It gives you the power and leaves the presentation up to you.',
			author: 'Developer Review',
			role: 'Community',
			company: '',
		},
		{
			quote:
				"Linear-style table filters using shadcn and TanStack Table. Open source. You'll be able to use this as an add-on to the Data Table component.",
			author: 'Kian Bazza',
			role: '@kianbazza',
			company: 'Developer',
		},
	],
	featureHighlights: [
		{
			title: 'Designed for zero design',
			icon: (
				<div className="text-center overflow-hidden">
					<PersonStanding className={twMerge(textStyles)} />
				</div>
			),
			description: (
				<div>
					What good is a powerful table if that super hip designer you just hired can't work their
					UI magic on it?{' '}
					<span className={twMerge('font-semibold', textStyles)}>
						TanStack Table is headless by design
					</span>
					, which means 100% control down to the very smallest HTML tag, component, class and style.
					Pixel Perfection? Go for it!
				</div>
			),
		},
		{
			title: 'Big Power, Small Package',
			icon: <Zap className={twMerge(textStyles)} />,
			description: (
				<div>
					Don't be fooled by the small bundle size. TanStack Table is a workhorse. It's built to
					materialize, filter, sort, group, aggregate, paginate and display massive data sets using
					a very small API surface. Wire up your new or existing tables and{' '}
					<span className={twMerge('font-semibold', textStyles)}>
						watch your users become instantly more productive
					</span>
					.
				</div>
			),
		},
		{
			title: 'Extensible',
			icon: <CogsIcon className={twMerge(textStyles)} />,
			description: (
				<div>
					TanStack table ships with excellent defaults to get you off the ground as fast as
					possible, but nothing is stopping you from{' '}
					<span className={twMerge('font-semibold', textStyles)}>
						customizing and overriding literally everything to your liking
					</span>
					. Feeling tenacious enough to build your own Sheets/Excel/AirTable clone? Be our guest 😉
				</div>
			),
		},
	],
};
