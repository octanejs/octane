import * as React from 'react';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { Check, Copy, Sparkles, X } from 'lucide-react';
import { twMerge } from 'tailwind-merge';
import {
	getApplicationStarterConflictingPartnerIds,
	type ApplicationStarterPartnerSuggestion,
	PartnerImage,
} from '~/utils/partners';
import { Button } from '~/ui';
import {
	colorWithAlpha,
	isPinnedStarterLibrary,
	type StarterTryLibrary,
	starterTryLibraries,
	type StarterPalette,
	type StarterPartnerButtonStyle,
} from './shared';
import type { LibraryId } from '~/libraries';

export function StarterChipButton({
	className,
	children,
	compact = false,
	disabled = false,
	onClick,
	palette,
	selected,
	size = 'default',
}: {
	className?: string;
	children: React.ReactNode;
	compact?: boolean;
	disabled?: boolean;
	onClick?: () => void;
	palette: StarterPalette;
	selected: boolean;
	size?: 'compact' | 'default';
}) {
	return (
		<button
			type="button"
			aria-pressed={selected}
			disabled={disabled}
			onClick={onClick}
			className={twMerge(
				compact
					? 'rounded-lg border-2 px-2.5 py-1.5 text-[12px] font-medium transition-all duration-200'
					: size === 'compact'
						? 'rounded-lg border-2 px-2.5 py-1.5 text-[12px] font-medium transition-all duration-200'
						: 'rounded-lg border-2 px-3 py-1.5 text-[13px] font-medium transition-all duration-200',
				selected
					? twMerge(
							palette.chipSelected,
							'translate-y-[-1px] opacity-100 shadow-[0_4px_12px_rgba(15,23,42,0.08)]',
						)
					: palette.chip,
				disabled && 'cursor-default opacity-70',
				className,
			)}
		>
			{children}
		</button>
	);
}

export function StarterTooltipProvider({ children }: { children: React.ReactNode }) {
	return (
		<TooltipPrimitive.Provider delayDuration={1000} skipDelayDuration={500}>
			{children}
		</TooltipPrimitive.Provider>
	);
}

export function StarterLibraryRows({
	compact = false,
	selectedLibraries,
	toggleLibrary,
}: {
	compact?: boolean;
	selectedLibraries: Array<LibraryId>;
	toggleLibrary: (libraryId: LibraryId) => void;
}) {
	const libraries = [
		...starterTryLibraries.filter((library) => !library.locked),
		...starterTryLibraries.filter((library) => library.locked),
	];

	return (
		<div className="flex flex-wrap gap-1.5">
			{libraries.map((library) => (
				<StarterHoverTooltip key={library.id} content={<StarterLibraryTooltip library={library} />}>
					<StarterLibraryChipButton
						compact={compact}
						library={library}
						onClick={() => {
							if (!isPinnedStarterLibrary(library.id)) {
								toggleLibrary(library.id);
							}
						}}
						selected={library.locked || selectedLibraries.includes(library.id)}
					/>
				</StarterHoverTooltip>
			))}
		</div>
	);
}

const StarterLibraryChipButton = React.forwardRef<
	HTMLButtonElement,
	{
		compact?: boolean;
		library: StarterTryLibrary;
		selected: boolean;
	} & React.ComponentPropsWithoutRef<'button'>
>(function StarterLibraryChipButton({ compact = false, library, selected, ...buttonProps }, ref) {
	const baseClass = compact
		? 'inline-flex items-center rounded-md border-2 px-2 py-1 text-[10px] leading-none transition-all duration-200'
		: 'inline-flex items-center rounded-md border-2 px-2.5 py-1 text-[11px] leading-none transition-all duration-200';
	const selectedClass =
		'translate-y-[-1px] border-current bg-white shadow-[0_4px_12px_rgba(15,23,42,0.08)] dark:bg-gray-950';
	const stateClass =
		library.locked || selected
			? selectedClass
			: 'border-gray-200 hover:border-current/45 dark:border-gray-800';

	return (
		<button
			{...buttonProps}
			ref={ref}
			type="button"
			aria-disabled={library.locked || undefined}
			aria-pressed={selected}
			aria-label={`TanStack ${library.label}`}
			className={twMerge(baseClass, library.textStyle, stateClass, buttonProps.className)}
		>
			<span className="inline-flex items-center gap-1 leading-none font-black uppercase tracking-[-0.03em]">
				{library.locked ? <StarterLockedGlyph className="h-2.5 w-2.5 shrink-0 opacity-80" /> : null}
				{library.label}
			</span>
		</button>
	);
});

function StarterLockedGlyph({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" className={className}>
			<path d="M5.5 6V4.75a2.5 2.5 0 1 1 5 0V6h.75A1.75 1.75 0 0 1 13 7.75v4.5A1.75 1.75 0 0 1 11.25 14h-6.5A1.75 1.75 0 0 1 3 12.25v-4.5A1.75 1.75 0 0 1 4.75 6h.75Zm1.25 0h2.5V4.75a1.25 1.25 0 1 0-2.5 0V6Z" />
		</svg>
	);
}

function StarterLibraryTooltip({ library }: { library: StarterTryLibrary }) {
	return (
		<div className="w-[min(22rem,calc(100vw-1rem))] rounded-xl border border-gray-200 bg-white/95 px-3.5 py-3 text-left shadow-lg shadow-gray-950/10 dark:border-gray-800 dark:bg-gray-950/95">
			<div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.18em] text-gray-400 dark:text-gray-500">
				<Sparkles className="h-3.5 w-3.5" />
				TanStack {library.label}
			</div>
			<div className="mt-2 flex flex-wrap gap-1.5">
				<span className="rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.14em] text-gray-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300">
					{library.locked ? 'Included' : 'Optional'}
				</span>
			</div>
			<div className="mt-2 text-sm leading-5 text-gray-600 dark:text-gray-300">
				{library.description ?? library.tagline}
			</div>
		</div>
	);
}

const StarterPartnerButton = React.forwardRef<
	HTMLButtonElement,
	{
		compact?: boolean;
		palette: StarterPalette;
		partner: ApplicationStarterPartnerSuggestion;
		muted: boolean;
		selected: boolean;
		size?: 'compact' | 'default';
	} & React.ComponentPropsWithoutRef<'button'>
>(function StarterPartnerButton(
	{ compact = false, muted, palette, partner, selected, size = 'default', ...buttonProps },
	ref,
) {
	const accent = partner.brandColor ?? '#64748B';
	const accessibleLabel = partner.label;
	const partnerTag = partner.tags[0];
	const isTierOne = partner.tier === 1;
	const isTierTwo = partner.tier === 2;
	const isTierThree = partner.tier === 3;
	const showsLogoOnly = isTierOne || isTierTwo;
	const usesPaletteSurface = isTierTwo;
	const buttonSizeClass = showsLogoOnly
		? compact
			? 'rounded-xl text-[13px] font-semibold'
			: 'rounded-xl text-sm font-semibold'
		: compact || size === 'compact'
			? 'rounded-lg px-2.5 py-1.5 text-[12px] font-medium'
			: 'rounded-lg px-3 py-1.5 text-[13px] font-medium';
	const logoFrameClass = isTierOne ? 'h-17 min-w-18' : compact ? 'h-11 min-w-16' : 'h-12 min-w-18';
	const logoWidthClass = isTierOne ? 'w-36' : compact || size === 'compact' ? 'w-20' : 'w-22';
	const logoStackAlignmentClass = isTierTwo ? 'items-center' : 'items-start';
	const logoTagClass = isTierTwo ? 'text-center self-center' : '';
	const tierOneTone = isTierOne
		? selected
			? 'translate-y-[-1px] border-transparent'
			: 'border-gray-200 bg-white hover:border-[var(--starter-partner-hover-border-color)] active:border-[var(--starter-partner-active-border-color)] dark:border-gray-800 dark:bg-gray-950 dark:hover:border-[var(--starter-partner-hover-border-color)] dark:active:border-[var(--starter-partner-active-border-color)]'
		: null;
	const tierThreeTone = isTierThree
		? selected
			? 'translate-y-[-1px] border-current bg-white shadow-[0_4px_12px_rgba(15,23,42,0.08)] dark:bg-gray-950'
			: 'border-gray-200 bg-white text-gray-700 hover:border-[var(--starter-partner-hover-border-color)] hover:text-current active:border-[var(--starter-partner-active-border-color)] dark:border-gray-800 dark:bg-gray-950 dark:text-gray-200 dark:hover:border-[var(--starter-partner-hover-border-color)] dark:active:border-[var(--starter-partner-active-border-color)]'
		: null;
	const hoverBorderColor = colorWithAlpha(accent, 0.5) ?? accent;
	const style: StarterPartnerButtonStyle = {
		'--starter-partner-active-border-color': accent,
		'--starter-partner-border-hover': usesPaletteSurface ? hoverBorderColor : undefined,
		'--starter-partner-hover-border-color': hoverBorderColor,
		backgroundColor: undefined,
		borderColor:
			isTierOne && selected ? accent : selected && usesPaletteSurface ? accent : undefined,
		color: isTierThree && selected ? accent : undefined,
		boxShadow: selected
			? usesPaletteSurface
				? undefined
				: `0 6px 16px ${colorWithAlpha(accent, 0.12)}`
			: usesPaletteSurface
				? undefined
				: `0 1px 2px ${colorWithAlpha(accent, 0.08)}`,
	};

	return (
		<button
			{...buttonProps}
			ref={ref}
			type="button"
			aria-pressed={selected}
			aria-label={
				muted
					? `${accessibleLabel}, inactive while another exclusive partner is selected`
					: accessibleLabel
			}
			className={twMerge(
				'inline-flex items-center text-gray-800 transition-all duration-200 dark:text-gray-100',
				'border-2',
				buttonSizeClass,
				selected && 'translate-y-[-1px]',
				showsLogoOnly ? 'justify-start text-left' : 'gap-2 text-left',
				tierOneTone,
				usesPaletteSurface && palette.chip,
				usesPaletteSurface &&
					'hover:border-[var(--starter-partner-border-hover)] active:border-[var(--starter-partner-active-border-color)]',
				tierThreeTone,
				muted &&
					'border-transparent opacity-60 saturate-50 grayscale hover:border-transparent hover:text-gray-700 active:border-transparent dark:border-transparent dark:hover:border-transparent dark:hover:text-gray-200 dark:active:border-transparent',
				buttonProps.className,
			)}
			style={style}
		>
			{showsLogoOnly ? (
				<span
					className={twMerge(
						'flex h-full flex-col px-3 py-1.5',
						logoStackAlignmentClass,
						logoFrameClass,
					)}
				>
					<span className={twMerge('flex flex-1 items-center justify-start', logoWidthClass)}>
						<PartnerImage
							className="block w-full max-h-7 object-contain"
							config={partner.image}
							alt=""
						/>
					</span>
					{partnerTag ? (
						<span
							className={twMerge(
								'mt-auto text-[9px] font-medium tracking-[0.02em] text-gray-400 dark:text-gray-500',
								logoTagClass,
							)}
						>
							{partnerTag}
						</span>
					) : null}
					<span className="sr-only">{accessibleLabel}</span>
				</span>
			) : (
				<span className="flex flex-col items-start gap-px">
					<span>{partner.label}</span>
					{partnerTag ? (
						<span className="text-[9px] font-medium tracking-[0.02em] text-gray-400 dark:text-gray-500">
							{partnerTag}
						</span>
					) : null}
				</span>
			)}
		</button>
	);
});

export function StarterPartnerRows({
	compact = false,
	palette,
	partnerSuggestions,
	selectedPartners,
	size = 'default',
	togglePartner,
}: {
	compact?: boolean;
	palette: StarterPalette;
	partnerSuggestions: Array<ApplicationStarterPartnerSuggestion>;
	selectedPartners: Array<string>;
	size?: 'compact' | 'default';
	togglePartner: (partner: ApplicationStarterPartnerSuggestion, selected: boolean) => void;
}) {
	const mutedPartnerIds = React.useMemo(() => {
		const partnerIds = new Set<string>();

		for (const selectedPartnerId of selectedPartners) {
			const selectedPartner = partnerSuggestions.find(
				(partner) => partner.id === selectedPartnerId,
			);

			if (!selectedPartner) {
				continue;
			}

			for (const partnerId of getApplicationStarterConflictingPartnerIds(
				selectedPartner,
				partnerSuggestions,
			)) {
				partnerIds.add(partnerId);
			}
		}

		for (const selectedPartnerId of selectedPartners) {
			partnerIds.delete(selectedPartnerId);
		}

		return partnerIds;
	}, [partnerSuggestions, selectedPartners]);
	const rows = ([1, 2, 3] as const)
		.map((tier) => ({
			tier,
			partners: partnerSuggestions.filter((partner) => partner.tier === tier),
		}))
		.filter((row) => row.partners.length > 0);

	return (
		<div className="space-y-4.5">
			{rows.map((row) => (
				<div key={row.tier} className="flex flex-wrap gap-1.5">
					{row.partners.map((partner) => {
						const selected = selectedPartners.includes(partner.id);
						const muted = mutedPartnerIds.has(partner.id);

						return (
							<StarterHoverTooltip
								key={partner.id}
								content={<StarterPartnerTooltip partner={partner} />}
							>
								<StarterPartnerButton
									compact={compact}
									onClick={() => togglePartner(partner, selected)}
									muted={muted}
									palette={palette}
									partner={partner}
									selected={selected}
									size={size}
								/>
							</StarterHoverTooltip>
						);
					})}
				</div>
			))}
		</div>
	);
}

function StarterPartnerTooltip({ partner }: { partner: ApplicationStarterPartnerSuggestion }) {
	return (
		<div className="w-[min(22rem,calc(100vw-1rem))] rounded-xl border border-gray-200 bg-white/95 px-3.5 py-3 text-left shadow-lg shadow-gray-950/10 dark:border-gray-800 dark:bg-gray-950/95">
			<div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.18em] text-gray-400 dark:text-gray-500">
				<Sparkles className="h-3.5 w-3.5" />
				{partner.label}
			</div>
			{partner.tags.length > 0 ? (
				<div className="mt-2 flex flex-wrap gap-1.5">
					{partner.tags.map((tag) => (
						<span
							key={tag}
							className="rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.14em] text-gray-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300"
						>
							{tag}
						</span>
					))}
				</div>
			) : null}
			<div className="mt-2 text-sm leading-5 text-gray-600 dark:text-gray-300">
				{partner.description}
			</div>
		</div>
	);
}

function StarterHoverTooltip({
	children,
	content,
}: {
	children: React.ReactElement;
	content: React.ReactNode;
}) {
	return (
		<TooltipPrimitive.Root>
			<TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
			<TooltipPrimitive.Portal>
				<TooltipPrimitive.Content
					side="bottom"
					align="center"
					sideOffset={8}
					className="z-[500] transition-opacity duration-150 data-[state=closed]:opacity-0 data-[state=delayed-open]:opacity-100"
				>
					{content}
				</TooltipPrimitive.Content>
			</TooltipPrimitive.Portal>
		</TooltipPrimitive.Root>
	);
}

export function GeneratedPromptPreviewHeader({
	copiedPrompt = false,
	copyNotice,
	onDismissCopyNotice,
	onCopyPrompt,
	title = 'Prompt Preview',
}: {
	copiedPrompt?: boolean;
	copyNotice?: boolean;
	onDismissCopyNotice?: () => void;
	onCopyPrompt?: () => void;
	title?: string;
}) {
	return (
		<div className="border-b border-gray-200 bg-gray-50/70 px-4 py-3 dark:border-gray-800 dark:bg-gray-900/70">
			<div className="flex items-center justify-between gap-3">
				<div>
					<div className="text-[11px] font-medium uppercase tracking-[0.18em] text-gray-400 dark:text-gray-500">
						{title}
					</div>
				</div>
				<div className="flex items-center gap-2">
					{onCopyPrompt ? (
						<Button variant="secondary" size="sm" type="button" onClick={onCopyPrompt}>
							{copiedPrompt ? (
								<>
									<Check className="h-4 w-4" />
									Copied
								</>
							) : (
								<>
									<Copy className="h-4 w-4" />
									Copy Prompt
								</>
							)}
						</Button>
					) : null}
				</div>
			</div>

			{copyNotice ? (
				<div className="mt-3 flex items-start justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50/80 px-3 py-2.5 dark:border-emerald-900/70 dark:bg-emerald-950/30">
					<div>
						<div className="text-sm font-medium text-emerald-900 dark:text-emerald-200">
							Prompt copied to clipboard
						</div>
						<div className="mt-1 text-[11px] leading-5 text-emerald-800/80 dark:text-emerald-300/80">
							Paste it into your favorite AI or coding agent.
						</div>
					</div>
					{onDismissCopyNotice ? (
						<button
							type="button"
							onClick={onDismissCopyNotice}
							className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-emerald-200/80 text-emerald-800 transition-colors hover:bg-emerald-100 dark:border-emerald-800 dark:text-emerald-300 dark:hover:bg-emerald-900/50"
							aria-label="Dismiss copied prompt notice"
						>
							<X className="h-4 w-4" />
						</button>
					) : null}
				</div>
			) : null}
		</div>
	);
}

export function GeneratedPromptPreviewBody({ prompt }: { prompt: string }) {
	return (
		<div className="px-4 py-4">
			<pre
				className="min-w-0 max-w-full max-h-40 overflow-y-auto !overflow-x-hidden whitespace-pre-wrap break-words !text-gray-700 dark:!text-gray-200 text-xs leading-6"
				style={{ color: 'inherit' }}
			>
				<code
					className="block min-w-0 max-w-full !whitespace-pre-wrap break-words font-sans !text-inherit [word-break:normal]"
					style={{ color: 'inherit' }}
				>
					{prompt}
				</code>
			</pre>
		</div>
	);
}

export function GeneratedPromptPreviewFooter({ children }: { children: React.ReactNode }) {
	return (
		<div className="border-t border-gray-200 bg-gray-50/70 px-4 py-3 dark:border-gray-800 dark:bg-gray-900/70">
			{children}
		</div>
	);
}

export function GeneratedPromptPreviewCard({
	copiedPrompt = false,
	copyNotice,
	footer,
	onDismissCopyNotice,
	onCopyPrompt,
	prompt,
	title = 'Prompt Preview',
}: {
	copiedPrompt?: boolean;
	copyNotice?: boolean;
	footer?: React.ReactNode;
	onDismissCopyNotice?: () => void;
	onCopyPrompt?: () => void;
	prompt: string;
	title?: string;
}) {
	return (
		<div className="overflow-hidden rounded-[1rem] border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-950">
			<GeneratedPromptPreviewHeader
				copiedPrompt={copiedPrompt}
				copyNotice={copyNotice}
				onDismissCopyNotice={onDismissCopyNotice}
				onCopyPrompt={onCopyPrompt}
				title={title}
			/>
			<GeneratedPromptPreviewBody prompt={prompt} />
			{footer ? <GeneratedPromptPreviewFooter>{footer}</GeneratedPromptPreviewFooter> : null}
		</div>
	);
}
