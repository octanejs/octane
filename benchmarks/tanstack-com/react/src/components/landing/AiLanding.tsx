import * as React from 'react';
import { Link, useParams } from '@tanstack/react-router';
import {
	ArrowRight,
	Bot,
	BookOpen,
	GitBranch,
	Mic,
	MonitorCog,
	Plug,
	Radio,
	ScanSearch,
	Sparkles,
	Split,
	WandSparkles,
} from 'lucide-react';

import { BottomCTA } from '~/components/BottomCTA';
import { Footer } from '~/components/Footer';
import { GithubIcon } from '~/components/icons/GithubIcon';
import { LandingCommunitySection } from '~/components/LandingCommunitySection';
import { SponsorSection } from '~/components/SponsorSection';
import { LibraryDownloadsMicro } from '~/components/LibraryDownloadsMicro';
import { LibraryWordmark } from '~/components/LibraryWordmark';
import LandingPageGad from '~/components/LandingPageGad';
import { getLibrary } from '~/libraries';

import { LandingEcosystemProof } from '~/components/landing/LandingEcosystemProof';
import { LandingCopyPromptButton } from '~/components/landing/LandingCopyPromptButton';
const library = getLibrary('ai');
const aiAgentPrompt = [
	'Build a TanStack AI feature for a TypeScript app.',
	'Use the headless client or framework adapter, AG-UI-compatible request/event streams, provider adapters, typed client/server tools, structured output, and observable runtime state without routing traffic through a hosted gateway.',
	'Show provider portability, tool approval, streaming UI, and media/realtime capabilities where useful.',
].join(' ');

const heroProof = [
	{
		label: 'AG-UI native',
		value: 'portable client and event protocol',
	},
	{
		label: 'Provider adapters',
		value: 'OpenRouter, OpenAI, Anthropic, Gemini',
	},
	{
		label: 'Typed tools',
		value: 'client, server, approvals, media',
	},
];

const aiHeroClients = ['Vanilla', 'React', 'Vue', 'Solid', 'Svelte', 'Preact'];
const aiHeroServers = [
	{ label: 'TanStack AI', detail: 'TypeScript', kind: 'tanstack' as const },
	{ label: 'Python', dotted: true },
	{ label: 'Go', dotted: true },
	{ label: 'PHP', dotted: true },
];
const aiHeroProviders = ['OpenRouter', 'OpenAI', 'Anthropic', 'Gemini'];
const graphClientNodes = aiHeroClients.map((label, index) => ({
	label,
	x: [34, 154, 274][index % 3] ?? 154,
	y: index < 3 ? 44 : 90,
	width: 86,
	height: 34,
}));
const graphAgUiNode = {
	label: 'TanStack AI Client',
	detail: 'AG-UI',
	kind: 'tanstack' as const,
	x: 142,
	y: 138,
	width: 136,
	height: 58,
};
const graphServerNodes = aiHeroServers.map((server, index) => ({
	...server,
	x: [38, 178, 254, 326][index] ?? 178,
	y: index === 0 ? 254 : 260,
	width: index === 0 ? 124 : 56,
	height: index === 0 ? 54 : 42,
}));
const graphProviderNodes = aiHeroProviders.map((label, index) => ({
	label,
	x: 18 + index * 98,
	y: 352,
	width: 78,
	height: 34,
}));
const aiHeroMessages = [
	{
		user: 'Build the invoice assistant on our stack.',
		assistant:
			'Using TanStack AI for TypeScript, AG-UI events, a server tool for invoices, and OpenRouter for model routing.',
	},
	{
		user: 'Ask before it charges a card.',
		assistant: 'Tool approval added. The UI will pause on chargeCard until your app confirms it.',
	},
	{
		user: 'Can we switch providers later?',
		assistant:
			'Yes. The provider stays behind an adapter; the app keeps the same event stream and typed tools.',
	},
];

type AiHeroChatMessage = {
	assistant: string;
	id: string;
	isStreaming: boolean;
	user: string;
};

const featureCards = [
	{
		title: 'Protocol first, gateway never required.',
		body: 'Clients and servers speak AG-UI-compatible requests and event streams, so teams can own their transport, runtime, and deployment shape.',
		icon: <Radio size={18} />,
	},
	{
		title: 'Providers are adapters, not the architecture.',
		body: 'Use OpenRouter, OpenAI, Anthropic, Gemini, Ollama, Groq, Grok/xAI, ElevenLabs, and fal.ai without making the app proprietary to one vendor.',
		icon: <Plug size={18} />,
	},
	{
		title: 'Tools stay typed where they run.',
		body: 'Define client, server, isomorphic, and provider-native tools with input/output types, approvals, and runtime boundaries that remain visible.',
		icon: <Bot size={18} />,
	},
	{
		title: 'Media is part of the same SDK story.',
		body: 'Text, structured output, reasoning streams, image, speech, transcription, realtime voice, and video can share provider-aware primitives.',
		icon: <Mic size={18} />,
	},
];

const pipelineSteps = [
	{
		label: 'Client',
		body: 'Headless client or framework hook starts the interaction from your UI.',
	},
	{
		label: 'Protocol',
		body: 'AG-UI request and event streams keep client/server interop explicit.',
	},
	{
		label: 'Provider',
		body: 'Adapters translate into model-specific capabilities and options.',
	},
	{
		label: 'Observe',
		body: 'Devtools, middleware, logs, and hooks make the runtime explainable.',
	},
];

const runtimeSignals = [
	{
		label: 'tool approval',
		value: 'pending: chargeCard',
	},
	{
		label: 'stream event',
		value: 'reasoning.delta',
	},
	{
		label: 'structured output',
		value: 'schema matched',
	},
	{
		label: 'media job',
		value: 'image generation complete',
	},
];

const frameworkAdapters = ['React', 'Vue', 'Solid', 'Svelte', 'Preact', 'Vanilla'];

export default function AiLanding() {
	const { version } = useParams({ strict: false });
	const resolvedVersion = version ?? library.latestVersion;

	return (
		<div className="w-full min-w-0 overflow-x-hidden bg-[#fff1f7] text-zinc-950 dark:bg-zinc-950 dark:text-white">
			<section className="max-w-full overflow-hidden border-b border-pink-950/10 bg-[#ffe4f0] dark:border-pink-300/10 dark:bg-[#190612]">
				<div className="mx-auto grid w-full min-w-0 max-w-full gap-8 px-4 py-10 lg:max-w-[80rem] lg:grid-cols-[0.84fr_1.16fr] lg:items-start lg:py-12 xl:max-w-[92rem]">
					<div className="min-w-0 max-w-full sm:max-w-3xl">
						<SectionKicker icon={<WandSparkles size={14} />}>Open AI application SDK</SectionKicker>

						<div className="mt-4 flex flex-wrap items-start gap-x-3 gap-y-2">
							<h1 className="text-5xl font-black leading-[0.95] sm:text-6xl lg:text-7xl">
								<LibraryWordmark library={library} />
							</h1>
							{library.badge ? (
								<span className="rounded-md bg-zinc-950 px-2 py-1 text-xs font-black uppercase text-white dark:bg-white dark:text-zinc-950">
									{library.badge}
								</span>
							) : null}
						</div>

						<p className="mt-5 max-w-2xl text-lg font-bold leading-8 text-zinc-900 dark:text-zinc-100 sm:text-xl">
							Own the AI stack between your UI and your models.
						</p>

						<p className="mt-4 max-w-2xl text-base leading-7 text-zinc-700 dark:text-zinc-300 sm:text-lg">
							AI is an open-source SDK for building provider-portable AI features with
							AG-UI-compatible clients, server helpers, typed tools, media generation, and
							observable runtime primitives without a hosted gateway in the middle.
						</p>

						<LibraryDownloadsMicro
							animateIncreaseTrend
							library={library}
							className="mt-5"
							label="weekly downloads"
							period="weekly"
							showTotals
						/>

						<div className="mt-7 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
							<AiLink
								to="/$libraryId/$version/docs"
								params={{ libraryId: library.id, version: resolvedVersion }}
								label="Read the docs"
								icon={<BookOpen size={16} aria-hidden="true" />}
							/>
							<LandingCopyPromptButton prompt={aiAgentPrompt} label="Copy AI Prompt" />
						</div>

						<div className="mt-8 grid gap-3 sm:grid-cols-3">
							{heroProof.map((proof) => (
								<ProofPill key={proof.label} {...proof} />
							))}
						</div>
						<LandingEcosystemProof />
					</div>

					<AiGraphChatPanel />
				</div>
			</section>

			<section className="border-b border-pink-950/10 bg-[#fff7fb] dark:border-pink-300/10 dark:bg-[#1f0916]">
				<div className="mx-auto grid w-full min-w-0 max-w-full gap-8 px-4 py-12 lg:max-w-[80rem] lg:grid-cols-[0.74fr_1.26fr] xl:max-w-[92rem]">
					<div>
						<SectionKicker icon={<Sparkles size={14} />}>Why AI</SectionKicker>
						<h2 className="mt-3 max-w-xl text-3xl font-black leading-tight sm:text-4xl">
							AI apps need protocols and boundaries, not another black box.
						</h2>
						<p className="mt-4 max-w-xl text-base leading-7 text-zinc-700 dark:text-zinc-300">
							A useful AI layer has to cross clients, servers, providers, tools, streaming events,
							approvals, and observability. AI keeps those boundaries explicit so teams can swap
							pieces without rewriting the product.
						</p>
					</div>

					<div className="grid gap-4 md:grid-cols-2">
						{featureCards.map((feature) => (
							<FeatureCard key={feature.title} {...feature} />
						))}
					</div>
				</div>
			</section>

			<section className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
				<div className="mx-auto grid w-full min-w-0 max-w-full gap-8 px-4 py-12 lg:max-w-[80rem] lg:grid-cols-[1.05fr_0.95fr] lg:items-center xl:max-w-[92rem]">
					<LifecyclePanel />
					<div>
						<SectionKicker icon={<GitBranch size={14} />}>Runtime pipeline</SectionKicker>
						<h2 className="mt-3 text-3xl font-black leading-tight sm:text-4xl">
							From UI intent to model output, every hop stays visible.
						</h2>
						<p className="mt-4 text-base leading-7 text-zinc-700 dark:text-zinc-300">
							AI features are distributed systems wearing a chat box. The SDK gives each hop a typed
							place to live so the app can stream, tool call, approve, retry, observe, and render
							intentionally.
						</p>
					</div>
				</div>
			</section>

			<section className="border-b border-zinc-200 bg-[#fbfaf6] dark:border-zinc-800 dark:bg-zinc-900">
				<div className="mx-auto grid w-full min-w-0 max-w-full gap-8 px-4 py-12 lg:max-w-[80rem] lg:grid-cols-[0.82fr_1.18fr] lg:items-start xl:max-w-[92rem]">
					<div>
						<SectionKicker icon={<ScanSearch size={14} />}>Observable runtime</SectionKicker>
						<h2 className="mt-3 max-w-xl text-3xl font-black leading-tight sm:text-4xl">
							Debug the interaction, not just the final answer.
						</h2>
						<p className="mt-4 max-w-xl text-base leading-7 text-zinc-700 dark:text-zinc-300">
							Tool calls, approvals, model options, provider events, structured output, middleware,
							and media jobs all need to be inspectable if the feature is going to be operated with
							confidence.
						</p>
					</div>

					<RuntimePanel />
				</div>
			</section>

			<section className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
				<div className="mx-auto grid w-full min-w-0 max-w-full gap-8 px-4 py-12 lg:max-w-[80rem] lg:grid-cols-[0.72fr_1.28fr] lg:items-start xl:max-w-[92rem]">
					<div className="max-w-xl">
						<SectionKicker icon={<Split size={14} />}>Framework adapters</SectionKicker>
						<h2 className="mt-3 text-3xl font-black leading-tight sm:text-4xl">
							Headless core, renderer-specific ergonomics.
						</h2>
						<p className="mt-4 text-base leading-7 text-zinc-700 dark:text-zinc-300">
							Start from the headless client or use the adapter for your UI runtime. The provider,
							protocol, tools, and event model stay the same.
						</p>
						<div className="mt-5 flex flex-wrap gap-2">
							{frameworkAdapters.map((framework) => (
								<span
									key={framework}
									className="rounded-md border border-pink-200 bg-pink-50 px-3 py-1.5 text-sm font-bold text-pink-800 dark:border-pink-900 dark:bg-pink-950/40 dark:text-pink-200"
								>
									{framework}
								</span>
							))}
						</div>
					</div>
				</div>
			</section>

			<section className="border-b border-zinc-200 bg-[#fff1f7] py-12 dark:border-zinc-800 dark:bg-zinc-900">
				<div className="mx-auto w-full max-w-[80rem] px-4 xl:max-w-[92rem]">
					<div className="max-w-3xl">
						<SectionKicker icon={<MonitorCog size={14} />}>Product control</SectionKicker>
						<h2 className="mt-3 text-3xl font-black leading-tight sm:text-4xl">
							Bring your providers, servers, and product constraints.
						</h2>
						<p className="mt-4 text-base leading-7 text-zinc-700 dark:text-zinc-300">
							AI should help teams standardize the app layer without flattening provider
							capabilities or forcing a hosted platform into the critical path.
						</p>
					</div>
				</div>
			</section>

			<section className="bg-white py-12 dark:bg-zinc-950">
				<div className="mx-auto w-full max-w-[80rem] px-4 xl:max-w-[92rem]">
					<div className="max-w-3xl">
						<SectionKicker icon={<GithubIcon className="h-4 w-4" />}>
							Open source ecosystem
						</SectionKicker>
						<h2 className="mt-3 text-3xl font-black leading-tight sm:text-4xl">
							AI stays useful by staying close to real product work.
						</h2>
						<p className="mt-4 text-base leading-7 text-zinc-700 dark:text-zinc-300">
							Maintainers, adapters, examples, partners, and GitHub sponsors keep the SDK honest as
							models, providers, and app expectations keep changing.
						</p>
					</div>
				</div>

				<div className="mt-10 flex flex-col gap-14">
					<LandingCommunitySection libraryId="ai" />
					<SponsorSection title="GitHub Sponsors" aspectRatio="1/1" packMaxWidth="900px" showCTA />
				</div>
			</section>

			<LandingPageGad />
			<BottomCTA
				linkProps={{
					to: '/$libraryId/$version/docs',
					params: { libraryId: library.id, version: resolvedVersion },
				}}
				label="Get Started!"
				className="border-pink-500 bg-pink-500 text-white hover:bg-pink-600"
			/>
			<Footer />
		</div>
	);
}

function AiGraphChatPanel() {
	const [activeClient, setActiveClient] = React.useState(0);
	const [activeProvider, setActiveProvider] = React.useState(0);
	const [chatMessages, setChatMessages] = React.useState<Array<AiHeroChatMessage>>([]);
	const [typingUserMessage, setTypingUserMessage] = React.useState('');
	const primaryServerNode = graphServerNodes[0];
	const chatScrollRef = React.useRef<HTMLDivElement>(null);
	const chatLockedToBottomRef = React.useRef(true);

	React.useEffect(() => {
		const clientIntervalId = window.setInterval(() => {
			setActiveClient((current) => (current + 1) % aiHeroClients.length);
		}, 2300);
		const providerIntervalId = window.setInterval(() => {
			setActiveProvider((current) => (current + 1) % aiHeroProviders.length);
		}, 4100);

		return () => {
			window.clearInterval(clientIntervalId);
			window.clearInterval(providerIntervalId);
		};
	}, []);

	React.useEffect(() => {
		let cancelled = false;
		const timeouts: Array<number> = [];

		const addTimeout = (callback: () => void, delay: number) => {
			const timeoutId = window.setTimeout(callback, delay);
			timeouts.push(timeoutId);
		};

		const streamAssistantResponse = (id: string, response: string, onComplete: () => void) => {
			let currentIndex = 0;

			const streamChunk = () => {
				if (cancelled) {
					return;
				}

				if (currentIndex < response.length) {
					const chunkSize = 2 + Math.floor(Math.random() * 7);
					const nextIndex = Math.min(currentIndex + chunkSize, response.length);
					const nextText = response.slice(0, nextIndex);

					setChatMessages((currentMessages) =>
						currentMessages.map((message) =>
							message.id === id ? { ...message, assistant: nextText, isStreaming: true } : message,
						),
					);

					currentIndex = nextIndex;
					addTimeout(streamChunk, 22 + Math.floor(Math.random() * 58));
					return;
				}

				setChatMessages((currentMessages) =>
					currentMessages.map((message) =>
						message.id === id ? { ...message, isStreaming: false } : message,
					),
				);
				addTimeout(onComplete, 1600);
			};

			addTimeout(streamChunk, 450);
		};

		const typeUserMessage = (messageIndex: number, onComplete: (id: string) => void) => {
			const message = aiHeroMessages[messageIndex];
			let currentIndex = 0;

			setTypingUserMessage('');

			const typeChar = () => {
				if (cancelled) {
					return;
				}

				if (currentIndex < message.user.length) {
					currentIndex += 1;
					setTypingUserMessage(message.user.slice(0, currentIndex));
					addTimeout(typeChar, 30 + Math.floor(Math.random() * 40));
					return;
				}

				addTimeout(() => {
					const id = `${messageIndex}-${Date.now()}`;

					setTypingUserMessage('');
					setChatMessages((currentMessages) => [
						...currentMessages.slice(-1),
						{
							assistant: '',
							id,
							isStreaming: true,
							user: message.user,
						},
					]);
					onComplete(id);
				}, 320);
			};

			typeChar();
		};

		const playMessage = (messageIndex: number) => {
			if (cancelled) {
				return;
			}

			const nextMessageIndex = messageIndex % aiHeroMessages.length;
			const message = aiHeroMessages[nextMessageIndex];

			typeUserMessage(nextMessageIndex, (id) => {
				streamAssistantResponse(id, message.assistant, () => {
					playMessage(nextMessageIndex + 1);
				});
			});
		};

		addTimeout(() => playMessage(0), 700);

		return () => {
			cancelled = true;
			timeouts.forEach((timeoutId) => window.clearTimeout(timeoutId));
		};
	}, []);

	React.useEffect(() => {
		const element = chatScrollRef.current;
		if (!element) {
			return;
		}

		const handleScroll = () => {
			const distanceFromBottom = element.scrollHeight - element.scrollTop - element.clientHeight;

			chatLockedToBottomRef.current = distanceFromBottom < 72;
		};

		element.addEventListener('scroll', handleScroll, { passive: true });
		return () => {
			element.removeEventListener('scroll', handleScroll);
		};
	}, []);

	React.useEffect(() => {
		const frameId = window.requestAnimationFrame(() => {
			const element = chatScrollRef.current;

			if (element && chatLockedToBottomRef.current) {
				element.scrollTop = element.scrollHeight;
			}
		});

		return () => window.cancelAnimationFrame(frameId);
	}, [chatMessages]);

	return (
		<div className="grid w-full min-w-0 max-w-full items-start gap-5 lg:grid-cols-[1.05fr_0.95fr]">
			<AiDemoWindow title="client graph">
				<div className="relative h-[26rem] overflow-hidden bg-[#fff7fb] dark:bg-[#120914]">
					<div className="absolute inset-0 opacity-45 [background-image:linear-gradient(rgba(236,72,153,.14)_1px,transparent_1px),linear-gradient(90deg,rgba(236,72,153,.14)_1px,transparent_1px)] [background-size:28px_28px]" />
					<svg
						className="pointer-events-none absolute inset-0 h-full w-full"
						viewBox="0 0 420 420"
						aria-hidden="true"
					>
						{graphClientNodes.map((node, index) => (
							<GraphLine
								key={`client-${node.label}`}
								active={activeClient === index}
								d={curveBetween(bottomAnchor(node), topAnchor(graphAgUiNode), 0.45)}
							/>
						))}
						{graphServerNodes.map((node, index) => (
							<GraphLine
								key={`server-${node.label}`}
								active={index === 0}
								d={curveBetween(bottomAnchor(graphAgUiNode), topAnchor(node), 0.5)}
							/>
						))}
						{graphProviderNodes.map((node, index) => (
							<GraphLine
								key={`provider-${node.label}`}
								active={activeProvider === index}
								d={curveBetween(bottomAnchor(primaryServerNode), topAnchor(node), 0.55)}
							/>
						))}
					</svg>

					<GraphLabel x={18} y={24}>
						client
					</GraphLabel>
					<GraphLabel x={50} y={236}>
						server / runtime
					</GraphLabel>
					<GraphLabel x={18} y={328}>
						provider
					</GraphLabel>

					{graphClientNodes.map((node, index) => (
						<GraphNode
							key={node.label}
							active={index === activeClient}
							label={node.label}
							node={node}
						/>
					))}
					<GraphNode
						active
						detail={graphAgUiNode.detail}
						kind={graphAgUiNode.kind}
						label={graphAgUiNode.label}
						node={graphAgUiNode}
					/>
					{graphServerNodes.map((node, index) => (
						<GraphNode
							key={node.label}
							active={index === 0}
							detail={node.detail}
							dotted={node.dotted}
							kind={node.kind}
							label={node.label}
							node={node}
						/>
					))}
					{graphProviderNodes.map((node, index) => (
						<GraphNode
							key={node.label}
							active={index === activeProvider}
							label={node.label}
							node={node}
						/>
					))}
				</div>
			</AiDemoWindow>

			<AiDemoWindow title="chat runtime">
				<div className="flex h-[26rem] min-w-0 flex-col bg-zinc-50 dark:bg-zinc-900">
					<div
						ref={chatScrollRef}
						className="min-h-0 flex-1 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
					>
						<div className="flex min-h-full flex-col justify-end gap-2.5 p-4">
							{chatMessages.map((message) => (
								<React.Fragment key={message.id}>
									<div className="ml-auto max-w-[86%] rounded-xl bg-pink-500 px-3 py-2 text-xs font-bold leading-5 text-white shadow-sm">
										{message.user}
									</div>
									{message.assistant || message.isStreaming ? (
										<div className="max-w-[90%] rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs leading-5 text-zinc-800 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200">
											{message.assistant}
											{message.isStreaming ? (
												<span className="ml-1 inline-block h-3.5 w-1 rounded-sm bg-pink-500 align-[-0.2rem] motion-safe:animate-pulse" />
											) : null}
										</div>
									) : null}
								</React.Fragment>
							))}
							<div className="grid gap-2 pt-2 text-xs font-bold sm:grid-cols-2">
								{[
									['event', 'assistant.delta'],
									['tool', 'approval required'],
									['provider', aiHeroProviders[activeProvider]],
									['server', 'TanStack AI'],
								].map(([label, value]) => (
									<div key={label} className="rounded-lg bg-white px-3 py-2 dark:bg-zinc-950">
										<p className="text-[0.58rem] uppercase text-zinc-500 dark:text-zinc-500">
											{label}
										</p>
										<p className="mt-1 truncate text-pink-700 dark:text-pink-300">{value}</p>
									</div>
								))}
							</div>
						</div>
					</div>

					<div className="shrink-0 border-t border-zinc-200 p-4 dark:border-zinc-800">
						<div
							className={
								typingUserMessage
									? 'rounded-lg border border-pink-300 bg-white px-3 py-2 text-sm font-bold text-zinc-950 ring-1 ring-pink-500/30 dark:border-pink-900 dark:bg-zinc-950 dark:text-zinc-100'
									: 'rounded-lg border border-pink-200 bg-white px-3 py-2 text-sm font-bold text-zinc-500 dark:border-pink-950 dark:bg-zinc-950 dark:text-zinc-500'
							}
						>
							{typingUserMessage || 'Type a message...'}
							{typingUserMessage ? (
								<span className="ml-1 inline-block h-4 w-1 rounded-sm bg-pink-500 align-[-0.2rem] motion-safe:animate-pulse" />
							) : null}
						</div>
					</div>
				</div>
			</AiDemoWindow>
		</div>
	);
}

function AiDemoWindow({ children, title }: { children: React.ReactNode; title: string }) {
	return (
		<div className="w-full min-w-0 overflow-hidden rounded-lg border border-pink-200 bg-white shadow-sm shadow-pink-950/5 dark:border-pink-900 dark:bg-zinc-950">
			<div className="flex items-center justify-between gap-3 border-b border-pink-100 px-4 py-3 dark:border-pink-950/70">
				<div className="flex items-center gap-2">
					<span className="h-2.5 w-2.5 rounded-md bg-red-400" />
					<span className="h-2.5 w-2.5 rounded-md bg-yellow-400" />
					<span className="h-2.5 w-2.5 rounded-md bg-emerald-400" />
				</div>
				<span className="text-xs font-bold text-zinc-500 dark:text-zinc-400">{title}</span>
			</div>
			{children}
		</div>
	);
}

type GraphNodePosition = {
	height: number;
	label: string;
	width: number;
	x: number;
	y: number;
};

type GraphPoint = {
	x: number;
	y: number;
};

function topAnchor(node: GraphNodePosition): GraphPoint {
	return {
		x: node.x + node.width / 2,
		y: node.y,
	};
}

function bottomAnchor(node: GraphNodePosition): GraphPoint {
	return {
		x: node.x + node.width / 2,
		y: node.y + node.height,
	};
}

function curveBetween(start: GraphPoint, end: GraphPoint, bend = 0.5): string {
	if (Math.abs(end.y - start.y) > Math.abs(end.x - start.x)) {
		const controlY = start.y + (end.y - start.y) * bend;

		return `M ${start.x} ${start.y} C ${start.x} ${controlY}, ${end.x} ${controlY}, ${end.x} ${end.y}`;
	}

	const controlX = start.x + (end.x - start.x) * bend;
	return `M ${start.x} ${start.y} C ${controlX} ${start.y}, ${controlX} ${end.y}, ${end.x} ${end.y}`;
}

function graphStyle(node: GraphNodePosition): React.CSSProperties {
	return {
		height: `${(node.height / 420) * 100}%`,
		left: `${(node.x / 420) * 100}%`,
		top: `${(node.y / 420) * 100}%`,
		width: `${(node.width / 420) * 100}%`,
	};
}

function GraphLine({ active, d }: { active?: boolean; d: string }) {
	return (
		<path
			d={d}
			fill="none"
			stroke={active ? 'currentColor' : 'rgb(113 113 122 / 0.28)'}
			strokeLinecap="round"
			strokeWidth={active ? 3 : 1.5}
			className={
				active
					? 'text-zinc-950 transition-all duration-500 dark:text-white'
					: 'transition-all duration-500'
			}
		/>
	);
}

function GraphLabel({ children, x, y }: { children: React.ReactNode; x: number; y: number }) {
	return (
		<div
			className="absolute z-10 text-[0.62rem] font-black uppercase text-zinc-500 dark:text-zinc-500"
			style={{
				left: `${(x / 420) * 100}%`,
				top: `${(y / 420) * 100}%`,
			}}
		>
			{children}
		</div>
	);
}

function GraphNode({
	active,
	detail,
	dotted,
	kind,
	label,
	node,
}: {
	active?: boolean;
	detail?: string;
	dotted?: boolean;
	kind?: 'tanstack';
	label: string;
	node: GraphNodePosition;
}) {
	const isTanStack = kind === 'tanstack';

	return (
		<div
			style={graphStyle(node)}
			className={
				isTanStack
					? active
						? 'absolute z-20 flex flex-col items-center justify-center rounded-lg border-2 border-pink-300 bg-linear-to-br from-pink-400 to-pink-700 px-2 text-center text-xs font-black leading-tight text-white shadow-xl shadow-pink-950/30 ring-2 ring-pink-200/70 transition-all duration-500 dark:from-pink-300 dark:to-pink-600 dark:ring-pink-400/25'
						: 'absolute z-20 flex flex-col items-center justify-center rounded-lg border-2 border-pink-300 bg-linear-to-br from-white to-pink-100 px-2 text-center text-xs font-black leading-tight text-pink-700 shadow-md shadow-pink-950/10 transition-all duration-500 dark:border-pink-500/70 dark:from-pink-950/70 dark:to-pink-900/25 dark:text-pink-100'
					: active
						? 'absolute z-20 flex flex-col items-center justify-center rounded-lg border border-zinc-950 bg-zinc-950 px-2 text-center text-xs font-black leading-tight text-white shadow-lg shadow-zinc-950/20 transition-all duration-500 dark:border-white dark:bg-white dark:text-zinc-950 dark:shadow-white/10'
						: dotted
							? 'absolute z-20 flex flex-col items-center justify-center rounded-lg border border-dashed border-zinc-400 bg-white/70 px-2 text-center text-xs font-bold leading-tight text-zinc-500 transition-all duration-500 dark:border-zinc-600 dark:bg-zinc-950/65 dark:text-zinc-500'
							: 'absolute z-20 flex flex-col items-center justify-center rounded-lg border border-zinc-300 bg-white/85 px-2 text-center text-xs font-bold leading-tight text-zinc-600 transition-all duration-500 dark:border-zinc-700 dark:bg-zinc-950/80 dark:text-zinc-400'
			}
		>
			<span>{label}</span>
			{detail ? (
				<span
					className={
						active
							? 'mt-0.5 block text-[0.58rem] uppercase opacity-75'
							: 'mt-0.5 block text-[0.58rem] uppercase text-zinc-400 dark:text-zinc-500'
					}
				>
					{detail}
				</span>
			) : null}
		</div>
	);
}

function LifecyclePanel() {
	return (
		<div className="grid gap-3 sm:grid-cols-2">
			{pipelineSteps.map((step, index) => (
				<div
					key={step.label}
					className="rounded-lg border border-zinc-200 bg-[#fff1f7] p-4 dark:border-zinc-800 dark:bg-zinc-900"
				>
					<span className="flex h-9 w-9 items-center justify-center rounded-lg bg-pink-100 text-sm font-black text-pink-800 dark:bg-pink-950 dark:text-pink-200">
						{index + 1}
					</span>
					<h3 className="mt-4 text-lg font-black leading-tight">{step.label}</h3>
					<p className="mt-2 text-sm leading-6 text-zinc-700 dark:text-zinc-300">{step.body}</p>
				</div>
			))}
		</div>
	);
}

function RuntimePanel() {
	return (
		<div className="min-w-0 rounded-lg border border-pink-200 bg-white p-4 dark:border-pink-900 dark:bg-zinc-950">
			<div className="rounded-lg bg-zinc-950 p-4 text-sm text-pink-100 dark:bg-black">
				<p className="font-mono leading-6">
					const {'{'} messages, addToolApprovalResponse {'}'} = useChat({'{'}
					<br />
					&nbsp;&nbsp;connection: fetchServerSentEvents(&quot;/api/chat&quot;),
					<br />
					&nbsp;&nbsp;tools,
					<br />
					&nbsp;&nbsp;devtools: {'{'} name: &quot;Support Chat&quot; {'}'}
					<br />
					{'}'})
				</p>
			</div>

			<div className="mt-4 grid gap-3 md:grid-cols-2">
				{runtimeSignals.map((signal) => (
					<div
						key={signal.label}
						className="rounded-lg border border-zinc-200 bg-[#fff7fb] p-4 dark:border-zinc-800 dark:bg-zinc-900"
					>
						<p className="text-[0.65rem] font-black uppercase text-zinc-500 dark:text-zinc-400">
							{signal.label}
						</p>
						<p className="mt-2 text-sm font-bold leading-6 text-zinc-950 dark:text-white">
							{signal.value}
						</p>
					</div>
				))}
			</div>
		</div>
	);
}

function FeatureCard({
	body,
	icon,
	title,
}: {
	body: string;
	icon: React.ReactNode;
	title: string;
}) {
	return (
		<div className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
			<span className="flex h-9 w-9 items-center justify-center rounded-lg bg-pink-100 text-pink-800 dark:bg-pink-950 dark:text-pink-200">
				{icon}
			</span>
			<h3 className="mt-4 text-xl font-black leading-tight">{title}</h3>
			<p className="mt-3 text-sm leading-6 text-zinc-700 dark:text-zinc-300">{body}</p>
		</div>
	);
}

function SectionKicker({ children, icon }: { children: React.ReactNode; icon: React.ReactNode }) {
	return (
		<p className="inline-flex items-center gap-2 text-sm font-black uppercase text-pink-700 dark:text-pink-300">
			{icon}
			{children}
		</p>
	);
}

function ProofPill({ label, value }: { label: string; value: string }) {
	return (
		<div className="border-l-2 border-pink-500 pl-3">
			<p className="text-sm font-black text-zinc-950 dark:text-white">{label}</p>
			<p className="mt-1 text-sm leading-5 text-zinc-600 dark:text-zinc-400">{value}</p>
		</div>
	);
}

function AiLink({
	icon,
	label,
	params,
	to,
}: {
	icon: React.ReactNode;
	label: string;
	params: Record<string, string>;
	to: string;
}) {
	return (
		<Link
			to={to}
			params={params}
			className="inline-flex w-full max-w-full items-center justify-center gap-2 rounded-lg border border-zinc-950 bg-zinc-950 px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-zinc-800 dark:border-white dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200 sm:w-auto"
		>
			{icon}
			{label}
			<ArrowRight size={15} aria-hidden="true" />
		</Link>
	);
}
