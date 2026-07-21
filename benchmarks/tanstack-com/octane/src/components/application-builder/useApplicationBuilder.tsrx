import { useCallback, useEffect, useMemo, useRef, useState } from 'octane';
import { useDebouncedValue } from '@octanejs/tanstack-pacer';
import { useToast } from '~/components/ToastProvider.tsrx';
import {
	trackEvent,
	defaultBuilderSessionContext,
	type BuilderAction,
	type BuilderSessionContext,
} from '~/utils/analytics';
import {
	extractMigrationRepositoryUrl,
	getApplicationStarterSuggestions,
	resolveApplicationStarterDeterministically,
	type ApplicationStarterContext,
	type ApplicationStarterResult,
} from '~/utils/application-starter';
import {
	getApplicationStarterCompatiblePartnerIds,
	getApplicationStarterConflictingPartnerIds,
	getApplicationStarterInferredPartnerIds,
	getApplicationStarterPartnerSuggestions,
	getApplicationStarterSelectedPartnerIds,
	getApplicationStarterVisiblePartnerSuggestions,
	type ApplicationStarterPartnerSuggestion,
} from '~/utils/partners.tsrx';
import { usePartnerPlacementContext } from '~/utils/usePartnerPlacementContext';
import type { LibraryId } from '~/libraries';
import {
	buildStarterPromptDeployUrl,
	composeStarterInput,
	isNextJsMigrationInput,
	isPinnedStarterLibrary,
	isValidMigrationRepositoryUrl,
	normalizeMigrationRepositoryUrl,
	type StarterPackageManager,
	starterAddonLibraryIds,
	starterLoadingPhrases,
	starterPinnedLibraryIds,
	type StarterToolchain,
	type ApplicationStarterBuilderIntegration,
	type StarterDeployProvider,
} from './shared';

interface UseApplicationBuilderOptions {
	builderIntegration?: ApplicationStarterBuilderIntegration;
	context: ApplicationStarterContext;
	forceRouterOnly?: boolean;
	mode: 'compact' | 'full';
	onDirtyStateChange?: (dirty: boolean) => void;
	onResolvedResult?: (result: ApplicationStarterResult | null) => void;
	revealOptionsImmediately?: boolean;
	suggestionContext?: ApplicationStarterContext;
}

type CopyTrigger = 'automatic' | 'user';

function openPendingDeployWindow(providerName: string) {
	const deployWindow = window.open('', '_blank');

	if (deployWindow) {
		deployWindow.opener = null;
		deployWindow.document.title = `Opening ${providerName}`;
		deployWindow.document.body.textContent = `Opening ${providerName}...`;
	}

	return deployWindow;
}

function navigatePendingDeployWindow(deployWindow: Window | null, deployUrl: string) {
	if (deployWindow) {
		deployWindow.location.href = deployUrl;
		deployWindow.focus();
		return;
	}

	window.location.assign(deployUrl);
}

function closePendingDeployWindow(deployWindow: Window | null) {
	deployWindow?.close();
}

export function useApplicationBuilder({
	builderIntegration,
	context,
	forceRouterOnly = false,
	onDirtyStateChange,
	onResolvedResult,
	revealOptionsImmediately = false,
	suggestionContext = context,
}: UseApplicationBuilderOptions) {
	const { notify } = useToast();
	const suggestions = getApplicationStarterSuggestions(suggestionContext);
	const partnerPlacementContext = usePartnerPlacementContext({
		orderStrategy: 'tier-rotated',
		surface: 'application_starter_suggestions',
	});
	const partnerSuggestions = useMemo(
		() => getApplicationStarterPartnerSuggestions(partnerPlacementContext),
		[partnerPlacementContext],
	);
	const [input, setInput] = useState(() => suggestions[0]?.input ?? '');
	const [hasRevealedOptions, setHasRevealedOptions] = useState(revealOptionsImmediately);
	const [result, setResult] = useState<ApplicationStarterResult | null>(null);
	const [copiedKind, setCopiedKind] = useState<string | null>(null);
	const [showPromptCopyNotice, setShowPromptCopyNotice] = useState(false);
	const [loadingPhrase, setLoadingPhrase] = useState(starterLoadingPhrases[0]!);
	const [deployDialogProvider, setDeployDialogProvider] = useState<StarterDeployProvider | null>(
		null,
	);
	const [isDeployDialogOpen, setIsDeployDialogOpen] = useState(false);
	const [isDirtySinceLastResult, setIsDirtySinceLastResult] = useState(false);
	const [isRebuildingResult, setIsRebuildingResult] = useState(false);
	const [isModHeld, setIsModHeld] = useState(false);
	const [migrationRepositoryUrl, setMigrationRepositoryUrl] = useState(
		() => extractMigrationRepositoryUrl(suggestions[0]?.input ?? '') ?? '',
	);
	const [debouncedInput] = useDebouncedValue(input, { wait: 300 });
	const [debouncedMigrationRepositoryUrl] = useDebouncedValue(migrationRepositoryUrl, {
		wait: 300,
	});
	const [explicitLibrarySelections, setExplicitLibrarySelections] = useState<
		Partial<Record<LibraryId, boolean>>
	>({});
	const [explicitPartnerSelections, setExplicitPartnerSelections] = useState<
		Record<string, boolean>
	>({});
	const [selectedPackageManager, setSelectedPackageManager] = useState<
		StarterPackageManager | undefined
	>(undefined);
	const [selectedToolchain, setSelectedToolchain] = useState<StarterToolchain | undefined>(
		undefined,
	);
	const latestRequestIdRef = useRef(0);
	const hasUserEditedStarterRef = useRef(false);
	const migrationRepositoryInputRef = useRef<HTMLInputElement | null>(null);
	const explicitlySelectedPartners = useMemo(
		() => partnerSuggestions.flatMap(
			(partner) => explicitPartnerSelections[partner.id] === true ? [partner.id] : [],
		),
		[explicitPartnerSelections, partnerSuggestions],
	);
	const selectedPartners = useMemo(
		() => getApplicationStarterCompatiblePartnerIds(explicitlySelectedPartners, partnerSuggestions),
		[explicitlySelectedPartners, partnerSuggestions],
	);
	const visiblePartnerSuggestions = useMemo(
		() => getApplicationStarterVisiblePartnerSuggestions(partnerSuggestions, selectedPartners),
		[partnerSuggestions, selectedPartners],
	);
	const explicitlySelectedLibraries = useMemo(
		() => starterAddonLibraryIds.flatMap(
			(libraryId) => explicitLibrarySelections[libraryId] === true ? [libraryId] : [],
		),
		[explicitLibrarySelections],
	);
	const selectedLibraries = useMemo<Array<LibraryId>>(
		() => [...starterPinnedLibraryIds, ...explicitlySelectedLibraries],
		[explicitlySelectedLibraries],
	);
	// Session context (mode_used, idea_used) is stamped on every builder
	// event so any breakdown works without joining sessions in BigQuery.
	// Stored in a ref because mutations don't need to trigger re-renders.
	const sessionContextRef = useRef<BuilderSessionContext>(defaultBuilderSessionContext);

	const setSessionIdea = useCallback((label: string) => {
		sessionContextRef.current = {
			...sessionContextRef.current,
			idea_used: label,
		};
	}, []);

	const invalidateResult = useCallback((options?: { clearResult?: boolean }) => {
		latestRequestIdRef.current += 1;

		if (result) {
			setIsDirtySinceLastResult(true);
		}

		if (options?.clearResult ?? true) {
			setResult(null);
			onResolvedResult?.(null);
		}

		setShowPromptCopyNotice(false);
	}, [onResolvedResult, result]);

	const markUserEditedStarter = useCallback(() => {
		hasUserEditedStarterRef.current = true;
	}, []);

	const markInputDirty = useCallback(() => {
		markUserEditedStarter();
		invalidateResult({ clearResult: false });
	}, [invalidateResult, markUserEditedStarter]);

	useEffect(() => {
		if (revealOptionsImmediately) {
			setHasRevealedOptions(true);
		}
	}, [revealOptionsImmediately]);

	useEffect(() => {
		onDirtyStateChange?.(isDirtySinceLastResult);
	}, [isDirtySinceLastResult, onDirtyStateChange]);

	const normalizedMigrationRepositoryUrl = normalizeMigrationRepositoryUrl(migrationRepositoryUrl);
	const showMigrationRepositoryInput =
		isNextJsMigrationInput(input) || normalizedMigrationRepositoryUrl.length > 0;
	const hasMigrationRepositoryUrlError =
		normalizedMigrationRepositoryUrl.length > 0 &&
			!isValidMigrationRepositoryUrl(normalizedMigrationRepositoryUrl);

	useEffect(() => {
		if (!showMigrationRepositoryInput) {
			return;
		}

		const timeout = window.setTimeout(() => {
			migrationRepositoryInputRef.current?.focus();
		}, 0);

		return () => {
			window.clearTimeout(timeout);
		};
	}, [showMigrationRepositoryInput]);

	const buildSubmittedInput = useCallback(
		(
			nextSelectedPartners: Array<string> = explicitlySelectedPartners,
			nextInferredPartners: Array<string> = [],
			nextSelectedLibraries: Array<LibraryId> = selectedLibraries,
		) => composeStarterInput({
			forceRouterOnly,
			inferredPartners: nextInferredPartners,
			input,
			migrationRepositoryUrl,
			packageManager: selectedPackageManager,
			selectedLibraries: nextSelectedLibraries,
			selectedPartners: nextSelectedPartners,
			toolchain: selectedToolchain,
		}),
		[
			explicitlySelectedPartners,
			forceRouterOnly,
			input,
			migrationRepositoryUrl,
			selectedPackageManager,
			selectedLibraries,
			selectedToolchain,
		],
	);

	const buildDebouncedSubmittedInput = useCallback(
		(
			nextSelectedPartners: Array<string> = explicitlySelectedPartners,
			nextInferredPartners: Array<string> = [],
			nextSelectedLibraries: Array<LibraryId> = selectedLibraries,
		) => composeStarterInput({
			forceRouterOnly,
			inferredPartners: nextInferredPartners,
			input: debouncedInput,
			migrationRepositoryUrl: debouncedMigrationRepositoryUrl,
			packageManager: selectedPackageManager,
			selectedLibraries: nextSelectedLibraries,
			selectedPartners: nextSelectedPartners,
			toolchain: selectedToolchain,
		}),
		[
			debouncedInput,
			debouncedMigrationRepositoryUrl,
			explicitlySelectedPartners,
			forceRouterOnly,
			selectedPackageManager,
			selectedLibraries,
			selectedToolchain,
		],
	);

	const toggleLibrary = useCallback((libraryId: LibraryId) => {
		if (isPinnedStarterLibrary(libraryId)) {
			return;
		}

		markUserEditedStarter();
		invalidateResult();
		const selected = selectedLibraries.includes(libraryId);

		setExplicitLibrarySelections(
			(current) => ({
				...current,
				[libraryId]: !selected,
			}),
		);
	}, [invalidateResult, markUserEditedStarter, selectedLibraries]);

	const togglePartner = useCallback((
		partner: ApplicationStarterPartnerSuggestion,
		selected: boolean,
	) => {
		markUserEditedStarter();
		invalidateResult();
		setExplicitPartnerSelections((current) => {
			const nextSelected = !selected;
			const next = {
				...current,
				[partner.id]: nextSelected,
			};

			if (nextSelected) {
				for (const partnerId of getApplicationStarterConflictingPartnerIds(
					partner,
					partnerSuggestions,
				)) {
					next[partnerId] = false;
				}
			}

			return next;
		});
	}, [invalidateResult, markUserEditedStarter, partnerSuggestions]);

	const togglePackageManager = useCallback((packageManager: StarterPackageManager) => {
		markUserEditedStarter();
		invalidateResult();

		setSelectedPackageManager((current) => current === packageManager ? undefined : packageManager);
	}, [invalidateResult, markUserEditedStarter]);

	const toggleToolchain = useCallback((toolchain: StarterToolchain) => {
		markUserEditedStarter();
		invalidateResult();

		setSelectedToolchain((current) => (current === toolchain ? undefined : toolchain));
	}, [invalidateResult, markUserEditedStarter]);

	const dismissPromptCopyNotice = useCallback(() => {
		setShowPromptCopyNotice(false);
	}, []);

	const revealPromptCopyNotice = useCallback(() => {
		setShowPromptCopyNotice(true);
	}, []);

	const markCopied = useCallback((
		kind: string,
		options?: { showPromptNotice?: boolean; trigger?: CopyTrigger },
	) => {
		setCopiedKind(kind);
		setTimeout(() => setCopiedKind((current) => (current === kind ? null : current)), 1800);

		if (kind === 'prompt' && options?.showPromptNotice) {
			revealPromptCopyNotice();
		}

		// Only treat user-driven copies as activation. Automatic copies that
		// fire as a side-effect of generation are not activation signals.
		const trigger = options?.trigger ?? 'user';
		if (trigger === 'user' && kind === 'prompt') {
			trackEvent('builder_activated', {
				...sessionContextRef.current,
				action: 'copy_prompt',
				surface: 'result_panel',
				automatic: false,
			});
		}
	}, [revealPromptCopyNotice]);

	const handleCopy = useCallback(async (
		value: string,
		kind: string,
		options?: {
			notify?: boolean;
			showPromptNotice?: boolean;
			trigger?: CopyTrigger;
		},
	) => {
		await navigator.clipboard.writeText(value);
		markCopied(kind, {
			showPromptNotice: options?.showPromptNotice,
			trigger: options?.trigger,
		});

		if (options?.notify === false) {
			return;
		}

		notify(
			<div>
				<div class="font-medium">
					Copied
					{kind as string}
				</div>
				<div class="text-xs text-gray-500 dark:text-gray-400">
					Paste it into your AI tool or terminal.
				</div>
			</div>,
		);
	}, [markCopied, notify]);

	const applyResolvedResultState = useCallback((nextResult: ApplicationStarterResult) => {
		setIsDirtySinceLastResult(false);
		setResult(nextResult);
		onResolvedResult?.(nextResult);
	}, [onResolvedResult]);

	const resolveSubmittedInput = useCallback(async (
		submittedInput: string,
		options?: { applyBuilder?: boolean; silentBuilder?: boolean },
	) => {
		const trimmed = submittedInput.trim();
		if (!trimmed) {
			return null;
		}

		const requestId = latestRequestIdRef.current + 1;
		latestRequestIdRef.current = requestId;
		const phraseIndex = Math.floor(Math.random() * starterLoadingPhrases.length);
		setLoadingPhrase(starterLoadingPhrases[phraseIndex]!);
		setIsRebuildingResult(true);

		try {
			const nextResult = await resolveApplicationStarterDeterministically({
				context,
				input: trimmed,
			});

			if (requestId !== latestRequestIdRef.current) {
				return null;
			}

			applyResolvedResultState(nextResult);

			if (options?.applyBuilder && builderIntegration) {
				await builderIntegration.applyResult(nextResult, {
					silent: options.silentBuilder,
				});
			}

			return nextResult;
		} catch (error) {
			if (requestId === latestRequestIdRef.current) {
				notify(
					<div>
						<div class="font-medium">Could not rebuild the prompt</div>
						<div class="text-xs text-gray-500 dark:text-gray-400">{(error instanceof Error
							? error.message
							: 'Please try again.') as string}</div>
					</div>,
				);

				trackEvent('builder_failed', {
					...sessionContextRef.current,
					stage: 'generation',
					error_message: error instanceof Error ? error.message : 'unknown_error',
				});
			}

			return null;
		} finally {
			if (requestId === latestRequestIdRef.current) {
				setIsRebuildingResult(false);
			}
		}
	}, [applyResolvedResultState, builderIntegration, context, notify]);

	const trackGeneratedResult = useCallback((
		nextResult: ApplicationStarterResult,
		submittedInput: string,
	) => {
		const selectedPartnerIds = getApplicationStarterSelectedPartnerIds(submittedInput);
		const inferredPartnerIds = getApplicationStarterInferredPartnerIds(submittedInput);
		const finalPartnerIds = [...new Set([...selectedPartnerIds, ...inferredPartnerIds])];
		const finalFeatureIds = [
			...new Set([
				...nextResult.recipe.features,
				nextResult.recipe.deployment,
				nextResult.recipe.toolchain,
			].filter((feature): feature is string => !!feature)),
		];
		const promptText = `${nextResult.prompt}\n${nextResult.cliCommand}`.toLowerCase();
		const finalPromptFeatureIds = finalFeatureIds.filter(
			(featureId) => promptText.includes(featureId.toLowerCase()),
		);

		trackEvent('builder_generated', {
			...sessionContextRef.current,
			final_deployment: nextResult.recipe.deployment,
			final_package_manager: nextResult.recipe.packageManager,
			final_library_count: selectedLibraries.length,
			final_partner_count: finalPartnerIds.length,
			final_addon_count: finalPromptFeatureIds.length,
			// Joined arrays - use SPLIT() in BigQuery for top-N reporting.
			library_ids: selectedLibraries.join(','),
			partner_ids: finalPartnerIds.join(','),
			addon_ids: finalPromptFeatureIds.join(','),
		});
	}, [selectedLibraries]);

	useEffect(() => {
		if (!hasRevealedOptions) {
			return;
		}

		const submittedInput = buildDebouncedSubmittedInput();

		if (!submittedInput.trim()) {
			return;
		}

		void resolveSubmittedInput(submittedInput, {
			applyBuilder: hasUserEditedStarterRef.current,
			silentBuilder: true,
		});
	}, [buildDebouncedSubmittedInput, hasRevealedOptions, resolveSubmittedInput]);

	const selectSuggestion = useCallback(async ({
		suggestion,
	}: {
		suggestion: { input: string; label: string };
	}) => {
		markInputDirty();
		setInput(suggestion.input);

		if (!isNextJsMigrationInput(suggestion.input)) {
			setMigrationRepositoryUrl('');
		}

		// Stamp the idea on subsequent builder events so any downstream
		// outcome (analyzed/generated/activated) carries this attribution.
		setSessionIdea(suggestion.label);
	}, [markInputDirty, setSessionIdea]);

	const ensureResolvedResult = useCallback(async () => {
		const submittedInput = buildSubmittedInput();

		if (!submittedInput.trim()) {
			return null;
		}

		if (result && !isDirtySinceLastResult) {
			return result;
		}

		return resolveSubmittedInput(submittedInput);
	}, [buildSubmittedInput, isDirtySinceLastResult, resolveSubmittedInput, result]);

	const copyResultValue = useCallback(async (kind: 'command' | 'prompt') => {
		const nextResult = await ensureResolvedResult();

		if (!nextResult) {
			return;
		}

		await handleCopy(
			kind === 'prompt' ? nextResult.prompt : nextResult.cliCommand,
			kind,
			kind === 'prompt'
				? {
						notify: false,
					}
				: undefined,
		);
	}, [ensureResolvedResult, handleCopy]);

	// Generic activation tracker used both inside the hook and passed to the
	// DeployDialog so dialog actions carry the same session context as
	// result-panel actions.
	const trackActivation = useCallback((params: {
		action: BuilderAction;
		surface: 'result_panel' | 'deploy_dialog';
		provider?: string;
		automatic?: boolean;
	}) => {
		trackEvent('builder_activated', {
			...sessionContextRef.current,
			action: params.action,
			surface: params.surface,
			provider: params.provider,
			automatic: params.automatic ?? false,
		});
	}, []);

	const trackAction = useCallback((
		action: BuilderAction,
		provider?: StarterDeployProvider | null,
	) => {
		trackActivation({
			action,
			surface: 'result_panel',
			provider: provider ?? undefined,
		});
	}, [trackActivation]);

	const withResolvedResult = useCallback(async (
		run: (nextResult: ApplicationStarterResult) => void | Promise<void>,
	) => {
		const nextResult = await ensureResolvedResult();

		if (!nextResult) {
			return null;
		}

		return run(nextResult);
	}, [ensureResolvedResult]);

	const withResolvedPrompt = useCallback(async (
		run: (nextResult: ApplicationStarterResult) => void | Promise<void>,
	) => {
		return withResolvedResult(async (nextResult) => {
			if (!nextResult.prompt) {
				return;
			}

			return run(nextResult);
		});
	}, [withResolvedResult]);

	const navigateToResult = useCallback(async (kind: 'advanced' | 'download') => {
		await withResolvedResult((nextResult) => {
			trackAction(kind === 'advanced' ? 'open_advanced' : 'download');

			if (kind === 'download' && builderIntegration?.downloadResult) {
				return builderIntegration.downloadResult(nextResult);
			}

			const destination =
				kind === 'download' ? nextResult.downloadUrl : nextResult.advancedBuilderUrl;

			if (!destination) {
				return;
			}

			window.location.assign(destination);
		});
	}, [builderIntegration, trackAction, withResolvedResult]);

	const openDeployDialog = useCallback(async (provider: StarterDeployProvider | null) => {
		await withResolvedResult((nextResult) => {
			if (nextResult.recipe.target !== 'start') {
				return;
			}

			trackAction(provider ? 'deploy' : 'clone_repo', provider);
			setDeployDialogProvider(provider);
			setIsDeployDialogOpen(true);
		});
	}, [trackAction, withResolvedResult]);

	const openNetlifyStart = useCallback(async () => {
		const deployWindow = openPendingDeployWindow('Netlify');
		let openedDeployUrl = false;
		const netlifyPartner = partnerSuggestions.find((partner) => partner.id === 'netlify');
		const netlifyConflictIds =
			netlifyPartner
				? getApplicationStarterConflictingPartnerIds(netlifyPartner, partnerSuggestions)
				: ['cloudflare'];
		const nextSelectedPartners = explicitlySelectedPartners.filter(
			(partnerId) => !netlifyConflictIds.includes(partnerId),
		);
		const removedConflictingPartner =
			nextSelectedPartners.length !== explicitlySelectedPartners.length;

		if (removedConflictingPartner) {
			setExplicitPartnerSelections((current) => {
				const next = { ...current };

				for (const partnerId of netlifyConflictIds) {
					next[partnerId] = false;
				}

				return next;
			});
			invalidateResult();
		}

		const nextSelectedLibraries = selectedLibraries;
		const submittedInput = buildSubmittedInput(nextSelectedPartners, [], nextSelectedLibraries);

		try {
			if (!submittedInput.trim()) {
				return;
			}

			const nextResult =
				!removedConflictingPartner && result && !isDirtySinceLastResult
					? result
					: await resolveSubmittedInput(submittedInput);

			if (!nextResult?.prompt) {
				return;
			}

			trackEvent('builder_activated', {
				...sessionContextRef.current,
				action: 'netlify_start',
				surface: 'result_panel',
				provider: 'netlify',
				automatic: false,
			});

			openedDeployUrl = true;
			navigatePendingDeployWindow(
				deployWindow,
				buildStarterPromptDeployUrl('netlify', nextResult.prompt),
			);
		} finally {
			if (!openedDeployUrl) {
				closePendingDeployWindow(deployWindow);
			}
		}
	}, [
		buildSubmittedInput,
		explicitlySelectedPartners,
		invalidateResult,
		isDirtySinceLastResult,
		partnerSuggestions,
		result,
		resolveSubmittedInput,
		selectedLibraries,
	]);

	const openLovableStart = useCallback(async () => {
		const deployWindow = openPendingDeployWindow('Lovable');
		let openedDeployUrl = false;

		try {
			await withResolvedPrompt((nextResult) => {
				trackActivation({
					action: 'deploy',
					surface: 'result_panel',
					provider: 'lovable',
				});

				openedDeployUrl = true;
				navigatePendingDeployWindow(
					deployWindow,
					buildStarterPromptDeployUrl('lovable', nextResult.prompt),
				);
			});
		} finally {
			if (!openedDeployUrl) {
				closePendingDeployWindow(deployWindow);
			}
		}
	}, [trackActivation, withResolvedPrompt]);

	const openCodexStart = useCallback(async () => {
		await withResolvedPrompt((nextResult) => {
			trackAction('open_codex');
			window.location.assign(`codex://new?prompt=${encodeURIComponent(nextResult.prompt)}`);
		});
	}, [trackAction, withResolvedPrompt]);

	const openClaudeStart = useCallback(async () => {
		await withResolvedPrompt((nextResult) => {
			trackAction('open_claude');
			window.open(
				`https://claude.ai/code?q=${encodeURIComponent(nextResult.prompt)}`,
				'_blank',
				'noopener,noreferrer',
			);
		});
	}, [trackAction, withResolvedPrompt]);

	const openCursorStart = useCallback(async () => {
		await withResolvedPrompt((nextResult) => {
			trackAction('open_cursor');
			window.open(
				`cursor://anysphere.cursor-deeplink/prompt?text=${encodeURIComponent(nextResult.prompt)}`,
				'_blank',
				'noopener,noreferrer',
			);
		});
	}, [trackAction, withResolvedPrompt]);

	const generatePrompt = useCallback(async () => {
		const submittedInput = buildSubmittedInput();
		const nextResult =
			result && !isDirtySinceLastResult ? result : await resolveSubmittedInput(submittedInput);

		if (!nextResult) {
			return;
		}

		trackGeneratedResult(nextResult, submittedInput);

		if (builderIntegration) {
			const applied = await builderIntegration.applyResult(nextResult, {
				silent: false,
			});

			if (applied) {
				notify(
					<div>
						<div class="font-medium">Builder configured</div>
						<div class="text-xs text-gray-500 dark:text-gray-400">
							The prompt was applied to the builder immediately.
						</div>
					</div>,
				);
			}
		}

		await handleCopy(nextResult.prompt, 'prompt', {
			notify: false,
			showPromptNotice: true,
		});
	}, [
		buildSubmittedInput,
		builderIntegration,
		handleCopy,
		isDirtySinceLastResult,
		notify,
		resolveSubmittedInput,
		result,
		trackGeneratedResult,
	]);

	const hasInput = buildSubmittedInput().trim().length > 0;
	const hasGeneratedPrompt = !!result?.prompt;
	const isGeneratingPrompt = isRebuildingResult;
	const isGeneratingNetlify = false;
	const isGenerating = isRebuildingResult;

	const updateInput = useCallback((value: string) => {
		markInputDirty();
		setInput(value);
	}, [markInputDirty]);

	const updateMigrationRepositoryUrl = useCallback((value: string) => {
		markUserEditedStarter();
		invalidateResult();
		setMigrationRepositoryUrl(value);
	}, [invalidateResult, markUserEditedStarter]);

	const submitCurrentInput = useCallback(async () => {
		if (!input.trim()) {
			return;
		}

		setHasRevealedOptions(true);
	}, [input]);

	return {
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
		isGeneratingNetlify,
		isGeneratingPrompt,
		isModHeld,
		loadingPhrase,
		migrationRepositoryInputRef,
		migrationRepositoryUrl,
		navigateToResult,
		openClaudeStart,
		openCursorStart,
		openCodexStart,
		openDeployDialog,
		openLovableStart,
		openNetlifyStart,
		partnerSuggestions: visiblePartnerSuggestions,
		promptCopyNotice: showPromptCopyNotice,
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
	};
}
