import { Link, createFileRoute } from '@tanstack/react-router';
import { seo } from '~/utils/seo';

export const Route = createFileRoute('/support')({
	component: SupportComp,
	head: () => ({
		meta: seo({
			title: 'Support | TanStack',
			description: `Help and support for TanStack libraries and projects`,
			keywords: `tanstack,react,reactjs,react query,react table,open source,open source software,oss,software,help,support`,
		}),
	}),
});

const supportOptions = [
	{
		to: 'https://tlinz.com/discord' as string,
		external: true,
		gradient: 'from-discord/60 to-discord',
		title: 'Discord',
		description: 'Community support and real-time help',
		badges: ['Community Support', 'Q&A', 'General Chat', 'Networking'],
	},
	{
		to: 'https://github.com/tanstack' as string,
		external: true,
		gradient: 'from-gray-600 to-gray-900',
		title: 'GitHub',
		description: 'Issues, discussions, and source code',
		badges: ['Bug Reports', 'Feature Requests', 'Source Code'],
	},
	{
		to: '/workshops',
		gradient: 'from-blue-600 to-purple-600',
		title: 'Professional Workshops',
		description: 'Learn from TanStack creators and maintainers',
		badges: ['Remote', 'In-Person', 'Custom Training'],
		isNew: true,
	},
	{
		to: 'https://youtube.com/@tan_stack' as string,
		external: true,
		gradient: 'from-red-500 to-red-700',
		title: 'YouTube',
		description: 'Tutorials, walkthroughs, and deep dives',
		badges: ['Tutorials', 'Deep Dives', 'Release Videos'],
		isNew: true,
	},
	{
		to: '/paid-support',
		gradient: 'from-green-600 to-cyan-600',
		title: 'Enterprise Support',
		description: 'Expert consultation and enterprise support',
		badges: ['Consulting', 'Enterprise Support'],
	},
];

function SupportComp() {
	const cardClass =
		'group relative block shadow-xl shadow-gray-500/20 rounded-lg dark:border border-gray-500/20 dark:shadow-xl dark:shadow-black/30 hover:shadow-2xl hover:scale-105 transition-all duration-200';

	return (
		<div className="flex flex-col max-w-full min-h-screen gap-12 p-4 md:p-8 pb-0">
			<div className="flex-1 space-y-16 w-full max-w-4xl mx-auto">
				<header className="">
					<h1 className="text-3xl font-black">Support</h1>
					<p className="text-lg mt-4 text-gray-600 dark:text-gray-400">
						Whether you're a solo developer or a large enterprise, we have solutions that will fit
						your needs perfectly
					</p>
				</header>

				<div className="grid grid-cols-1 gap-6 sm:grid-cols-2 max-w-4xl mx-auto">
					{supportOptions.map((option) => (
						<Link
							key={option.title}
							to={option.to}
							target={option.external ? '_blank' : undefined}
							className={`${cardClass} ${option.isNew ? 'overflow-visible' : 'overflow-hidden'}`}
						>
							{option.isNew && (
								<div className="absolute -top-2 -right-2 z-40 px-2 py-1 rounded-md bg-linear-to-r from-blue-500 to-purple-500 uppercase text-white font-black italic text-xs">
									NEW
								</div>
							)}
							<div
								className={`bg-linear-to-br ${option.gradient} p-6 text-white rounded-lg h-full w-full`}
							>
								<h3 className="text-xl font-semibold mb-2">{option.title}</h3>
								<p className="text-sm text-white/80 mb-4">{option.description}</p>
								<div className="flex flex-wrap gap-2">
									{option.badges.map((badge) => (
										<span
											key={badge}
											className="text-xs bg-white/20 text-white rounded-md px-2 py-1"
										>
											{badge}
										</span>
									))}
								</div>
							</div>
						</Link>
					))}
				</div>
			</div>
		</div>
	);
}
