import { Fragment, useEffect, useState } from 'octane';
import { ClientOnly, Link, createFileRoute } from '@octanejs/tanstack-router';

import discordImage from '~/images/discord-logo-white.svg';
import { librariesByGroup, librariesGroupNamesMap, type Library } from '~/libraries';
import { BrandContextMenu } from '~/components/BrandContextMenu.tsrx';
import { OptimizedImage } from '~/components/OptimizedImage.tsrx';
import { groupToSlug } from '~/components/stack/stack-categories';
import { twMerge } from 'tailwind-merge';

import { ArrowRight, Code2, Layers, Shield, Zap, Play, type LucideIcon } from '@octanejs/lucide';
import { YouTubeIcon } from '~/components/icons/YouTubeIcon.tsrx';
import { HomeApplicationStarter } from '~/components/home/HomeApplicationStarter.tsrx';
import { HomeCommunitySection } from '~/components/home/HomeCommunitySection.tsrx';
import { HomeNewsletterSection } from '~/components/home/HomeNewsletterSection.tsrx';
import { HomeSocialProofSection } from '~/components/home/HomeSocialProofSection.tsrx';
import { HomeStatsSection } from '~/components/home/HomeStatsSection.tsrx';
import { homepageNpmStatsSummaryQuery, ossStatsQuery } from '~/queries/stats';
import { Button } from '~/ui';
import { fetchRecentPosts } from '~/utils/blog.functions';
import { seo } from '~/utils/seo';

export const Route = createFileRoute('/')({
	loader: async ({ context: { queryClient } }) => {
		const [, , recentPosts] = await Promise.all([
			queryClient.ensureQueryData(ossStatsQuery()),
			queryClient.ensureQueryData(homepageNpmStatsSummaryQuery()),
			fetchRecentPosts(),
		]);

		return { recentPosts };
	},
	head: () => ({
		meta: seo({
			title: 'TanStack | The open-source application stack for the web.',
			description: 'Headless, type-safe, composable tools for building modern web applications that work naturally for developers and reliably for agents.',
		}),
	}),
	component: Index,
});

function HomeSplashLogo() {
	return <>
		<OptimizedImage
			src="/images/logos/splash-light.png"
			width={500}
			height={500}
			quality={85}
			className="absolute inset-0 block h-full w-full object-contain dark:hidden"
			alt="TanStack Logo"
			loading="eager"
			fetchPriority="high"
		/>
		<OptimizedImage
			src="/images/logos/splash-dark.png"
			width={500}
			height={500}
			quality={85}
			className="absolute inset-0 hidden h-full w-full object-contain dark:block"
			alt="TanStack Logo"
			loading="eager"
			fetchPriority="high"
		/>
	</>;
}

function Index() {
	const { recentPosts } = Route.useLoaderData();

	return <>
		<div class="max-w-full z-10 space-y-24">
			<div class="space-y-8">
				<div
					class="flex flex-col items-center gap-4 xl:grid xl:grid-cols-[400px_minmax(0,44rem)] 2xl:grid-cols-[500px_minmax(0,48rem)] xl:items-center xl:justify-center xl:gap-8 xl:pt-24"
				>
					<div
						class="relative w-[300px] pt-8 xl:w-[400px] xl:pt-0 2xl:w-[500px] [--ship-x:50px] [--ship-y:1.5rem]
            lg:[--ship-x:50px] lg:[--ship-y:1.5rem]
            xl:[--ship-x:80px] xl:[--ship-y:2.5rem]
            2xl:[--ship-x:90px] 2xl:[--ship-y:3rem]"
					>
						<ClientOnly>
							<div class="absolute left-1/3 bottom-[25%] z-0 animate-ship-peek">
								<OptimizedImage
									src="/images/ship.png"
									alt=""
									width={240}
									height={240}
									className="w-16 xl:w-20"
								/>
							</div>
							<Link
								to="/explore"
								className="absolute left-1/3 bottom-[25%] z-20 animate-ship-peek-clickable"
								title="Explore TanStack"
							>
								<OptimizedImage
									src="/images/ship.png"
									alt="Explore TanStack"
									width={240}
									height={240}
									className="w-16 xl:w-20 opacity-0"
								/>
							</Link>
						</ClientOnly>
						<div class="relative z-10 aspect-square">
							<BrandContextMenu className="cursor-pointer relative h-full w-full">
								<HomeSplashLogo />
							</BrandContextMenu>
						</div>
					</div>
					<div
						class="flex w-full max-w-md flex-col items-center gap-6 px-4 text-center md:max-w-2xl xl:max-w-[44rem] xl:items-start xl:px-0 xl:text-left 2xl:max-w-[48rem]"
					>
						<div class="flex gap-2 lg:gap-4 items-center">
							<h1
								class={`inline-block
            font-black text-5xl
            md:text-6xl
            lg:text-8xl`}
							>
								<span
									class={`
            inline-block text-black dark:text-white
            mb-2 uppercase [letter-spacing:-.02em] pr-1.5
            `}
								>
									TanStack
								</span>
							</h1>
						</div>
						<h2
							class="font-bold text-2xl max-w-md
            md:text-4xl md:max-w-2xl
            2xl:text-5xl lg:max-w-2xl text-balance"
							style={{
								fontFamily: 'ui-sans-serif, system-ui, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji"',
							}}
						>
							The
							<OpenSourceGradientText />
							application stack for the web.
						</h2>
						<p class="text opacity-90 max-w-sm
             lg:text-xl lg:max-w-2xl text-balance">
							Headless, type-safe, composable tools for building modern web applications that work
							naturally for
							<strong>developers</strong>
							and reliably for
							<strong>agents</strong>
							.
						</p>
					</div>
				</div>
				<div class="mx-auto mt-8 w-full max-w-[1021px] px-4 sm:px-6 md:mt-10">
					<HomeStatsSection />
				</div>
				<div class="mx-auto mt-16 w-full max-w-[1021px] px-4 sm:px-6 md:mt-20 lg:mt-14 xl:mt-12">
					<HomeApplicationStarter />
				</div>
			</div>

			<div class="px-4 lg:max-w-(--breakpoint-lg) md:mx-auto">
				<h3 id="libraries" class={`text-4xl font-light mb-2 scroll-mt-24`}>
					<a href="#libraries" class="hover:underline decoration-gray-400 dark:decoration-gray-600">
						Browse the stack
					</a>
				</h3>
				<p class="text-gray-600 dark:text-gray-400 mb-6">
					Every TanStack library, organized by what it does.
				</p>

				<div
					class="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5"
				>{Object.entries(librariesByGroup).map(
					([groupName, groupLibraries]) =>
						<StackCategoryCard
							key={groupName}
							groupId={groupName as keyof typeof librariesByGroup}
							libraries={groupLibraries as Library[]}
						/>,
				)}</div>
			</div>

			<div class="px-4 lg:max-w-(--breakpoint-lg) md:mx-auto mt-8 flex justify-center">
				<Button as={Link} to="/libraries">
					See all libraries
				</Button>
			</div>

			<WhyTanStackSection />

			<HomeSocialProofSection recentPosts={recentPosts} />

			<HomeCommunitySection />

			<div class="px-4 mx-auto max-w-(--breakpoint-lg)">
				<div
					class={`
          rounded-md p-4 grid gap-6
          bg-discord text-white overflow-hidden relative
          shadow-xl shadow-indigo-700/30
          sm:p-8 sm:grid-cols-3 items-center`}
				>
					<div
						class={`absolute transform opacity-10 z-0
            right-0 top-0 -translate-y-1/3 translate-x-1/3
            sm:opacity-20`}
					>
						<img src={discordImage} alt="Discord Logo" loading="lazy" width={300} height={300} />
					</div>
					<div class={`sm:col-span-2`}>
						<h3 id="discord" class="text-3xl font-bold scroll-mt-24">
							<a href="#discord" class="hover:underline decoration-white/50">
								TanStack on Discord
							</a>
						</h3>
						<p class={`mt-4`}>
							The official TanStack community to ask questions, network and make new friends and get
							lightning fast news about what's coming next for TanStack!
						</p>
					</div>
					<div class={`flex items-center justify-center`}>
						<Button
							as="a"
							href="https://discord.com/invite/WrRKjPJ"
							target="_blank"
							rel="noreferrer"
							className="w-full mt-4 bg-white border-white hover:bg-gray-100 text-discord justify-center shadow-lg text-sm"
						>
							Join TanStack Discord
						</Button>
					</div>
				</div>
			</div>

			<div class="px-4 mx-auto max-w-(--breakpoint-lg)">
				<div
					class={`
          rounded-md p-4 grid gap-6
          bg-linear-to-br from-red-500 to-red-700 text-white overflow-hidden relative
          shadow-xl shadow-red-700/30
          sm:p-8 sm:grid-cols-3 items-center`}
				>
					<div
						class={`absolute transform opacity-10 z-0
            right-0 top-0 -translate-y-1/3 translate-x-1/3
            sm:opacity-20`}
					>
						<YouTubeIcon width={300} height={300} />
					</div>
					<div class={`sm:col-span-2`}>
						<h3 id="youtube" class="text-3xl font-bold scroll-mt-24">
							<a href="#youtube" class="hover:underline decoration-white/50">
								TanStack on YouTube
							</a>
						</h3>
						<p class={`mt-4`}>
							The official TanStack YouTube channel. Tutorials, deep dives, release walkthroughs,
							and more — free for everyone!
						</p>
					</div>
					<div class={`flex items-center justify-center`}>
						<Button
							as="a"
							href="https://youtube.com/@tan_stack"
							target="_blank"
							rel="noreferrer"
							className="w-full mt-4 bg-white border-white hover:bg-gray-100 text-red-600 justify-center shadow-lg text-sm"
						>
							<Play className="w-4 h-4" />
							Subscribe on YouTube
						</Button>
					</div>
				</div>
			</div>

			<div class="h-4" />
			<HomeNewsletterSection />
		</div>
	</>;
}

type PrincipleProof = 'adapters' | 'types' | 'adoption' | 'portable';

type WhyTanStackPrinciple = {
	label: string;
	title: string;
	body: string;
	Icon: LucideIcon;
	accentClassName: string;
	iconClassName: string;
	proof: PrincipleProof;
};

type AdapterGraphNode = {
	height: number;
	label: string;
	width: number;
	x: number;
	y: number;
};

type AdapterGraphPoint = {
	x: number;
	y: number;
};

type AdapterGraphCurve = {
	control1: AdapterGraphPoint;
	control2: AdapterGraphPoint;
	path: string;
};

const whyTanStackPrinciples = [
	{
		label: 'Portable core',
		title: 'Framework Agnostic',
		body: 'Every library starts with a provider-agnostic core. Use React, Vue, Solid, Angular, or vanilla JS—your choice.',
		Icon: Layers,
		accentClassName: 'from-blue-500 to-cyan-500',
		iconClassName: 'border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-900 dark:bg-cyan-950/40 dark:text-cyan-300',
		proof: 'adapters',
	},
	{
		label: 'Compile-time contracts',
		title: 'Type-Safe by Design',
		body: 'First-class TypeScript support that catches bugs at compile time and makes refactoring fearless.',
		Icon: Code2,
		accentClassName: 'from-emerald-500 to-teal-500',
		iconClassName: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300',
		proof: 'types',
	},
	{
		label: 'Real workloads',
		title: 'Production-Grade',
		body: 'Battle-tested in the world\'s largest apps. Built for real workloads, not just happy-path demos.',
		Icon: Zap,
		accentClassName: 'from-orange-500 to-red-500',
		iconClassName: 'border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-900 dark:bg-orange-950/40 dark:text-orange-300',
		proof: 'adoption',
	},
	{
		label: 'Independent tools',
		title: 'No Vendor Lock-in',
		body: 'Open source and independent. No hidden agendas, no platform bias—just great tools for developers.',
		Icon: Shield,
		accentClassName: 'from-purple-500 to-pink-500',
		iconClassName: 'border-purple-200 bg-purple-50 text-purple-700 dark:border-purple-900 dark:bg-purple-950/40 dark:text-purple-300',
		proof: 'portable',
	},
] satisfies ReadonlyArray<WhyTanStackPrinciple>;

const adapterGraphWidth = 320;
const adapterGraphHeight = 128;

const frameworkAdapterCore = {
	label: 'core',
	x: 132,
	y: 58,
	width: 56,
	height: 32,
} satisfies AdapterGraphNode;

const frameworkAdapterNodes = [
	{ label: 'React', x: 18, y: 28, width: 60, height: 26 },
	{ label: 'Vue', x: 132, y: 7, width: 56, height: 26 },
	{ label: 'Solid', x: 242, y: 28, width: 60, height: 26 },
	{ label: 'Angular', x: 26, y: 98, width: 78, height: 26 },
	{ label: 'Vanilla', x: 216, y: 98, width: 78, height: 26 },
] satisfies ReadonlyArray<AdapterGraphNode>;

const frameworkAdapterConnections = frameworkAdapterNodes.map((node) => {
	const start = edgeAnchor(frameworkAdapterCore, node);
	const end = edgeAnchor(node, frameworkAdapterCore);
	const curve = curveBetween(start, end, 0.5);

	return {
		control1: curve.control1,
		control2: curve.control2,
		end,
		label: node.label,
		path: curve.path,
		start,
	};
});

function centerPoint(node: AdapterGraphNode): AdapterGraphPoint {
	return {
		x: node.x + node.width / 2,
		y: node.y + node.height / 2,
	};
}

function edgeAnchor(node: AdapterGraphNode, toward: AdapterGraphNode): AdapterGraphPoint {
	const center = centerPoint(node);
	const targetCenter = centerPoint(toward);
	const deltaX = targetCenter.x - center.x;
	const deltaY = targetCenter.y - center.y;

	if (deltaX === 0 && deltaY === 0) {
		return center;
	}

	const scaleX =
		deltaX === 0 ? Number.POSITIVE_INFINITY : node.width / 2 / Math.abs(deltaX);
	const scaleY =
		deltaY === 0 ? Number.POSITIVE_INFINITY : node.height / 2 / Math.abs(deltaY);
	const scale = Math.min(scaleX, scaleY);

	return {
		x: center.x + deltaX * scale,
		y: center.y + deltaY * scale,
	};
}

function curveBetween(
	start: AdapterGraphPoint,
	end: AdapterGraphPoint,
	bend = 0.5,
): AdapterGraphCurve {
	if (Math.abs(end.y - start.y) > Math.abs(end.x - start.x)) {
		const controlY = start.y + (end.y - start.y) * bend;
		const control1 = { x: start.x, y: controlY };
		const control2 = { x: end.x, y: controlY };

		return {
			control1,
			control2,
			path: `M ${start.x} ${start.y} C ${control1.x} ${control1.y}, ${control2.x} ${control2.y}, ${end.x} ${end.y}`,
		};
	}

	const controlX = start.x + (end.x - start.x) * bend;
	const control1 = { x: controlX, y: start.y };
	const control2 = { x: controlX, y: end.y };

	return {
		control1,
		control2,
		path: `M ${start.x} ${start.y} C ${control1.x} ${control1.y}, ${control2.x} ${control2.y}, ${end.x} ${end.y}`,
	};
}

function adapterGraphStyle(node: AdapterGraphNode): any {
	return {
		height: `${(node.height / adapterGraphHeight) * 100}%`,
		left: `${(node.x / adapterGraphWidth) * 100}%`,
		top: `${(node.y / adapterGraphHeight) * 100}%`,
		width: `${(node.width / adapterGraphWidth) * 100}%`,
	};
}

function adapterGraphPointStyle(point: AdapterGraphPoint): any {
	return {
		left: `${(point.x / adapterGraphWidth) * 100}%`,
		top: `${(point.y / adapterGraphHeight) * 100}%`,
	};
}

function cubicPoint(
	start: AdapterGraphPoint,
	control1: AdapterGraphPoint,
	control2: AdapterGraphPoint,
	end: AdapterGraphPoint,
	progress: number,
): AdapterGraphPoint {
	const inverse = 1 - progress;

	return {
		x: inverse ** 3 * start.x + 3 * inverse ** 2 * progress * control1.x +
			3 * inverse * progress ** 2 * control2.x +
			progress ** 3 * end.x,
		y: inverse ** 3 * start.y + 3 * inverse ** 2 * progress * control1.y +
			3 * inverse * progress ** 2 * control2.y +
			progress ** 3 * end.y,
	};
}

function cubicAngle(
	start: AdapterGraphPoint,
	control1: AdapterGraphPoint,
	control2: AdapterGraphPoint,
	end: AdapterGraphPoint,
	progress: number,
): number {
	const inverse = 1 - progress;
	const deltaX =
		3 * inverse ** 2 * (control1.x - start.x) + 6 * inverse * progress * (control2.x - control1.x) +
		3 * progress ** 2 * (end.x - control2.x);
	const deltaY =
		3 * inverse ** 2 * (control1.y - start.y) + 6 * inverse * progress * (control2.y - control1.y) +
		3 * progress ** 2 * (end.y - control2.y);

	return (Math.atan2(deltaY, deltaX) * 180) / Math.PI;
}

function WhyTanStackSection() {
	return <section class="px-4 lg:max-w-(--breakpoint-lg) md:mx-auto">
		<div
			class="grid gap-8 border-y border-gray-200 py-10 dark:border-gray-800 lg:grid-cols-[minmax(0,0.72fr)_minmax(0,1.28fr)] lg:gap-12 lg:py-12"
		>
			<div class="max-w-xl lg:max-w-sm">
				<div
					class="inline-flex items-center gap-2 text-xs font-black uppercase text-gray-500 dark:text-gray-400"
				>
					<span class="h-2 w-2 rounded-full bg-cyan-500 shadow-[0_0_0_4px_rgba(6,182,212,0.12)]" />
					Product principles
				</div>
				<h3 class="mt-4 text-3xl font-black leading-tight sm:text-4xl">Why TanStack?</h3>
				<p class="mt-4 text-base leading-7 text-gray-600 dark:text-gray-400">
					Our libraries are built around real products and the developers shipping them
				</p>
				<div
					aria-hidden="true"
					class="mt-7 hidden h-px bg-linear-to-r from-gray-300 via-gray-200 to-transparent dark:from-gray-700 dark:via-gray-800 lg:block"
				/>
				<Button
					as={Link}
					to="/tenets"
					variant="ghost"
					color="gray"
					className="mt-7 border-gray-300 bg-white/70 text-gray-950 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-950/70 dark:text-white dark:hover:bg-gray-900"
				>
					Read our product tenets
					<ArrowRight className="h-4 w-4" />
				</Button>
			</div>

			<ol class="grid gap-3 sm:grid-cols-2">{whyTanStackPrinciples.map(
				(principle, index) => <li
					key={principle.title}
					class="group relative flex min-h-[19rem] flex-col overflow-hidden border border-gray-200 bg-white/70 p-5 shadow-sm transition-colors hover:bg-white dark:border-gray-800 dark:bg-gray-950/50 dark:hover:bg-gray-950 sm:p-6"
				>
					<div
						aria-hidden="true"
						class={twMerge(
							'absolute inset-x-0 top-0 h-1 bg-linear-to-r',
							principle.accentClassName,
						)}
					/>
					<div class="relative flex items-start justify-between gap-4">
						<div>
							<p class="font-mono text-[11px] font-bold uppercase text-gray-500 dark:text-gray-500">
								{principle.label as string}
							</p>
							<h4
								class="mt-4 max-w-64 text-xl font-black leading-tight text-gray-950 dark:text-white"
							>
								{principle.title as string}
							</h4>
						</div>
						<span
							class={twMerge(
								'flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border',
								principle.iconClassName,
							)}
						>
							<principle.Icon className="h-5 w-5" />
						</span>
					</div>
					<p class="relative mt-4 max-w-[25rem] text-sm leading-6 text-gray-600 dark:text-gray-400">
						{principle.body as string}
					</p>
					<PrincipleProof proof={principle.proof} accentClassName={principle.accentClassName} />
					<span
						aria-hidden="true"
						class="absolute bottom-3 right-5 font-mono text-5xl font-black leading-none text-gray-100 transition-colors group-hover:text-gray-200 dark:text-white/[0.04] dark:group-hover:text-white/[0.07]"
					>
						{String(index + 1).padStart(2, '0') as string}
					</span>
				</li>,
			)}</ol>
		</div>
	</section>;
}

function FrameworkAdapterGraph({ accentClassName }: { accentClassName: string }) {
	const [activeAdapterIndex, setActiveAdapterIndex] = useState(0);
	const [flowProgress, setFlowProgress] = useState(0);

	useEffect(() => {
		const intervalId = window.setInterval(() => {
			setActiveAdapterIndex((currentIndex) => (currentIndex + 1) % frameworkAdapterNodes.length);
		}, 1150);

		return () => window.clearInterval(intervalId);
	}, []);

	useEffect(() => {
		if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
			return;
		}

		let frameId = 0;
		let lastUpdate = 0;
		const duration = 1500;

		const update = (timestamp: number) => {
			if (timestamp - lastUpdate > 33) {
				setFlowProgress((timestamp % duration) / duration);
				lastUpdate = timestamp;
			}

			frameId = window.requestAnimationFrame(update);
		};

		frameId = window.requestAnimationFrame(update);

		return () => window.cancelAnimationFrame(frameId);
	}, []);

	return <div aria-hidden="true" class="relative mt-auto h-32 pt-5 font-mono text-[10px] font-bold">
		<div class="home-adapter-graph absolute inset-x-0 top-1 h-[7.5rem] overflow-visible">
			{frameworkAdapterNodes.map((adapter, adapterIndex) => {
				const isActive = activeAdapterIndex === adapterIndex;

				return <span
					key={adapter.label}
					data-adapter-label={adapter.label}
					style={adapterGraphStyle(adapter)}
					class={twMerge(
						'absolute z-20 flex items-center justify-center rounded-md border px-2 text-center text-gray-600 shadow-sm backdrop-blur transition-colors duration-500 dark:text-gray-400',
						isActive
							? 'border-cyan-300 bg-cyan-50 text-cyan-800 shadow-cyan-500/15 dark:border-cyan-700 dark:bg-cyan-950/40 dark:text-cyan-200'
							: 'border-gray-200 bg-white/85 dark:border-gray-800 dark:bg-black/55',
					)}
				>
					{adapter.label as string}
				</span>;
			})}

			<span
				data-adapter-label={frameworkAdapterCore.label}
				style={adapterGraphStyle(frameworkAdapterCore)}
				class={twMerge(
					'absolute z-30 flex items-center justify-center rounded-lg bg-linear-to-r text-center text-[11px] text-white shadow-lg shadow-cyan-500/15',
					accentClassName,
				)}
			>
				core
			</span>

			{frameworkAdapterConnections.map((connection, connectionIndex) => {
				const progress = (flowProgress - connectionIndex * 0.13 + 1) % 1;
				const point = cubicPoint(
					connection.start,
					connection.control1,
					connection.control2,
					connection.end,
					progress,
				);
				const angle = cubicAngle(
					connection.start,
					connection.control1,
					connection.control2,
					connection.end,
					progress,
				);

				return <span
					key={`flow-${connection.label}`}
					data-connection-flow={connection.label}
					style={{
						...adapterGraphPointStyle(point),
						transform: `translate(-50%, -50%) rotate(${angle}deg)`,
					}}
					class={twMerge(
						'home-adapter-graph-flow absolute z-50',
						progress < 0.08 || progress > 0.92 ? 'opacity-0' : 'opacity-100',
					)}
				/>;
			})}

			{frameworkAdapterConnections.map((connection, connectionIndex) => {
				const isActive = activeAdapterIndex === connectionIndex;

				return <Fragment key={`ports-${connection.label}`}>
					<span
						data-connection-port={`${connection.label}-core`}
						style={adapterGraphPointStyle(connection.start)}
						class={twMerge(
							'absolute z-40 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-cyan-200 bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.55)] transition-opacity duration-500 dark:border-cyan-900',
							isActive ? 'opacity-100' : 'opacity-55',
						)}
					/>
					<span
						data-connection-port={`${connection.label}-adapter`}
						style={adapterGraphPointStyle(connection.end)}
						class={twMerge(
							'absolute z-40 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-cyan-200 bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.55)] transition-opacity duration-500 dark:border-cyan-900',
							isActive ? 'opacity-100' : 'opacity-55',
						)}
					/>
				</Fragment>;
			})}
		</div>
	</div>;
}

function PrincipleProof({
	proof,
	accentClassName,
}: {
	proof: PrincipleProof;
	accentClassName: string;
}) {
	if (proof === 'adapters') {
		return <FrameworkAdapterGraph accentClassName={accentClassName} />;
	}

	if (proof === 'types') {
		return <div class="mt-auto pt-7 font-mono text-[11px] leading-5">
			<div
				class="rounded-lg border border-gray-200 bg-white/70 p-3 text-gray-600 dark:border-gray-800 dark:bg-black/30 dark:text-gray-400"
			>{[
				['params.postId', 'string'],
				['query.data', 'Project[]'],
				['form.email', 'Field<string>'],
			].map(
				([name, value]) => <div key={name} class="flex items-center justify-between gap-3">
					<span>
						{name as string}
					</span>
					<span
						class={twMerge(
							'bg-linear-to-r bg-clip-text font-black text-transparent',
							accentClassName,
						)}
					>
						{value as string}
					</span>
				</div>,
			)}</div>
		</div>;
	}

	if (proof === 'adoption') {
		return <div class="mt-auto pt-7">
			<div
				class="mb-2 flex items-center justify-between gap-3 font-mono text-[11px] font-bold uppercase text-gray-500 dark:text-gray-500"
			>
				<span>critical paths</span>
				<span class={twMerge('bg-linear-to-r bg-clip-text text-transparent', accentClassName)}>
					used daily
				</span>
			</div>
			<div
				class="grid grid-cols-2 gap-1.5 font-mono text-[11px] font-bold text-gray-600 dark:text-gray-400"
			>{['websites', 'AI tools', 'apps', 'services'].map(
				(useCase) => <span
					key={useCase}
					class="flex items-center gap-1.5 rounded-md border border-gray-200 bg-white/70 px-2 py-1.5 dark:border-gray-800 dark:bg-black/30"
				>
					<span class={twMerge('h-1.5 w-1.5 rounded-full bg-linear-to-r', accentClassName)} />
					{useCase as string}
				</span>,
			)}</div>
		</div>;
	}

	return <div class="mt-auto pt-7">
		<div
			class="flex flex-wrap gap-1.5 font-mono text-[11px] font-bold text-gray-600 dark:text-gray-400"
		>{['MIT', 'self-host', 'any host', 'no paid products'].map(
			(item) => <span
				key={item}
				class="rounded-md border border-gray-200 bg-white/70 px-2 py-1.5 dark:border-gray-800 dark:bg-black/30"
			>
				{item as string}
			</span>,
		)}</div>
		<div aria-hidden="true" class={twMerge('mt-3 h-px bg-linear-to-r', accentClassName)} />
	</div>;
}

function StackCategoryCard({
	groupId,
	libraries,
}: {
	groupId: keyof typeof librariesByGroup;
	libraries: Library[];
}) {
	const groupName = librariesGroupNamesMap[groupId];
	const categorySlug = groupToSlug[groupId];

	return <Link
		to="/stack/$category"
		params={{ category: categorySlug }}
		className="group flex flex-col rounded-xl border border-gray-200 bg-white/60 p-5 transition-all hover:-translate-y-0.5 hover:border-gray-300 hover:shadow-md dark:border-gray-800 dark:bg-gray-900/40 dark:hover:border-gray-700"
	>
		<h4 class="text-base font-bold group-hover:underline">
			{groupName as string}
		</h4>
		<ol class="mt-4 space-y-2.5">{libraries.map(
			(lib, i) => <li key={lib.id} class="flex items-start gap-2.5">
				<span
					class={twMerge(
						'flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-linear-to-br text-[10px] font-black text-white',
						lib.colorFrom,
						lib.colorTo,
					)}
				>
					{i + 1}
				</span>
				<span class="min-w-0 flex-1 text-sm font-semibold leading-snug">
					{lib.name.replace('TanStack ', '') as string}
				</span>
			</li>,
		)}</ol>
		<span
			class="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-gray-600 dark:text-gray-400"
		>
			Browse
			{groupName.toLowerCase() as string}
			<ArrowRight className="w-3 h-3 transition-transform group-hover:translate-x-0.5" />
		</span>
	</Link>;
}

function OpenSourceGradientText() {
	return <span class="home-open-source-gradient">open-source</span>;
}
