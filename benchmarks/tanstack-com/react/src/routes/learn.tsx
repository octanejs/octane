import { Link, createFileRoute } from '@tanstack/react-router';
import { seo } from '~/utils/seo';
import { Users, Video, MapPin, Star, Play } from 'lucide-react';
import { LogoQueryGG } from '~/ui';
import { CheckCircleIcon } from '~/components/icons/CheckCircleIcon';
import { YouTubeIcon } from '~/components/icons/YouTubeIcon';

export const Route = createFileRoute('/learn')({
	component: LearnPage,
	head: () => ({
		meta: seo({
			title: 'Learn | TanStack',
			description: `Education and learning resources for TanStack libraries and projects`,
			keywords: `learn,course,education,learning,resources,training`,
		}),
	}),
});

function LearnPage() {
	return (
		<div className="flex flex-col max-w-full min-h-screen gap-12 p-4 md:p-8 pb-0">
			<div className="flex-1 space-y-12 w-full max-w-4xl mx-auto">
				<header className="">
					<h1 className="text-3xl font-black">Learn TanStack</h1>
					<p className="text-lg mt-4 text-gray-600 dark:text-gray-400">
						Whether you're just getting started or looking to level up as an individual or team, we
						have resources that will help you succeed.
					</p>
				</header>
				<div className="flex items-stretch flex-wrap gap-4 max-w-full w-[900px] justify-center">
					<a
						href="https://youtube.com/@tan_stack"
						target="_blank"
						rel="noreferrer"
						className="min-w-[300px] max-w-[300px] rounded-lg bg-linear-to-br from-red-500 to-red-700 text-white shadow-black/20 shadow-lg hover:shadow-2xl hover:shadow-black/20 divide-y divide-white/30 transition-all duration-200 hover:scale-105 block relative overflow-visible"
					>
						<div className="absolute -top-2 -right-2 z-40 px-2 py-1 rounded-md bg-linear-to-r from-red-500 to-red-700 uppercase text-white font-black italic text-xs">
							NEW
						</div>
						<div className="p-4 lg:p-8">
							<div className="flex items-center gap-3 mb-4">
								<YouTubeIcon className="w-8 h-8" />
								<h2 className="text-xl font-bold">YouTube Channel</h2>
							</div>
							<p className="text-sm mb-4 opacity-90">
								Free video content from the TanStack team. Tutorials, deep dives, and release
								walkthroughs.
							</p>
							<div className="grid gap-2 text-xs text-left">
								<div className="flex items-start gap-2">
									<Play className="w-4 h-4 mt-0.5 shrink-0" />
									<div>Tutorials & walkthroughs</div>
								</div>
								<div className="flex items-start gap-2">
									<Video className="w-4 h-4 mt-0.5 shrink-0" />
									<div>Deep dives into library internals</div>
								</div>
								<div className="flex items-start gap-2">
									<Star className="w-4 h-4 mt-0.5 shrink-0" />
									<div>Release announcements & demos</div>
								</div>
							</div>
							<div className="mt-6 pt-4 border-t border-white/30">
								<div className="text-xs opacity-75 text-center mb-2">Free for everyone</div>
								<div className="text-xs opacity-90 text-center font-medium">
									Subscribe now &rarr;
								</div>
							</div>
						</div>
					</a>
					<Link
						to="/workshops"
						className="min-w-[300px] max-w-[300px] rounded-lg bg-linear-to-br from-blue-600 to-purple-600 text-white shadow-black/20 shadow-lg hover:shadow-2xl hover:shadow-black/20 divide-y divide-white/30 transition-all duration-200 hover:scale-105 block relative overflow-visible"
					>
						<div className="absolute -top-2 -right-2 z-40 px-2 py-1 rounded-md bg-linear-to-r from-blue-500 to-purple-500 uppercase text-white font-black italic text-xs">
							NEW
						</div>
						<div className="p-4 lg:p-8">
							<div className="flex items-center gap-3 mb-4">
								<Users className="w-8 h-8" />
								<h2 className="text-xl font-bold">Professional Workshops</h2>
							</div>
							<p className="text-sm mb-4 opacity-90">
								Learn directly from TanStack creators and maintainers. Remote and in-person options
								available.
							</p>
							<div className="grid gap-2 text-xs text-left">
								<div className="flex items-start gap-2">
									<Video className="w-4 h-4 mt-0.5 shrink-0" />
									<div>Remote workshops worldwide</div>
								</div>
								<div className="flex items-start gap-2">
									<MapPin className="w-4 h-4 mt-0.5 shrink-0" />
									<div>Premium in-person options</div>
								</div>
								<div className="flex items-start gap-2">
									<Star className="w-4 h-4 mt-0.5 shrink-0" />
									<div>From maintainers & creators</div>
								</div>
							</div>
							<div className="mt-6 pt-4 border-t border-white/30">
								<div className="text-xs opacity-75 text-center mb-2">
									Contact us for a custom quote
								</div>
								<div className="text-xs opacity-90 text-center font-medium">
									Click to learn more →
								</div>
							</div>
						</div>
					</Link>
					<Link
						to={'https://query.gg?s=tanstack' as string}
						target="_blank"
						className="min-w-[300px] max-w-[300px] rounded-lg bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 shadow-xs hover:shadow-sm divide-y divide-gray-200 dark:divide-gray-800 transition-all duration-200 hover:scale-105 overflow-hidden block opacity-80"
					>
						<LogoQueryGG className="w-full" />
						<div className="flex flex-col gap-6 pt-2 p-4 lg:p-8 ">
							<div className="text-center">
								<div className="text-sm opacity-70 mt-2">
									Created by <span className="font-bold">Dominik Dorfmeister</span> and{' '}
									<span className="font-bold">Fireship</span>
								</div>
							</div>

							<div className="text-sm max-w-full text-center font-bold">
								"This is the best way to learn how to use React Query in real-world applications."
								<div className="mt-2 text-xs italic">—Tanner Linsley</div>
							</div>

							<div className="grid max-w-(--breakpoint-lg) mx-auto text-xs gap-2 text-left">
								<div className="flex items-start gap-2">
									<span className="text-lg text-green-500">
										<CheckCircleIcon />
									</span>
									<div>Save time by learning with a guided approach</div>
								</div>
								<div className="flex items-start gap-2">
									<span className="text-lg text-green-500">
										<CheckCircleIcon />
									</span>
									<div>Get hands-on experience building a real-world application</div>
								</div>
								<div className="flex items-start gap-2">
									<span className="text-lg text-green-500">
										<CheckCircleIcon />
									</span>
									<div>Never worry about data fetching again</div>
								</div>
							</div>
						</div>
					</Link>
				</div>
			</div>
		</div>
	);
}
