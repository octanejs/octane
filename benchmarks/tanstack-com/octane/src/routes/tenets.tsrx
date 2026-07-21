import { Link, createFileRoute } from '@octanejs/tanstack-router';
import { Footer } from '~/components/Footer.tsrx';
import { Card } from '~/components/Card.tsrx';
import { seo } from '~/utils/seo';
import { Globe, Blocks, Rocket, Eye, Users, Code2, Wrench, Handshake } from '@octanejs/lucide';

export const Route = createFileRoute('/tenets')({
	component: RouteComp,
	head: () => ({
		meta: seo({
			title: 'TanStack Product Tenets',
			description: 'The core tenets that guide all TanStack libraries and products.',
		}),
	}),
});

const tenets = [
	{
		number: 1,
		title: 'Open, Independent, Technology-Agnostic',
		icon: Globe,
		gradient: 'from-blue-500 to-cyan-500',
		borderColor: 'hover:border-blue-500/50',
		description: 'Every TanStack library starts with a provider-agnostic core, ensuring that developers are never locked into a specific vendor, platform, or ecosystem. Integrations are layered on top as optional adapters—never as the foundation.',
		principles: [
			{
				title: 'Neutral core, optional integrations',
				description: 'Every TanStack library starts with a provider-agnostic core (framework, runtime, vendor, or service), with integrations layered on top as optional adapters—never as the foundation.',
			},
			{
				title: 'Portability over deep lock-in',
				description: 'We design APIs so that swapping providers, platforms, or runtimes is feasible without rewriting business logic; any provider-specific behavior is clearly cordoned off.',
			},
			{
				title: 'Uniform abstractions across providers',
				description: 'Where multiple vendors/services solve similar problems, we provide a consistent abstraction that makes them interchangeable from the developer\'s perspective.',
			},
			{
				title: 'We don\'t chase every niche feature',
				description: 'We intentionally avoid modeling every bespoke feature of every vendor; we focus on the shared, high-leverage capabilities that most teams actually need.',
			},
			{
				title: 'Graceful degradation, not fragmentation',
				description: 'When a provider offers extra capabilities, they plug into extension points or optional layers rather than fragmenting the core abstraction or dictating its shape.',
			},
		],
		rulesOut: [
			'Vendor-biased APIs or partner-driven features in core',
			'Contributions that introduce platform bias or "we\'re all-in on X vendor" assumptions',
			'Features that require committing to a specific cloud provider or deployment model',
		],
	},
	{
		number: 2,
		title: 'Composable, Platform-Aligned Primitives',
		icon: Blocks,
		gradient: 'from-emerald-500 to-teal-500',
		borderColor: 'hover:border-emerald-500/50',
		description: 'We build focused, composable primitives that embrace the platform rather than hiding it. Every library should be adoptable incrementally, without requiring rewrites or creating hard dependencies on other TanStack tools.',
		principles: [
			{
				title: 'Primitives before frameworks',
				description: 'We ship focused, composable building blocks rather than all-inclusive "one framework to rule them all" abstractions.',
			},
			{
				title: 'Embrace the platform',
				description: 'We leverage the web, HTTP, JS/TS, and servers instead of hiding them behind opaque layers of magic.',
			},
			{
				title: 'Progressive adoption',
				description: 'Every library should be adoptable one piece at a time, without rewrites or hard coupling to the rest of TanStack.',
			},
			{
				title: 'Escape hatches by design',
				description: 'It must always be possible to drop down a level, integrate with existing systems, or bypass our abstractions when necessary.',
			},
		],
		rulesOut: [
			'Designs that require full rewrites or "all-in" commitments',
			'Heavy global singletons or hard dependencies between TanStack libraries',
			'Abstractions that hide platform capabilities without clear escape routes',
		],
	},
	{
		number: 3,
		title: 'Pragmatic, Production-Grade Quality',
		icon: Rocket,
		gradient: 'from-orange-500 to-red-500',
		borderColor: 'hover:border-orange-500/50',
		description: 'We design around real-world production use-cases, edge cases, and long-lived applications—not just happy-path demos. Performance and scalability are requirements, not nice-to-haves.',
		principles: [
			{
				title: 'Real products as the bar',
				description: 'We design around real-world workloads, edge cases, and long-lived apps—not just happy-path demos.',
			},
			{
				title: '"Ship today" quality',
				description: 'Features are not done until we\'d be comfortable running them in our own revenue-critical applications.',
			},
			{
				title: 'Performance and scale as requirements',
				description: 'Rendering, caching, and network behavior must hold up under scale; performance is not a nice-to-have.',
			},
			{
				title: 'DX that earns its cost',
				description: 'API ergonomics, tooling, and docs should measurably improve developer outcomes, not add clever ceremony.',
			},
		],
		rulesOut: [
			'Demo-only features that don\'t hold up under real-world load',
			'Magic that\'s impossible to debug or reason about when something goes wrong',
			'Changes that optimize for benchmarks over real-world reliability',
		],
	},
	{
		number: 4,
		title: 'Predictable, Explicit, Type-Safe Behavior',
		icon: Eye,
		gradient: 'from-purple-500 to-pink-500',
		borderColor: 'hover:border-purple-500/50',
		description: 'We minimize magic and maximize clarity. State, side effects, and data flow should be understandable from code, not guessed from hidden behavior. Type safety should guide correct usage without drowning users in generics.',
		principles: [
			{
				title: 'Minimal magic, maximum clarity',
				description: 'State, side effects, and data flow must be understandable from code, not guessed from hidden behavior.',
			},
			{
				title: 'Explicit over implicit',
				description: 'Important behaviors are explicit in APIs and configuration, with surprising defaults treated as a bug.',
			},
			{
				title: 'Type safety as leverage, not dogma',
				description: 'TypeScript support should guide correct use and catch real bugs without drowning users in generics.',
			},
			{
				title: 'Stable APIs and migrations',
				description: 'We evolve carefully, with clear changelogs and migration paths; breakage for style or hype is unacceptable.',
			},
		],
		rulesOut: [
			'Hidden global state or surprising side effects that aren\'t obvious from the API',
			'Backwards-incompatible API churn without clear migration paths',
			'Type signatures that are technically correct but unusable in practice',
		],
	},
];

const audiences = [
	{
		title: 'For developers evaluating TanStack',
		icon: Users,
		gradient: 'from-blue-500 to-cyan-500',
		description: 'These tenets define what you can expect from our libraries—quality, portability, and a commitment to your freedom to compose and deploy however you see fit.',
	},
	{
		title: 'For contributors',
		icon: Code2,
		gradient: 'from-emerald-500 to-teal-500',
		description: 'When proposing features or changes, consider how they align with these tenets. If your idea conflicts with a tenet, explicitly address why and how the conflict is justified.',
	},
	{
		title: 'For maintainers and reviewers',
		icon: Wrench,
		gradient: 'from-orange-500 to-red-500',
		description: 'Use these tenets as a checklist when evaluating PRs, feature requests, and architectural decisions. If something threatens a tenet, it needs strong justification or should be rejected.',
	},
	{
		title: 'For partners',
		icon: Handshake,
		gradient: 'from-purple-500 to-pink-500',
		description: 'These tenets ensure that our libraries remain neutral and developer-focused. Partner integrations must respect these principles and cannot bias core APIs toward specific platforms or vendors.',
	},
];

function RouteComp() {
	return <div class="flex flex-col max-w-full min-h-screen gap-12 p-4 md:p-8 pb-0">
		<div class="flex-1 space-y-12 w-full max-w-4xl mx-auto">
			{/* Header */}
			<header>
				<h1 class="text-3xl font-black">TanStack Product Tenets</h1>
			</header>

			{/* Intro */}
			<section class="space-y-4">
				<p class="text-lg">
					These tenets define the core principles that guide every TanStack library and product.
					They serve as both a quality bar for what developers can expect from our tools and as a
					reference for evaluating contributions, features, and ideas.
				</p>
				<p class="text-lg">
					These tenets complement our
					{' '}
					<Link to="/ethos" className="underline">
						organizational ethos
					</Link>
					, which covers our business values and independence. Together, they ensure that TanStack
					remains committed to building tools that make the web better for developers—on your terms,
					without compromise.
				</p>
			</section>

			{/* Tenet Cards */}
			<div class="space-y-8">{tenets.map((tenet) => {
				const Icon = tenet.icon;
				return <Card
					key={tenet.number}
					as="section"
					className={`p-6 md:p-8 transition-colors ${tenet.borderColor}`}
				>
					{/* Header */}
					<div class="flex items-start gap-4 mb-6">
						<div
							class={`shrink-0 w-12 h-12 rounded-lg bg-linear-to-br ${tenet.gradient} flex items-center justify-center`}
						>
							<Icon className="w-6 h-6 text-white" />
						</div>
						<div>
							<h2 class="text-xl md:text-2xl font-bold">
								{tenet.number}
								.
								{tenet.title as string}
							</h2>
							<p class="text-gray-600 dark:text-gray-400 mt-1">{tenet.description as string}</p>
						</div>
					</div>

					{/* Principles */}
					<div class="space-y-3 mb-6">{tenet.principles.map(
						(principle) => <div key={principle.title} class="flex gap-3 items-start">
							<div
								class={`shrink-0 w-1.5 h-1.5 rounded-full bg-linear-to-br ${tenet.gradient} mt-2`}
							/>
							<div>
								<span class="font-semibold">
									{principle.title as string}
									:
								</span>
								{' '}
								<span
									class="text-gray-600 dark:text-gray-400"
								>{principle.description as string}</span>
							</div>
						</div>,
					)}</div>

					{/* What this rules out */}
					<div
						class="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-100 dark:border-gray-700/50"
					>
						<p class="font-semibold text-sm text-gray-700 dark:text-gray-300 mb-2">
							What this rules out:
						</p>
						<ul class="space-y-1">{tenet.rulesOut.map(
							(item) => <li
								key={item}
								class="text-sm text-gray-600 dark:text-gray-400 flex gap-2 items-start"
							>
								<span class="text-gray-400 dark:text-gray-500">•</span>
								{item as string}
							</li>,
						)}</ul>
					</div>
				</Card>;
			})}</div>

			{/* How to Use These Tenets */}
			<section class="space-y-6">
				<div>
					<h2 class="text-2xl font-semibold">How to Use These Tenets</h2>
					<p class="mt-2">These tenets serve multiple purposes for different audiences:</p>
				</div>

				<div class="grid grid-cols-1 md:grid-cols-2 gap-4">{audiences.map((audience) => {
					const Icon = audience.icon;
					return <Card key={audience.title} className="p-5">
						<div
							class={`w-10 h-10 rounded-lg bg-linear-to-br ${audience.gradient} flex items-center justify-center mb-3`}
						>
							<Icon className="w-5 h-5 text-white" />
						</div>
						<h3 class="font-bold mb-2">{audience.title as string}</h3>
						<p class="text-sm text-gray-600 dark:text-gray-400">{audience.description as string}</p>
					</Card>;
				})}</div>

				<p class="mt-4">
					These tenets work alongside our
					{' '}
					<Link to="/ethos" className="underline">
						organizational ethos
					</Link>
					, which covers our business independence, sustainability, and commitment to the open web.
					Together, they ensure TanStack remains true to its mission: building tools that make the
					web better for developers, on your terms.
				</p>
			</section>
		</div>
		<Footer />
	</div>;
}
