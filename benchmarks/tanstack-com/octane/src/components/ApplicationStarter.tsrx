import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'octane';
import { ClientOnly } from '@octanejs/tanstack-router';
import { ArrowRight, Check, ChevronDown, Copy, Download, Loader2, Rocket } from '@octanejs/lucide';
import { twMerge } from 'tailwind-merge';
import anthropicDarkLogo from '~/images/anthropic-dark.svg';
import anthropicLightLogo from '~/images/anthropic-light.svg';
import openaiDarkLogo from '~/images/openai-dark.svg';
import openaiLightLogo from '~/images/openai-light.svg';
import type {
	ApplicationStarterContext,
	ApplicationStarterResult,
} from '~/utils/application-starter';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '~/components/Collapsible.tsrx';
import {
	GeneratedPromptPreviewBody,
	GeneratedPromptPreviewHeader,
	StarterChipButton,
	StarterLibraryRows,
	StarterPartnerRows,
	StarterTooltipProvider,
} from '~/components/application-builder/parts.tsrx';
import {
	buildStarterPromptDeployUrl,
	toneClasses,
	type ApplicationStarterBuilderIntegration,
	type StarterPromptDeployProvider,
	type StarterTone,
} from '~/components/application-builder/shared';
import { useApplicationBuilder } from '~/components/application-builder/useApplicationBuilder.tsrx';
import { Button, GitHub } from '~/ui';

export interface ApplicationStarterProps {
	builderIntegration?: ApplicationStarterBuilderIntegration;
	className?: string;
	context: ApplicationStarterContext;
	footerContent?: any;
	enableHotkeys?: boolean;
	forceRouterOnly?: boolean;
	formId?: string;
	headerAction?: any;
	mode?: 'compact' | 'full';
	onDirtyStateChange?: (dirty: boolean) => void;
	onResolvedResult?: (result: ApplicationStarterResult | null) => void;
	primaryActionLabel?: string;
	revealOptionsImmediately?: boolean;
	secondaryActionLabel?: string;
	showCliExportActions?: boolean;
	showPromptPreview?: boolean;
	suggestionContext?: ApplicationStarterContext;
	submitButton?: any;
	title?: any;
	tone?: StarterTone;
}

const LazyApplicationStarterHotkeys = lazy(
	() => import('~/components/ApplicationStarterHotkeys.client').then(
		(m) => ({
			default: m.ApplicationStarterHotkeys,
		}),
	),
);

const LazyDeployDialog = lazy(
	() => import('~/components/builder/DeployDialog.tsrx').then(
		(m) => ({
			default: m.DeployDialog,
		}),
	),
);

const starterPackageManagers = ['pnpm', 'npm', 'yarn', 'bun'] as const;
const starterToolchains = ['biome', 'eslint'] as const;

type HostingDeployPartnerId = 'cloudflare' | 'lovable' | 'netlify' | 'railway';
type StarterTransientAction =
	'claude' | 'clone' | 'codex' | 'cursor' | 'deploy' | 'download' | 'netlify';

const hostingDeployPartnerLabels: Record<HostingDeployPartnerId, string> = {
	cloudflare: 'Cloudflare',
	lovable: 'Lovable',
	netlify: 'Netlify',
	railway: 'Railway',
};

function getHostingDeployPartnerId(partnerId: string): HostingDeployPartnerId | undefined {
	switch (partnerId) {
		case 'cloudflare':
		case 'lovable':
		case 'netlify':
		case 'railway':
			return partnerId;
		default:
			return undefined;
	}
}

function getPromptDeployProvider(partnerId: HostingDeployPartnerId): | StarterPromptDeployProvider
| undefined {
	switch (partnerId) {
		case 'lovable':
		case 'netlify':
			return partnerId;
		case 'cloudflare':
		case 'railway':
			return undefined;
	}
}

function buildCodexStartUrl(prompt: string) {
	return `codex://new?prompt=${encodeURIComponent(prompt)}`;
}

function buildClaudeStartUrl(prompt: string) {
	return `https://claude.ai/code?q=${encodeURIComponent(prompt)}`;
}

function buildCursorStartUrl(prompt: string) {
	return `cursor://anysphere.cursor-deeplink/prompt?text=${encodeURIComponent(prompt)}`;
}

export function ApplicationStarter({
	builderIntegration,
	className,
	context,
	footerContent,
	enableHotkeys = false,
	forceRouterOnly = false,
	formId,
	headerAction,
	mode = 'full',
	onDirtyStateChange,
	onResolvedResult,
	primaryActionLabel = 'Copy Prompt',
	revealOptionsImmediately = false,
	secondaryActionLabel = 'Build with Netlify',
	showCliExportActions = true,
	showPromptPreview = true,
	suggestionContext,
	submitButton,
	title = 'What would you like to build?',
	tone = 'cyan',
}: ApplicationStarterProps) {
	const {
		copiedKind,
		copyResultValue,
		dismissPromptCopyNotice,
		deployDialogProvider,
		generatePrompt,
		hasGeneratedPrompt,
		hasRevealedOptions,
		hasInput,
		hasMigrationRepositoryUrlError,
		input,
		isDeployDialogOpen,
		isGenerating,
		isGeneratingPrompt,
		isModHeld,
		loadingPhrase,
		migrationRepositoryInputRef,
		migrationRepositoryUrl,
		openDeployDialog,
		partnerSuggestions,
		promptCopyNotice,
		result,
		selectSuggestion,
		selectedPackageManager,
		selectedLibraries,
		selectedPartners,
		selectedToolchain,
		setIsDeployDialogOpen,
		setIsModHeld,
		showMigrationRepositoryInput,
		trackActivation,
		submitCurrentInput,
		suggestions,
		toggleLibrary,
		togglePackageManager,
		togglePartner,
		toggleToolchain,
		updateInput,
		updateMigrationRepositoryUrl,
	} = useApplicationBuilder({
		builderIntegration,
		context,
		forceRouterOnly,
		mode,
		onDirtyStateChange,
		onResolvedResult,
		revealOptionsImmediately,
		suggestionContext,
	});

	const palette = toneClasses[tone];
	const compact = mode === 'compact';
	const [showMoreActions, setShowMoreActions] = useState(false);
	const [pendingHostingDeployPartner, setPendingHostingDeployPartner] = useState<
		HostingDeployPartnerId | null
	>(null);
	const [transientAction, setTransientAction] = useState<StarterTransientAction | null>(null);
	const [hasFocusedPromptInput, setHasFocusedPromptInput] = useState(false);
	const [isPromptFocused, setIsPromptFocused] = useState(false);
	const [isMacShortcutPlatform, setIsMacShortcutPlatform] = useState(false);
	const [showPackageManagerOptions, setShowPackageManagerOptions] = useState(false);
	const [showToolchainOptions, setShowToolchainOptions] = useState(false);
	const canRevealOptions = hasInput && !hasMigrationRepositoryUrlError && !isGenerating;
	const canUseFinalActions =
		hasRevealedOptions && hasInput && !hasMigrationRepositoryUrlError && !isGenerating;
	const transientActionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const showTransientActionFeedback = useCallback((action: StarterTransientAction) => {
		if (transientActionTimerRef.current) {
			clearTimeout(transientActionTimerRef.current);
		}

		setTransientAction(action);
		transientActionTimerRef.current = setTimeout(() => {
			setTransientAction((current) => (current === action ? null : current));
			transientActionTimerRef.current = null;
		}, 1800);
	}, []);
	const selectedHostingDeployPartner = useMemo(
		() => selectedPartners.flatMap((partnerId) => {
			const hostingPartnerId = getHostingDeployPartnerId(partnerId);

			return hostingPartnerId ? [hostingPartnerId] : [];
		})[0],
		[selectedPartners],
	);
	const isSelectedHostingDeployPending =
		pendingHostingDeployPartner !== null &&
			pendingHostingDeployPartner === selectedHostingDeployPartner;
	const isDeployFeedbackActive = isSelectedHostingDeployPending || transientAction === 'deploy';
	const isPromptCopied = copiedKind === 'prompt';
	const isCommandCopied = copiedKind === 'command';
	const resultPrompt = result?.prompt;
	const selectedPromptDeployProvider =
		selectedHostingDeployPartner
			? getPromptDeployProvider(selectedHostingDeployPartner)
			: undefined;
	const selectedHostingDeployHref = useMemo(
		() => selectedPromptDeployProvider && result?.prompt
			? buildStarterPromptDeployUrl(selectedPromptDeployProvider, result.prompt)
			: undefined,
		[result?.prompt, selectedPromptDeployProvider],
	);
	const netlifyStartHref = useMemo(
		() => (resultPrompt ? buildStarterPromptDeployUrl('netlify', resultPrompt) : undefined),
		[resultPrompt],
	);
	const codexStartHref = useMemo(
		() => (resultPrompt ? buildCodexStartUrl(resultPrompt) : undefined),
		[resultPrompt],
	);
	const claudeStartHref = useMemo(
		() => (resultPrompt ? buildClaudeStartUrl(resultPrompt) : undefined),
		[resultPrompt],
	);
	const cursorStartHref = useMemo(
		() => (resultPrompt ? buildCursorStartUrl(resultPrompt) : undefined),
		[resultPrompt],
	);
	const downloadHref = result?.downloadUrl;
	const trackSelectedHostingDeployLink = useCallback(() => {
		if (!selectedHostingDeployPartner) {
			return;
		}

		trackActivation({
			action: selectedHostingDeployPartner === 'netlify' ? 'netlify_start' : 'deploy',
			surface: 'result_panel',
			provider: selectedHostingDeployPartner,
		});
	}, [selectedHostingDeployPartner, trackActivation]);
	const deployToSelectedHostingPartner = async () => {
		if (!selectedHostingDeployPartner) {
			return;
		}

		setPendingHostingDeployPartner(selectedHostingDeployPartner);

		try {
			switch (selectedHostingDeployPartner) {
				case 'cloudflare':
					await openDeployDialog('cloudflare');
					break;
				case 'lovable':
					break;
				case 'netlify':
					break;
				case 'railway':
					await openDeployDialog('railway');
					break;
			}
		} finally {
			setPendingHostingDeployPartner(null);
		}
	};
	const renderCopyPromptButton = () => <Button
		color="emerald"
		variant={selectedHostingDeployPartner ? 'secondary' : 'primary'}
		size="sm"
		type="button"
		onClick={() => void generatePrompt()}
		disabled={!canUseFinalActions}
	>
		{isGeneratingPrompt
			? <Loader2 className="h-4 w-4 animate-spin" />
			: isPromptCopied
				? <Check className="h-4 w-4" />
				: <Copy className="h-4 w-4" />}
		{isGeneratingPrompt
			? loadingPhrase
			: isPromptCopied
				? 'Copied'
				: primaryActionLabel}
	</Button>;
	const renderCopyCliCommandButton = () => <Button
		variant="secondary"
		size="sm"
		type="button"
		onClick={() => {
			void copyResultValue('command');
		}}
		disabled={!canUseFinalActions}
	>
		{isGeneratingPrompt
			? <Loader2 className="h-4 w-4 animate-spin" />
			: isCommandCopied
				? <Check className="h-4 w-4" />
				: <Copy className="h-4 w-4" />}
		{isGeneratingPrompt
			? 'Preparing...'
			: isCommandCopied
				? 'Copied'
				: 'Copy CLI Command'}
	</Button>;
	const renderActionAnchor = ({
		action,
		className,
		href,
		icon,
		label,
		onTrack,
		rel = 'noopener noreferrer',
		size,
		target = '_blank',
		variant = 'primary',
	}: {
		action: StarterTransientAction;
		className?: string;
		href?: string;
		icon: any;
		label: string;
		onTrack: () => void;
		rel?: string;
		size: 'xs' | 'sm';
		target?: string;
		variant?: 'primary' | 'secondary';
	}) => {
		const disabled = !canUseFinalActions || !href || transientAction === action;
		const waitingForHref = !href;

		return <Button
			as="a"
			variant={variant}
			size={size}
			href={disabled ? undefined : href}
			target={target}
			rel={rel}
			aria-disabled={disabled}
			tabIndex={disabled ? -1 : undefined}
			onClick={(event) => {
				if (disabled) {
					event.preventDefault();
					return;
				}

				onTrack();
				showTransientActionFeedback(action);
			}}
			className={twMerge(className, disabled && 'pointer-events-none opacity-50')}
		>
			{transientAction === action || waitingForHref
				? <Loader2 className={twMerge('animate-spin', size === 'xs' ? 'h-3 w-3' : 'h-4 w-4')} />
				: (icon)}
			{transientAction === action
				? 'Opening...'
				: waitingForHref
					? 'Preparing...'
					: label}
		</Button>;
	};
	const renderSelectedHostingDeployButton = () => {
		if (!selectedHostingDeployPartner) {
			return null;
		}

		if (selectedPromptDeployProvider) {
			const disabled =
				!canUseFinalActions || !selectedHostingDeployHref || transientAction === 'deploy';
			const waitingForHref = !selectedHostingDeployHref;

			return <Button
				as="a"
				color="emerald"
				variant="primary"
				size="sm"
				href={disabled ? undefined : selectedHostingDeployHref}
				target="_blank"
				rel="noopener noreferrer"
				aria-disabled={disabled}
				tabIndex={disabled ? -1 : undefined}
				onClick={(event) => {
					if (disabled) {
						event.preventDefault();
						return;
					}

					trackSelectedHostingDeployLink();
					showTransientActionFeedback('deploy');
				}}
				className={disabled ? 'pointer-events-none opacity-50' : undefined}
				aria-label={`Deploy to ${hostingDeployPartnerLabels[selectedHostingDeployPartner]}`}
			>
				{isDeployFeedbackActive || waitingForHref
					? <Loader2 className="h-4 w-4 animate-spin" />
					: <Rocket className="h-4 w-4" />}
				{isDeployFeedbackActive
					? 'Opening...'
					: waitingForHref
						? 'Preparing...'
						: 'Deploy'}
			</Button>;
		}

		return <Button
			color="emerald"
			variant="primary"
			size="sm"
			type="button"
			onClick={() => {
				showTransientActionFeedback('deploy');
				void deployToSelectedHostingPartner();
			}}
			disabled={!canUseFinalActions || pendingHostingDeployPartner !== null ||
				transientAction === 'deploy'}
			aria-label={`Deploy to ${hostingDeployPartnerLabels[selectedHostingDeployPartner]}`}
		>
			{isDeployFeedbackActive
				? <Loader2 className="h-4 w-4 animate-spin" />
				: <Rocket className="h-4 w-4" />}
			{isDeployFeedbackActive ? 'Opening...' : 'Deploy'}
		</Button>;
	};
	const showOptionsSection = hasRevealedOptions || hasGeneratedPrompt;
	const showActionSection = hasRevealedOptions || hasGeneratedPrompt;

	useEffect(() => {
		return () => {
			if (transientActionTimerRef.current) {
				clearTimeout(transientActionTimerRef.current);
			}
		};
	}, []);

	useEffect(() => {
		if (typeof navigator === 'undefined') {
			return;
		}

		setIsMacShortcutPlatform(/Mac|iPhone|iPad|iPod/i.test(navigator.platform));
	}, []);

	return <div class={twMerge('relative', className)}>
		{enableHotkeys && !compact && hasFocusedPromptInput
			? <ClientOnly>
					<Suspense fallback={null}>
						<LazyApplicationStarterHotkeys
							onSubmit={() => {
								if (showActionSection) {
									void generatePrompt();
								} else {
									void submitCurrentInput();
								}
							}}
							onModKeyChange={setIsModHeld}
							promptFocused={isPromptFocused}
						/>
					</Suspense>
				</ClientOnly>
			: null}

		{isDeployDialogOpen
			? <Suspense fallback={null}>
					<LazyDeployDialog
						isOpen={isDeployDialogOpen}
						onClose={() => setIsDeployDialogOpen(false)}
						provider={deployDialogProvider}
						starterRecipe={result?.recipe ?? null}
						onTrackActivation={trackActivation}
					/>
				</Suspense>
			: null}

		<div class="relative">
			{compact
				? <div class="space-y-2">
						<h3
							class={twMerge(
								'font-semibold tracking-[-0.03em] text-gray-950 dark:text-white',
								'text-base tracking-[-0.02em]',
							)}
						>{title}</h3>
					</div>
				: null}

			<form
				id={formId}
				class={twMerge('space-y-3', compact ? 'mt-3' : 'mt-0')}
				onSubmit={async (event) => {
					event.preventDefault();
					await submitCurrentInput();
				}}
			>
				{compact
					? <>
							<div
								class="overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-950"
							>
								<div class="border-b border-gray-200 px-3 py-2 dark:border-gray-800">
									<div
										class="text-[10px] font-medium uppercase tracking-[0.16em] text-gray-400 dark:text-gray-500"
									>
										Ideas
									</div>
									<div class="mt-2 flex flex-wrap gap-2">{suggestions.map(
										(suggestion) => <StarterChipButton
											key={suggestion.label}
											compact
											onClick={() => {
												void selectSuggestion({ suggestion });
											}}
											palette={palette}
											selected={input === suggestion.input}
										>{suggestion.label}</StarterChipButton>,
									)}</div>
								</div>

								{showMigrationRepositoryInput
									? <div class="border-b border-gray-200 px-3 py-2 dark:border-gray-800">
											<div
												class="text-[10px] font-medium uppercase tracking-[0.16em] text-gray-400 dark:text-gray-500"
											>
												Existing Repository URL
											</div>
											<input
												ref={migrationRepositoryInputRef}
												type="text"
												value={migrationRepositoryUrl}
												onInput={(event) => {
													updateMigrationRepositoryUrl(event.target.value);
												}}
												placeholder="https://github.com/acme/legacy-next-app"
												class={twMerge(
													'mt-2 h-9 w-full rounded-md border border-gray-200 bg-white px-3 text-xs text-gray-900 outline-none transition-colors placeholder:text-gray-400 dark:border-gray-800 dark:bg-gray-950 dark:text-white dark:placeholder:text-gray-500',
													palette.ring,
													hasMigrationRepositoryUrlError && 'border-red-300 dark:border-red-800',
												)}
											/>
											{hasMigrationRepositoryUrlError
												? <div class="mt-2 text-[11px] text-red-600 dark:text-red-400">
														Enter a valid Git or GitHub repository URL.
													</div>
												: null}
										</div>
									: null}

								<div class="relative">
									<div
										class="px-3 pt-2 text-[10px] font-medium uppercase tracking-[0.16em] text-gray-400 dark:text-gray-500"
									>
										Prompt
									</div>
									<textarea
										value={input}
										onInput={(event) => {
											updateInput(event.target.value);
										}}
										onFocus={() => {
											setHasFocusedPromptInput(true);
											setIsPromptFocused(true);
										}}
										onBlur={() => {
											setIsPromptFocused(false);
										}}
										rows={3}
										placeholder="Build a SaaS app with auth, Postgres, nested routes, and Sentry. Use pnpm and deploy to Cloudflare."
										class={twMerge(
											'w-full min-h-20 bg-transparent px-3 pb-2 pt-1 text-xs leading-5 text-gray-900 outline-none transition-colors dark:text-white',
											palette.ring,
										)}
									/>
								</div>

								{!showOptionsSection
									? <div class="border-t border-gray-200 px-3 py-2 dark:border-gray-800">
											<Button
												color="emerald"
												className="pr-1"
												size="xs"
												type="submit"
												disabled={!canRevealOptions}
											>
												<ArrowRight className="h-4 w-4" />
												Next
												{enableHotkeys
													? <SubmitShortcutHint isMac={isMacShortcutPlatform} />
													: null}
											</Button>
										</div>
									: null}
							</div>

							<Collapsible open={showOptionsSection}>
								<CollapsibleContent className="mt-3">
									{showOptionsSection
										? <StarterTooltipProvider>
												<div
													class="space-y-2 rounded-lg border border-gray-200 bg-white px-3 py-3 dark:border-gray-800 dark:bg-gray-950"
												>
													<div class="mb-3">
														<div
															class="text-[10px] font-medium uppercase tracking-[0.16em] text-gray-400 dark:text-gray-500"
														>
															TanStack Libraries
														</div>

														<div class="mt-2 space-y-2">
															<StarterLibraryRows
																compact
																selectedLibraries={selectedLibraries}
																toggleLibrary={toggleLibrary}
															/>
														</div>
													</div>

													<div
														class="text-[10px] font-medium uppercase tracking-[0.16em] text-gray-400 dark:text-gray-500"
													>
														Partner Integrations
													</div>
													<StarterPartnerRows
														compact
														palette={palette}
														partnerSuggestions={partnerSuggestions}
														selectedPartners={selectedPartners}
														togglePartner={togglePartner}
													/>
													<StarterCustomizationSection
														compact
														onOpenChange={setShowToolchainOptions}
														open={showToolchainOptions}
														title="Toolchain"
													>
														<div class="mt-2 flex flex-wrap gap-2">{starterToolchains.map(
															(toolchain) => <StarterChipButton
																key={toolchain}
																compact
																onClick={() => {
																	toggleToolchain(toolchain);
																}}
																palette={palette}
																selected={selectedToolchain === toolchain}
															>{toolchain}</StarterChipButton>,
														)}</div>
													</StarterCustomizationSection>
													<StarterCustomizationSection
														compact
														onOpenChange={setShowPackageManagerOptions}
														open={showPackageManagerOptions}
														title="Package Manager"
													>
														<div class="mt-2 flex flex-wrap gap-2">{starterPackageManagers.map(
															(packageManager) => <StarterChipButton
																key={packageManager}
																compact
																onClick={() => {
																	togglePackageManager(packageManager);
																}}
																palette={palette}
																selected={selectedPackageManager === packageManager}
															>{packageManager}</StarterChipButton>,
														)}</div>
													</StarterCustomizationSection>
												</div>
											</StarterTooltipProvider>
										: null}
								</CollapsibleContent>
							</Collapsible>
						</>
					: <div
							class="relative overflow-hidden rounded-[1rem] border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-950"
						>
							<div>
								<div
									class="border-b border-gray-200 bg-gray-50/70 px-5 py-4 dark:border-gray-800 dark:bg-gray-900/50"
								>
									<div class="flex items-center justify-between gap-3">
										<h3
											class="font-semibold tracking-[-0.04em] text-[1.375rem] md:text-[1.5rem] text-gray-950 dark:text-white"
										>{title}</h3>
										{headerAction ? <div class="shrink-0">{headerAction}</div> : null}
									</div>
									<div class="mt-4 flex flex-wrap gap-2">{suggestions.map(
										(suggestion) => <StarterChipButton
											key={suggestion.label}
											onClick={() => {
												void selectSuggestion({ suggestion });
											}}
											palette={palette}
											selected={input === suggestion.input}
										>{suggestion.label}</StarterChipButton>,
									)}</div>
								</div>

								<div class="relative border-b border-gray-200 dark:border-gray-800">
									{showMigrationRepositoryInput
										? <div class="border-b border-gray-200 px-5 py-4 dark:border-gray-800">
												<div
													class="text-[10px] font-medium uppercase tracking-[0.16em] text-gray-400 dark:text-gray-500"
												>
													Existing Repository URL
												</div>
												<input
													ref={migrationRepositoryInputRef}
													type="text"
													value={migrationRepositoryUrl}
													onInput={(event) => {
														updateMigrationRepositoryUrl(event.target.value);
													}}
													placeholder="https://github.com/acme/legacy-next-app"
													class={twMerge(
														'mt-3 h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-900 outline-none transition-colors placeholder:text-gray-400 dark:border-gray-800 dark:bg-gray-950 dark:text-white dark:placeholder:text-gray-500',
														palette.ring,
														hasMigrationRepositoryUrlError && 'border-red-300 dark:border-red-800',
													)}
												/>
												{hasMigrationRepositoryUrlError
													? <div class="mt-2 text-xs text-red-600 dark:text-red-400">
															Enter a valid Git or GitHub repository URL.
														</div>
													: null}
											</div>
										: null}

									<div
										class="px-5 pt-4 text-[10px] font-medium uppercase tracking-[0.16em] text-gray-400 dark:text-gray-500"
									>
										Prompt
									</div>
									<textarea
										value={input}
										onInput={(event) => {
											updateInput(event.target.value);
										}}
										onFocus={() => {
											setHasFocusedPromptInput(true);
											setIsPromptFocused(true);
										}}
										onBlur={() => {
											setIsPromptFocused(false);
										}}
										onClick={(event) => {
											if (enableHotkeys && isModHeld) {
												event.preventDefault();
												if (showActionSection) {
													void generatePrompt();
												} else {
													void submitCurrentInput();
												}
											}
										}}
										rows={4}
										placeholder="Build a SaaS app with auth, Postgres, nested routes, and Sentry. Use pnpm and deploy to Cloudflare."
										class={twMerge(
											'w-full min-h-28 bg-transparent px-5 pb-4 pt-1 text-sm leading-6 text-gray-900 outline-none transition-colors dark:text-white',
											palette.ring,
										)}
									/>

									{!showActionSection
										? <div class="border-t border-gray-200 px-5 py-4 dark:border-gray-800">
												<div class="flex flex-wrap items-center gap-3">
													<Button
														color="emerald"
														className="pr-1.5"
														size="sm"
														type="submit"
														disabled={!canRevealOptions}
													>
														<ArrowRight className="h-4 w-4" />
														Next
														{enableHotkeys
															? <SubmitShortcutHint isMac={isMacShortcutPlatform} />
															: null}
													</Button>
												</div>
											</div>
										: null}
								</div>

								<Collapsible open={showOptionsSection}>
									<CollapsibleContent>
										{showOptionsSection
											? <div class="bg-gray-50/70 px-5 py-4 dark:bg-gray-900/50">
													<StarterTooltipProvider>
														<div>
															<div class="mb-4">
																<div
																	class="text-[10px] font-medium uppercase tracking-[0.16em] text-gray-400 dark:text-gray-500"
																>
																	TanStack Libraries
																</div>

																<div class="mt-3 space-y-2.5">
																	<StarterLibraryRows
																		selectedLibraries={selectedLibraries}
																		toggleLibrary={toggleLibrary}
																	/>
																</div>
															</div>

															<div
																class="text-[10px] font-medium uppercase tracking-[0.16em] text-gray-400 dark:text-gray-500"
															>
																Add Integrations
															</div>
															<div class="mt-3">
																<StarterPartnerRows
																	palette={palette}
																	partnerSuggestions={partnerSuggestions}
																	selectedPartners={selectedPartners}
																	size="compact"
																	togglePartner={togglePartner}
																/>
															</div>
															<StarterCustomizationSection
																onOpenChange={setShowToolchainOptions}
																open={showToolchainOptions}
																title="Toolchain"
															>
																<div class="mt-3 flex flex-wrap gap-2">{starterToolchains.map(
																	(toolchain) => <StarterChipButton
																		key={toolchain}
																		onClick={() => {
																			toggleToolchain(toolchain);
																		}}
																		palette={palette}
																		selected={selectedToolchain === toolchain}
																		size="compact"
																	>{toolchain}</StarterChipButton>,
																)}</div>
															</StarterCustomizationSection>
															<StarterCustomizationSection
																onOpenChange={setShowPackageManagerOptions}
																open={showPackageManagerOptions}
																title="Package Manager"
															>
																<div class="mt-3 flex flex-wrap gap-2">{starterPackageManagers.map(
																	(packageManager) => <StarterChipButton
																		key={packageManager}
																		onClick={() => {
																			togglePackageManager(packageManager);
																		}}
																		palette={palette}
																		selected={selectedPackageManager === packageManager}
																		size="compact"
																	>{packageManager}</StarterChipButton>,
																)}</div>
															</StarterCustomizationSection>
														</div>
													</StarterTooltipProvider>

													{footerContent ? <div class="mt-4">{footerContent}</div> : null}
												</div>
											: null}
									</CollapsibleContent>
								</Collapsible>

								<Collapsible open={showActionSection}>
									<CollapsibleContent>
										{showActionSection
											? <div class="bg-gray-50/70 px-5 py-4 dark:bg-gray-900/50">
													<div class="flex flex-col gap-4">
														{!showCliExportActions
															? <div class="flex flex-wrap items-center gap-3">
																	{!selectedHostingDeployPartner
																		? renderActionAnchor({
																				action: 'netlify',
																				className: 'border-[#00AD9F] bg-[#00AD9F] text-white hover:bg-[#009a8e]',
																				href: netlifyStartHref,
																				icon: <Rocket className="h-4 w-4" />,
																				label: secondaryActionLabel,
																				onTrack: () => {
																					trackActivation({
																						action: 'netlify_start',
																						surface: 'result_panel',
																						provider: 'netlify',
																					});
																				},
																				size: 'sm',
																			})
																		: null}

																	{renderActionAnchor({
																		action: 'codex',
																		className: 'border-gray-900 bg-gray-900 text-white hover:bg-gray-800 dark:border-gray-100 dark:bg-gray-100 dark:text-gray-950 dark:hover:bg-gray-200',
																		href: codexStartHref,
																		icon: <span class="relative h-4 w-4 shrink-0">
																			<img
																				src={openaiDarkLogo}
																				alt=""
																				aria-hidden="true"
																				class="h-4 w-4 dark:hidden"
																			/>
																			<img
																				src={openaiLightLogo}
																				alt=""
																				aria-hidden="true"
																				class="hidden h-4 w-4 dark:block"
																			/>
																		</span>,
																		label: 'Open in Codex',
																		onTrack: () => {
																			trackActivation({
																				action: 'open_codex',
																				surface: 'result_panel',
																			});
																		},
																		size: 'sm',
																	})}
																</div>
															: null}

														<div class="flex flex-wrap items-center gap-3">
															{renderSelectedHostingDeployButton()}
															{renderCopyPromptButton()}
															{showCliExportActions ? renderCopyCliCommandButton() : null}
														</div>

														{showCliExportActions && !showMoreActions
															? <div class="flex flex-wrap items-center gap-3">
																	<Button
																		variant="ghost"
																		size="xs"
																		type="button"
																		onClick={() => setShowMoreActions(true)}
																		className="h-auto border-transparent bg-transparent px-1 py-0 text-[11px] font-medium text-gray-500 hover:bg-transparent hover:text-gray-700 dark:text-gray-500 dark:hover:bg-transparent dark:hover:text-gray-300"
																	>
																		Show More
																	</Button>
																</div>
															: null}

														{showCliExportActions && showMoreActions
															? <div class="flex flex-wrap items-center gap-2">
																	{renderActionAnchor({
																		action: 'codex',
																		className: 'h-6 gap-1 px-2 text-[11px] border-gray-900 bg-gray-900 text-white hover:bg-gray-800 dark:border-gray-100 dark:bg-gray-100 dark:text-gray-950 dark:hover:bg-gray-200',
																		href: codexStartHref,
																		icon: <span class="relative h-3 w-3 shrink-0">
																			<img
																				src={openaiDarkLogo}
																				alt=""
																				aria-hidden="true"
																				class="h-3 w-3 dark:hidden"
																			/>
																			<img
																				src={openaiLightLogo}
																				alt=""
																				aria-hidden="true"
																				class="hidden h-3 w-3 dark:block"
																			/>
																		</span>,
																		label: 'Open in Codex',
																		onTrack: () => {
																			trackActivation({
																				action: 'open_codex',
																				surface: 'result_panel',
																			});
																		},
																		size: 'xs',
																	})}

																	{renderActionAnchor({
																		action: 'claude',
																		className: 'h-6 gap-1 px-2 text-[11px] border-[#D4A373] bg-[#D4A373] text-white hover:bg-[#C6905C] dark:border-[#E6C49A] dark:bg-[#E6C49A] dark:text-gray-950 dark:hover:bg-[#DBB684]',
																		href: claudeStartHref,
																		icon: <span class="relative h-3 w-3 shrink-0">
																			<img
																				src={anthropicDarkLogo}
																				alt=""
																				aria-hidden="true"
																				class="h-3 w-3 dark:hidden"
																			/>
																			<img
																				src={anthropicLightLogo}
																				alt=""
																				aria-hidden="true"
																				class="hidden h-3 w-3 dark:block"
																			/>
																		</span>,
																		label: 'Open in Claude',
																		onTrack: () => {
																			trackActivation({
																				action: 'open_claude',
																				surface: 'result_panel',
																			});
																		},
																		size: 'xs',
																	})}

																	{renderActionAnchor({
																		action: 'cursor',
																		className: 'h-6 gap-1 px-2 text-[11px] border-black bg-black text-white hover:bg-gray-900 dark:border-white dark:bg-white dark:text-black dark:hover:bg-gray-100',
																		href: cursorStartHref,
																		icon: <CursorIcon className="h-3 w-3" />,
																		label: 'Open in Cursor',
																		onTrack: () => {
																			trackActivation({
																				action: 'open_cursor',
																				surface: 'result_panel',
																			});
																		},
																		size: 'xs',
																	})}

																	<Button
																		variant="secondary"
																		size="xs"
																		type="button"
																		onClick={() => {
																			showTransientActionFeedback('clone');
																			void openDeployDialog(null);
																		}}
																		disabled={!canUseFinalActions || transientAction === 'clone'}
																		className="h-6 gap-1 px-2 text-[11px]"
																	>
																		{transientAction === 'clone'
																			? <Loader2 className="h-3 w-3 animate-spin" />
																			: <GitHub className="h-3 w-3" />}
																		{transientAction === 'clone' ? 'Opening...' : 'Clone to GitHub'}
																	</Button>

																	{renderActionAnchor({
																		action: 'download',
																		className: 'h-6 gap-1 px-2 text-[11px]',
																		href: downloadHref,
																		icon: <Download className="h-3 w-3" />,
																		label: 'Download ZIP',
																		onTrack: () => {
																			trackActivation({
																				action: 'download',
																				surface: 'result_panel',
																			});
																		},
																		size: 'xs',
																		variant: 'secondary',
																	})}
																</div>
															: null}
													</div>
												</div>
											: null}
									</CollapsibleContent>
								</Collapsible>

								{showPromptPreview && hasGeneratedPrompt
									? <div class="border-t border-gray-200 dark:border-gray-800">
											<GeneratedPromptPreviewHeader
												copiedPrompt={copiedKind === 'prompt'}
												copyNotice={promptCopyNotice}
												onDismissCopyNotice={dismissPromptCopyNotice}
												onCopyPrompt={() => {
													void copyResultValue('prompt');
												}}
											/>
											<GeneratedPromptPreviewBody prompt={result?.prompt ?? ''} />
										</div>
									: null}
							</div>
						</div>}

				{compact ? submitButton : null}
			</form>
		</div>
	</div>;
}

function CursorIcon({ className }: { className?: string }) {
	return <svg viewBox="0 0 24 24" fill="currentColor" class={className}>
		<path
			d="M22.106 5.68 12.5.135a.998.998 0 0 0-.998 0L1.893 5.68a.84.84 0 0 0-.419.726v11.186c0 .3.16.577.42.727l9.607 5.547a.999.999 0 0 0 .998 0l9.608-5.547a.84.84 0 0 0 .42-.727V6.407a.84.84 0 0 0-.42-.726Zm-.603 1.176-9.275 16.064c-.063.108-.228.064-.228-.061V12.34a.59.59 0 0 0-.295-.51l-9.11-5.26c-.107-.062-.063-.228.062-.228h18.55c.264 0 .428.286.296.514Z"
		/>
	</svg>;
}

function SubmitShortcutHint({ isMac }: { isMac: boolean }) {
	return <span class="ml-1 inline-flex items-center gap-0.5">
		<span
			class="inline-flex h-5 min-w-5 items-center justify-center rounded bg-white px-1 text-[10px] leading-none text-gray-950 dark:bg-gray-900 dark:text-white"
		>
			{(isMac ? '⌘' : '⌃') as string}
		</span>
		<span
			class="inline-flex h-5 min-w-5 items-center justify-center rounded bg-white px-1 text-[10px] leading-none text-gray-950 dark:bg-gray-900 dark:text-white"
		>
			↵
		</span>
	</span>;
}

function StarterCustomizationSection({
	children,
	compact = false,
	onOpenChange,
	open,
	title,
}: {
	children: any;
	compact?: boolean;
	onOpenChange: (open: boolean) => void;
	open: boolean;
	title: string;
}) {
	return <Collapsible open={open} onOpenChange={onOpenChange}>
		<div class={twMerge(compact ? 'pt-1' : 'pt-2')}>
			<CollapsibleTrigger
				className={twMerge(
					'inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-[0.16em] text-gray-400 transition-colors hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300',
					compact && 'text-[10px]',
				)}
			>
				{title}
				<ChevronDown
					className={twMerge('h-3 w-3 transition-transform duration-200', open && 'rotate-180')}
				/>
			</CollapsibleTrigger>
			<CollapsibleContent>
				{open ? children : null}
			</CollapsibleContent>
		</div>
	</Collapsible>;
}
