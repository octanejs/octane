import { Link, createFileRoute } from '@octanejs/tanstack-router';
import { Footer } from '~/components/Footer.tsrx';
import { Card } from '~/components/Card.tsrx';
import { seo } from '~/utils/seo';
import { Shield, Sprout, Layers, Handshake, FileText } from '@octanejs/lucide';

export const Route = createFileRoute('/ethos')({
	component: RouteComp,
	head: () => ({
		meta: seo({
			title: 'TanStack Ethos',
			description: 'Our philosophy and commitment to building for the open web.',
		}),
	}),
});

const sections = [
	{
		title: 'Independently Owned, Unbiased by Design',
		icon: Shield,
		gradient: 'from-amber-500 to-orange-500',
		borderColor: 'hover:border-amber-500/50',
		content: <p>
			TanStack is
			<strong>independently operated</strong>
			with no controlling interests over our technical direction and no hidden agendas. We're funded
			by partnerships with companies that share our core values:
			{' '}
			<strong>
				the open web, open standards, and the freedom to compose and deploy anything you want,
				anywhere you please.
			</strong>
		</p>,
	},
	{
		title: 'A Sustainable Future',
		icon: Sprout,
		gradient: 'from-lime-500 to-green-500',
		borderColor: 'hover:border-lime-500/50',
		content: <>
			<p>
				TanStack is a lean, focused team: a full-time founder, several prominent and well-sponsored
				maintainers, contractors and contributors, and a thriving community of users who share our
				core values.
			</p>
			<p class="mt-4">
				Instead of chasing growth at all costs,
				{' '}
				<strong>
					we focus on sustainable growth that prioritizes developer experience, community needs, and
					long-term value creation.
				</strong>
				{' '}
				Our goal is to build lasting tools that genuinely improve how developers work, not to hit
				arbitrary metrics or satisfy external investor demands.
			</p>
			<p class="mt-4">That means:</p>
		</>,
		bullets: [
			'No pressure to chase profits at the cost of developer experience.',
			'No corporate influence dictating our technical direction.',
			'A singular focus on building tools that make the web better for users and developers.',
		],
	},
	{
		title: 'Technology-Agnostic by Default',
		icon: Layers,
		gradient: 'from-sky-500 to-indigo-500',
		borderColor: 'hover:border-sky-500/50',
		content: <p>
			We believe in
			{' '}
			<strong>framework-agnostic, platform-agnostic, and future-proof tooling</strong>
			that puts developers first:
		</p>,
		bullets: [
			'TanStack libraries are built on framework and platform-agnostic primitives. When our libraries build on other tools, like TanStack Start builds on Vite, we ensure that these tools uphold these same values of openness and flexibility.',
			'TanStack Libraries either already support or will support all major (and some minor!) frameworks and deployment environments—no exceptions.',
			'If there\'s any technology we\'re aligned with, it\'s TypeScript—or more broadly, "typed JavaScript", whatever that evolves into as time goes on.',
		],
	},
	{
		title: 'Open Partners',
		icon: Handshake,
		gradient: 'from-rose-500 to-pink-500',
		borderColor: 'hover:border-rose-500/50',
		content: <p>
			Every partner we work with also actively upholds our values. They acknowledge that TanStack's
			OSS is a platform for developers, not a product to be leveraged:
		</p>,
		bullets: [
			'No partner can dictate or influence TanStack\'s core technology in a way that biases it toward their platform.',
			'Our libraries are built to serve developers first, and when appropriate, integrate with high quality external services that enhance the developer experience.',
			'Companies that support us do so first and foremost because they believe in what we\'re building and want to see it succeed for many years to come.',
		],
	},
];

function RouteComp() {
	return <div class="flex flex-col max-w-full min-h-screen gap-12 p-4 md:p-8 pb-0">
		<div class="flex-1 space-y-12 w-full max-w-4xl mx-auto">
			<header>
				<h1 class="text-3xl font-black">TanStack Ethos</h1>
			</header>

			<section>
				<p class="text-lg">
					At TanStack, our philosophy is simple: we build for the open web, open standards, and the
					freedom to compose, deploy, and innovate however you see fit.
				</p>
			</section>

			{/* Section Cards */}
			<div class="space-y-8">{sections.map((section) => {
				const Icon = section.icon;
				return <Card
					key={section.title}
					as="section"
					className={`p-6 md:p-8 transition-colors ${section.borderColor}`}
				>
					{/* Header */}
					<div class="flex items-start gap-4 mb-4">
						<div
							class={`shrink-0 w-12 h-12 rounded-lg bg-linear-to-br ${section.gradient} flex items-center justify-center`}
						>
							<Icon className="w-6 h-6 text-white" />
						</div>
						<h2 class="text-xl md:text-2xl font-bold pt-2">
							{section.title as string}
						</h2>
					</div>

					{/* Content */}
					<div class="text-gray-700 dark:text-gray-300">{section.content}</div>

					{/* Bullets */}
					{section.bullets &&
						<div class="space-y-3 mt-4">{section.bullets.map(
							(bullet) => <div key={bullet} class="flex gap-3 items-start">
								<div
									class={`shrink-0 w-1.5 h-1.5 rounded-full bg-linear-to-br ${section.gradient} mt-2`}
								/>
								<span class="text-gray-600 dark:text-gray-400">
									{bullet as string}
								</span>
							</div>,
						)}</div>}
				</Card>;
			})}</div>

			{/* Closing Statement */}
			<section class="space-y-6">
				<p class="text-lg font-medium">
					At the end of the day,
					{' '}
					<strong>
						TanStack isn't just a set of libraries—it's a commitment to building the web
						{' '}
						<em>on your terms</em>
						, without compromise.
					</strong>
					{' '}
					All we need is enough to keep improving tools that we believe actually make the web a
					better place.
				</p>

				<div>
					<strong>- Tanner Linsley</strong>
					<br />
					Founder, TanStack LLC
				</div>
			</section>

			{/* Link to Tenets */}
			<Card as="section" className="p-6 md:p-8 hover:border-violet-500/50 transition-colors">
				<div class="flex items-start gap-4">
					<div
						class="shrink-0 w-12 h-12 rounded-lg bg-linear-to-br from-violet-500 to-purple-500 flex items-center justify-center"
					>
						<FileText className="w-6 h-6 text-white" />
					</div>
					<div>
						<h2 class="text-xl font-semibold mb-2">Product & Library Tenets</h2>
						<p class="text-gray-600 dark:text-gray-400">
							Our organizational ethos above covers our business values and independence. For the
							technical principles that guide every TanStack library and product—including how we
							evaluate contributions and features—see our
							{' '}
							<Link to="/tenets" className="underline font-semibold">
								Product Tenets
							</Link>
							.
						</p>
					</div>
				</div>
			</Card>
		</div>
		<Footer />
	</div>;
}
