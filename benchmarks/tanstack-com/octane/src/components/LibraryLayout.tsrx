import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
} from 'octane';
import { ChevronLeft, ChevronRight, Menu, X } from '@octanejs/lucide';
import { GithubIcon } from '~/components/icons/GithubIcon.tsrx';
import { DiscordIcon } from '~/components/icons/DiscordIcon.tsrx';
import { Link, useMatches, useParams } from '@octanejs/tanstack-router';
import { useLocalStorage } from '~/utils/useLocalStorage';
import { useMediaQuery } from '~/utils/useMediaQuery';
import { useClickOutside } from '~/hooks/useClickOutside';
import { last } from '~/utils/utils';
import type { ConfigSchema, MenuItem } from '~/utils/config';
import { getActiveDocsNavTabId, getTabbedMenuConfig } from '~/utils/docsNavTabs';
import { type Framework, type LibraryId } from '~/libraries';
import { frameworkOptions } from '~/libraries/frameworks';
import { twMerge } from 'tailwind-merge';
import {
	partners,
	PartnerImage,
	partnerTiers,
	type Partner,
	type PartnerTier,
} from '~/utils/partners.tsrx';
import {
	getPartnerPlacementAnalyticsMetadata,
	getPartnerTierGroupsForPlacement,
	type PartnerPlacementContext,
} from '~/utils/partner-placement';
import { usePartnerPlacementContext } from '~/utils/usePartnerPlacementContext';
import { Footer } from './Footer.tsrx';
import { RecentPostsWidget } from './RecentPostsWidget.tsrx';
import { SearchButton } from './SearchButton.tsrx';
import { FrameworkSelect, useCurrentFramework } from './FrameworkSelect.tsrx';
import { VersionSelect } from './VersionSelect.tsrx';
import { Card } from './Card.tsrx';
import { PartnersRail, RightRail } from './RightRail.tsrx';
import { trackEvent, useTrackedImpression } from '~/utils/analytics';

// Number of days a doc page is flagged as "New"/"Updated" in the sidebar.
const RECENCY_WINDOW_DAYS = 7;
const RECENCY_WINDOW_MS = RECENCY_WINDOW_DAYS * 24 * 60 * 60 * 1000;
const docsPartnerTierWeights: Record<PartnerTier, number> = {
	gold: 3,
	silver: 2,
	bronze: 1,
};

type DocRecency = 'new' | 'updated' | null;
type DocsPartner = {
	category: Partner['category'];
	score: Partner['score'];
	tier?: Partner['tier'];
	id: string;
	name: string;
	href: string;
	image: Parameters<typeof PartnerImage>[0]['config'];
};
type DocsPartnerTierGroup = {
	tier: PartnerTier;
	partners: Array<DocsPartner>;
};
type DocsPartnerScrollSlot = {
	partner: DocsPartner;
	slotIndex: number;
};

// Determine whether a doc page should show a recency pill, based on the
// maintainer-supplied `addedAt` / `updatedAt` dates in the repo's docs/config.json.
// "New" (added) takes priority over "Updated" (edited) when both are recent.
function getDocRecency(addedAt?: string, updatedAt?: string): DocRecency {
	const now = Date.now();

	const isRecent = (iso?: string) => {
		if (!iso) return false;
		const time = new Date(iso).getTime();
		if (Number.isNaN(time)) return false;
		const age = now - time;
		// Reject future dates; only flag within the window.
		return age >= 0 && age <= RECENCY_WINDOW_MS;
	};

	if (isRecent(addedAt)) return 'new';
	if (isRecent(updatedAt)) return 'updated';
	return null;
}

function DocRecencyPill({ recency, date }: { recency: Exclude<DocRecency, null>; date?: string }) {
	const isNew = recency === 'new';
	const label = isNew ? 'New' : 'Updated';

	let title: string | undefined;
	if (date) {
		// Parse date-only strings (YYYY-MM-DD) as local time so the tooltip doesn't
		// drift to the previous day in negative-UTC timezones (new Date('2026-06-01')
		// is UTC midnight, which toLocaleDateString would render as the prior day).
		const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
		const parsed = dateOnly
			? new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]))
			: new Date(date);
		if (!Number.isNaN(parsed.getTime())) {
			title = `${isNew ? 'Added' : 'Updated'} ${parsed.toLocaleDateString()}`;
		}
	}

	return <span
		title={title}
		class={twMerge(
			'shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide leading-none',
			isNew
				? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
				: 'bg-sky-500/15 text-sky-600 dark:text-sky-400',
		)}
	>{label}</span>;
}

function DocsPartnerSlot({
	orderPlacementContext,
	partners,
}: {
	orderPlacementContext: PartnerPlacementContext;
	partners: Array<DocsPartner>;
}) {
	const tierGroups = useMemo(
		() => getPartnerTierGroupsForPlacement(partners, orderPlacementContext),
		[partners, orderPlacementContext],
	);
	const activeSlot = useDocsPartnerScrollSlot(tierGroups);
	const { displayedSlot, flipState } = useFlippingDocsPartnerSlot(activeSlot);

	if (!displayedSlot) {
		return null;
	}

	return <div
		class="docs-partner-slot ml-auto flex shrink-0 items-stretch border-l border-gray-500/20 pl-2 pr-3 md:hidden"
	>
		<DocsPartnerSlotLink
			key={`${displayedSlot.partner.id}:${displayedSlot.slotIndex}`}
			flipState={flipState}
			orderPlacementContext={orderPlacementContext}
			partner={displayedSlot.partner}
			slotIndex={displayedSlot.slotIndex}
		/>
	</div>;
}

function DocsPartnerSlotLink({
	flipState,
	orderPlacementContext,
	partner,
	slotIndex,
}: {
	flipState: DocsPartnerFlipState;
	orderPlacementContext: PartnerPlacementContext;
	partner: DocsPartner;
	slotIndex: number;
}) {
	const analyticsMetadata = getPartnerPlacementAnalyticsMetadata(partner, orderPlacementContext);
	const ref = useTrackedImpression<'partner_viewed', HTMLAnchorElement>({
		event: 'partner_viewed',
		props: {
			partner_id: partner.id,
			placement: 'docs_strip',
			...analyticsMetadata,
			slot_index: slotIndex,
		},
	});
	const compactImageConfig = getCompactPartnerImageConfig(partner.image);

	const onClick = () => {
		let destinationHost: string | undefined;
		try {
			destinationHost = new URL(partner.href).host;
		} catch {
			// Bad/relative href — track without host rather than dropping.
		}
		trackEvent('partner_clicked', {
			partner_id: partner.id,
			placement: 'docs_strip',
			destination: 'external',
			destination_host: destinationHost,
			...analyticsMetadata,
			slot_index: slotIndex,
		});
	};

	return <a
		ref={ref}
		href={partner.href}
		target="_blank"
		rel="noreferrer"
		aria-label={`${partner.name} partner`}
		class={twMerge(
			'docs-partner-slot-link flex h-full shrink-0 items-center justify-center opacity-80 hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-current',
		)}
		data-flip-state={flipState}
		onClick={onClick}
	>
		<div
			class="flex h-5 max-w-full shrink items-center justify-center [&>div]:!w-auto [&>div]:h-full [&>div]:max-w-full [&_img]:h-full [&_img]:max-w-full [&_img]:w-auto"
		>
			<PartnerImage
				className="h-full w-auto object-contain"
				config={compactImageConfig}
				alt={partner.name}
			/>
		</div>
	</a>;
}

function useDocsPartnerScrollSlot(tierGroups: Array<DocsPartnerTierGroup>) {
	const [slot, setSlot] = useState(() => getDocsPartnerScrollSlot(tierGroups, 0));

	useEffect(() => {
		let animationFrame: number | undefined;

		const update = () => {
			animationFrame = undefined;
			const nextSlot = getDocsPartnerScrollSlot(tierGroups, getPageScrollProgress());
			setSlot(
				(previousSlot) => areDocsPartnerSlotsEqual(previousSlot, nextSlot)
					? previousSlot
					: nextSlot,
			);
		};

		const requestUpdate = () => {
			if (animationFrame !== undefined) {
				return;
			}
			animationFrame = window.requestAnimationFrame(update);
		};

		update();
		window.addEventListener('scroll', requestUpdate, { passive: true });
		window.addEventListener('resize', requestUpdate);

		let resizeObserver: ResizeObserver | undefined;
		if (typeof ResizeObserver !== 'undefined') {
			resizeObserver = new ResizeObserver(requestUpdate);
			resizeObserver.observe(document.documentElement);
			if (document.body) {
				resizeObserver.observe(document.body);
			}
		}

		return () => {
			if (animationFrame !== undefined) {
				window.cancelAnimationFrame(animationFrame);
			}
			window.removeEventListener('scroll', requestUpdate);
			window.removeEventListener('resize', requestUpdate);
			resizeObserver?.disconnect();
		};
	}, [tierGroups]);

	return slot;
}

type DocsPartnerFlipState = 'idle' | 'out' | 'in';

function useFlippingDocsPartnerSlot(activeSlot: DocsPartnerScrollSlot | undefined) {
	const [displayedSlot, setDisplayedSlot] = useState(activeSlot);
	const [flipState, setFlipState] = useState<DocsPartnerFlipState>('idle');
	const displayedSlotRef = useRef(displayedSlot);

	useEffect(() => {
		displayedSlotRef.current = displayedSlot;
	}, [displayedSlot]);

	useEffect(() => {
		const currentDisplayedSlot = displayedSlotRef.current;

		if (areDocsPartnerSlotsEqual(currentDisplayedSlot, activeSlot)) {
			return;
		}

		if (!activeSlot) {
			setDisplayedSlot(undefined);
			setFlipState('idle');
			return;
		}

		const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

		if (!currentDisplayedSlot || prefersReducedMotion) {
			setDisplayedSlot(activeSlot);
			setFlipState('idle');
			return;
		}

		setFlipState('out');
		const timeout = window.setTimeout(() => {
			setDisplayedSlot(activeSlot);
			setFlipState('in');
		}, 120);

		return () => {
			window.clearTimeout(timeout);
		};
	}, [activeSlot]);

	useEffect(() => {
		if (flipState !== 'in' || !areDocsPartnerSlotsEqual(displayedSlot, activeSlot)) {
			return;
		}

		const timeout = window.setTimeout(() => {
			setFlipState('idle');
		}, 160);

		return () => {
			window.clearTimeout(timeout);
		};
	}, [activeSlot, displayedSlot, flipState]);

	return { displayedSlot, flipState };
}

function getDocsPartnerScrollSlot(
	tierGroups: Array<DocsPartnerTierGroup>,
	progress: number,
): DocsPartnerScrollSlot | undefined {
	const availableGroups = partnerTiers.map(
		(tier) => tierGroups.find((group) => group.tier === tier),
	).filter((group): group is DocsPartnerTierGroup => {
		return Boolean(group && group.partners.length > 0);
	});

	if (!availableGroups.length) {
		return undefined;
	}

	const totalWeight = availableGroups.reduce(
		(total, group) => total + docsPartnerTierWeights[group.tier],
		0,
	);
	const normalizedProgress = clampProgress(progress);
	let progressStart = 0;
	let slotIndexOffset = 0;

	for (const [groupIndex, group] of availableGroups.entries()) {
		const tierShare = docsPartnerTierWeights[group.tier] / totalWeight;
		const progressEnd = progressStart + tierShare;
		const isLastGroup = groupIndex === availableGroups.length - 1;

		if (normalizedProgress < progressEnd || isLastGroup) {
			const localProgress = clampProgress((normalizedProgress - progressStart) / tierShare);
			const partnerIndex = Math.min(
				group.partners.length - 1,
				Math.floor(localProgress * group.partners.length),
			);

			return {
				partner: group.partners[partnerIndex],
				slotIndex: slotIndexOffset + partnerIndex,
			};
		}

		progressStart = progressEnd;
		slotIndexOffset += group.partners.length;
	}

	return undefined;
}

function getPageScrollProgress() {
	const documentElement = document.documentElement;
	const body = document.body;
	const totalHeight = Math.max(documentElement.scrollHeight, body?.scrollHeight ?? 0);
	const viewportHeight = window.innerHeight || documentElement.clientHeight;
	// scrollY tops out at totalHeight - viewportHeight; using that range keeps
	// the final partner reachable when the viewport bottom hits the page bottom.
	const scrollableHeight = Math.max(0, totalHeight - viewportHeight);

	if (scrollableHeight === 0) {
		return 0;
	}

	const scrollTop = Math.min(
		Math.max(window.scrollY || documentElement.scrollTop, 0),
		scrollableHeight,
	);

	return scrollTop / scrollableHeight;
}

function clampProgress(value: number) {
	if (!Number.isFinite(value)) {
		return 0;
	}

	return Math.min(Math.max(value, 0), 1);
}

function areDocsPartnerSlotsEqual(
	left: DocsPartnerScrollSlot | undefined,
	right: DocsPartnerScrollSlot | undefined,
) {
	return left?.partner.id === right?.partner.id && left?.slotIndex === right?.slotIndex;
}

function getCompactPartnerImageConfig(
	image: Parameters<typeof PartnerImage>[0]['config'],
): Parameters<typeof PartnerImage>[0]['config'] {
	if (!image.scale) {
		return image;
	}

	if ('light' in image) {
		return {
			light: image.light,
			dark: image.dark,
		};
	}

	return {
		src: image.src,
	};
}

// Helper to get text color class from framework badge
const _getFrameworkTextColor = (frameworkValue: string | undefined) => {
	if (!frameworkValue) return 'text-gray-500';
	const framework = frameworkOptions.find((f) => f.value === frameworkValue);

	return framework?.fontColor ?? 'text-gray-500';
};

// Create context for width toggle state
export const WidthToggleContext = createContext<
	| {
			isFullWidth: boolean;
			setIsFullWidth: (isFullWidth: boolean) => void;
	  }
	| null
>(null);

export const useWidthToggle = () => {
	const context = useContext(WidthToggleContext);
	if (!context) {
		throw new Error('useWidthToggle must be used within a WidthToggleProvider');
	}
	return context;
};

// Create context for doc navigation (prev/next)
type DocNavItem = { label: any; to: string };
const DocNavigationContext = createContext<
	| {
			libraryId: LibraryId;
			version: string;
			prevItem?: DocNavItem;
			nextItem?: DocNavItem;
			colorFrom: string;
			colorTo: string;
			textColor: string;
	  }
	| null
>(null);

type FrameworkDocsLinkTarget = {
	kind: 'docs' | 'examples';
	framework: string;
	splat: string;
};

function getFrameworkDocsLinkTarget(to: string): FrameworkDocsLinkTarget | undefined {
	const match = /^framework\/([^/]+)\/(.+)$/.exec(to);

	if (!match) {
		return undefined;
	}

	const framework = match[1];
	const splat = match[2];

	if (!framework || !splat) {
		return undefined;
	}

	const examplesPrefix = 'examples/';

	if (splat.startsWith(examplesPrefix)) {
		return {
			kind: 'examples',
			framework,
			splat: splat.slice(examplesPrefix.length),
		};
	}

	return {
		kind: 'docs',
		framework,
		splat,
	};
}

export const useDocNavigation = () => {
	return useContext(DocNavigationContext);
};

export function DocNavigation() {
	const context = useDocNavigation();
	if (!context) return null;

	const { libraryId, version, prevItem, nextItem, colorFrom, colorTo, textColor } = context;

	if (!prevItem && !nextItem) return null;

	return <div
		class="sticky flex items-stretch bottom-2 z-10 right-0 text-[10px] sm:text-xs md:text-sm print:hidden"
	>
		<div class="flex-1 flex justify-start">
			{prevItem
				? <DocNavigationCard
						direction="previous"
						item={prevItem}
						libraryId={libraryId}
						version={version}
					/>
				: null}
		</div>
		<div class="flex-1 flex justify-end">
			{nextItem
				? <DocNavigationCard
						colorFrom={colorFrom}
						colorTo={colorTo}
						direction="next"
						item={nextItem}
						libraryId={libraryId}
						textColor={textColor}
						version={version}
					/>
				: null}
		</div>
	</div>;
}

function DocNavigationCard({
	colorFrom,
	colorTo,
	direction,
	item,
	libraryId,
	textColor,
	version,
}: {
	colorFrom?: string;
	colorTo?: string;
	direction: 'previous' | 'next';
	item: DocNavItem;
	libraryId: LibraryId;
	textColor?: string;
	version: string;
}) {
	const frameworkDocsTarget = getFrameworkDocsLinkTarget(item.to);
	const className = 'py-1 px-2 sm:py-2 sm:px-3 flex items-center gap-1 sm:gap-2';
	const children =
		direction === 'previous'
			? <>
					<ChevronLeft className="w-3 h-3 sm:w-4 sm:h-4" />
					<div class="flex flex-col">
						<span class="hidden sm:block text-[10px] uppercase tracking-wider opacity-60 mb-0.5">
							Previous
						</span>
						<span class="font-bold">{item.label}</span>
					</div>
				</>
			: <>
					<div class="flex flex-col items-end">
						<span class="hidden sm:block text-[10px] uppercase tracking-wider opacity-60 mb-0.5">
							Next
						</span>
						<span
							class={`font-bold text-right bg-linear-to-r ${colorFrom} ${colorTo} bg-clip-text text-transparent`}
						>{item.label}</span>
					</div>
					<ChevronRight className={twMerge('w-3 h-3 sm:w-4 sm:h-4', textColor)} />
				</>;

	if (frameworkDocsTarget) {
		if (frameworkDocsTarget.kind === 'examples') {
			return <Link
				to="/$libraryId/$version/docs/framework/$framework/examples/$"
				params={{
					libraryId,
					version,
					framework: frameworkDocsTarget.framework,
					_splat: frameworkDocsTarget.splat,
				}}
			>
				<Card className={className}>{children}</Card>
			</Link>;
		}

		return <Link
			to="/$libraryId/$version/docs/framework/$framework/$"
			params={{
				libraryId,
				version,
				framework: frameworkDocsTarget.framework,
				_splat: frameworkDocsTarget.splat,
			}}
		>
			<Card className={className}>{children}</Card>
		</Link>;
	}

	return <Card
		as={Link}
		from="/$libraryId/$version/docs"
		to={item.to}
		params={{ libraryId, version } as never}
		className={className}
	>{children}</Card>;
}

const useMenuConfig = ({
	config,
	repo,
	frameworks,
	libraryId,
}: {
	config: ConfigSchema;
	repo: string;
	frameworks: Framework[];
	libraryId: string;
}): MenuItem[] => {
	const currentFramework = useCurrentFramework(frameworks);

	const localMenu: MenuItem = {
		label: 'Menu',
		children: [
			{
				label: 'Home',
				to: '..',
			},
			{
				label: 'Blog',
				to: '/$libraryId/$version/docs/blog',
			},
			...(frameworks.length > 1
				? [
						{
							label: 'Frameworks',
							to: './framework',
						},
					]
				: []),
			...(libraryId === 'intent'
				? [
						{
							label: 'Skills Registry',
							to: '/intent/registry',
						},
					]
				: []),
			{
				label: 'Contributors',
				to: '/$libraryId/$version/docs/contributors',
			},
			{
				label: 'NPM Stats',
				to: '/$libraryId/$version/docs/npm-stats',
			},
			...(config.sections.find((d) => d.label === 'Community Resources')
				? [
						{
							label: 'Community Resources',
							to: '/$libraryId/$version/docs/community-resources',
						},
					]
				: []),
			{
				label: <div class="flex items-center gap-2">
					GitHub
					<GithubIcon className="opacity-20" />
				</div>,
				to: `https://github.com/${repo}`,
			},
			{
				label: <div class="flex items-center gap-2">
					Discord
					<DiscordIcon className="text-lg opacity-20" />
				</div>,
				to: 'https://tlinz.com/discord',
			},
		],
	};

	return [
		localMenu,
		// Merge the two menus together based on their group labels
		...config.sections.map((section): MenuItem | undefined => {
			const frameworkDocs = section.frameworks?.find((f) => f.label === currentFramework.framework);
			const frameworkItems = frameworkDocs?.children ?? [];

			const children = [
				...section.children.map((d) => ({ ...d, badge: 'core' })),
				...frameworkItems.map(
					(d) => ({
						...d,
						badge: currentFramework.framework,
					}),
				),
			];

			if (children.length === 0) {
				return undefined;
			}

			return {
				label: section.label,
				tab: section.tab,
				children,
				collapsible: section.collapsible ?? false,
				defaultCollapsed: section.defaultCollapsed ?? false,
			};
		}),
	].filter((item) => item !== undefined);
};

type LibraryLayoutProps = {
	libraryId: LibraryId;
	name: string;
	version: string;
	colorFrom: string;
	colorTo: string;
	textColor: string;
	config: ConfigSchema;
	frameworks: Framework[];
	versions: string[];
	repo: string;
	children: any;
	isLandingPage?: boolean;
};

export function LibraryLayout({
	libraryId,
	colorFrom,
	colorTo,
	textColor,
	config,
	frameworks,
	repo,
	children,
	isLandingPage = false,
}: LibraryLayoutProps) {
	const { version } = useParams({
		strict: false,
	}) as { version: string };
	const { _splat } = useParams({ strict: false });
	const menuConfig = useMenuConfig({ config, frameworks, repo, libraryId });

	const matches = useMatches();
	const lastMatch = last(matches);

	const isExample = matches.some((d) => d.pathname.includes('/examples/'));

	const isNpmStats = matches.some((d) => d.pathname.includes('/docs/npm-stats'));

	const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
	const mobileMenuDialogRef = useRef<HTMLDivElement>(null);
	const mobileMenuToggleId = 'docs-mobile-menu-toggle';
	const closeMobileMenu = useCallback(() => {
		setMobileMenuOpen(false);
	}, []);

	const docsMatch = matches.find((d) => d.pathname.includes('/docs'));
	const docsPathname = docsMatch?.pathname ?? '';

	const relativePathname = lastMatch.pathname.replace(docsPathname + '/', '');

	useEffect(() => {
		closeMobileMenu();
	}, [closeMobileMenu, lastMatch.pathname]);

	useEffect(() => {
		if (!mobileMenuOpen) return;
		const onKeyDown = (e: KeyboardEvent) => {
			if (e.key === 'Escape') closeMobileMenu();
		};
		window.addEventListener('keydown', onKeyDown);
		return () => window.removeEventListener('keydown', onKeyDown);
	}, [closeMobileMenu, mobileMenuOpen]);

	const tabbedMenuConfig = useMemo(() => {
		return getTabbedMenuConfig(menuConfig);
	}, [menuConfig]);

	const activeTabId = useMemo(() => {
		return getActiveDocsNavTabId({
			isExample,
			menuConfig,
			pathname: lastMatch.pathname,
			relativePathname,
		});
	}, [isExample, lastMatch.pathname, menuConfig, relativePathname]);

	const visibleMenuConfig = useMemo(() => {
		return tabbedMenuConfig.find((tab) => tab.id === activeTabId)?.groups ?? menuConfig;
	}, [activeTabId, menuConfig, tabbedMenuConfig]);

	const flatMenu = useMemo(() => visibleMenuConfig.flatMap((d) => d.children), [visibleMenuConfig]);

	// Filter out external links for prev/next navigation
	const internalFlatMenu = useMemo(() => flatMenu.filter((d) => !d.to.startsWith('http')), [
		flatMenu,
	]);

	const index = internalFlatMenu.findIndex((d) => d?.to === relativePathname);
	const prevItem = internalFlatMenu[index - 1];
	const nextItem = internalFlatMenu[index + 1];

	const [isFullWidth, setIsFullWidth] = useLocalStorage('docsFullWidth', false);

	const activePartners = useMemo(() => partners.filter((d) => d.status === 'active'), []);
	const docsPartnerOrderContext = usePartnerPlacementContext({
		orderStrategy: 'tier-rotated',
		surface: 'docs_rail',
	});
	const shouldShowDocsPartnerSlot = useMediaQuery('(max-width: 767.98px)');
	const isDesktopViewport = useMediaQuery('(min-width: 768px)');

	const groupInitialOpenState = useMemo(() => {
		return visibleMenuConfig.reduce<Record<string, boolean>>((acc, group, index) => {
			const isChildActive = group.children.some((child) => child.to === _splat);
			const key = `${index}:${String(group.label)}`;

			acc[key] = isChildActive
				? true
				: typeof group.defaultCollapsed !== 'undefined'
					? !group.defaultCollapsed
					: false;

			return acc;
		}, {});
	}, [visibleMenuConfig, _splat]);

	const [openGroups, setOpenGroups] = useState(groupInitialOpenState);

	useEffect(() => {
		setOpenGroups((prev) => {
			let hasChanged = false;
			const next = { ...prev };

			Object.entries(groupInitialOpenState).forEach(([key, isOpen]) => {
				if (!(key in next)) {
					next[key] = isOpen;
					hasChanged = true;
					return;
				}

				if (isOpen && !next[key]) {
					next[key] = true;
					hasChanged = true;
				}
			});

			return hasChanged ? next : prev;
		});
	}, [groupInitialOpenState]);

	const libraryHomePath = `/${libraryId}/${version}`;

	const menuItems = visibleMenuConfig.map((group, i) => {
		const groupKey = `${i}:${String(group.label)}`;

		const groupContent = <>
			{group.collapsible
				? <summary
						class="text-[.8em] font-bold leading-4 px-2 ts-sidebar-label"
						onClick={(event) => {
							event.preventDefault();
							setOpenGroups(
								(prev) => ({
									...prev,
									[groupKey]: !(prev[groupKey] ?? false),
								}),
							);
						}}
					>{group.label}</summary>
				: <div class="text-[.8em] font-bold leading-4 px-2 ts-sidebar-label">{group.label}</div>}
			<div class="h-2" />
			<ul class="text-[.85em] leading-snug list-none">
				{group?.children?.map((child, i) => {
					const linkClasses = `flex gap-2 items-center justify-between group px-2 py-1.5 rounded-lg hover:bg-gray-500/10 opacity-60 hover:opacity-100`;
					const linkParams =
						!child.to.startsWith('/') || child.to.includes('/$libraryId')
							? { libraryId, version } as never
							: undefined;
					const isHomeLink = child.to === '..';
					const frameworkDocsTarget = getFrameworkDocsLinkTarget(child.to);

					const recency = getDocRecency(child.addedAt, child.updatedAt);
					const recencyPill = recency
						? <DocRecencyPill
								recency={recency}
								date={recency === 'new' ? child.addedAt : child.updatedAt}
							/>
						: null;

					const renderLinkContent = (isActive: boolean) => <div
						class={twMerge(linkClasses, isActive && 'opacity-100')}
					>
						<div
							class={twMerge(
								'w-full',
								isActive
									? `font-bold text-transparent bg-clip-text bg-linear-to-r ${colorFrom} ${colorTo}`
									: '',
							)}
						>{child.label}</div>
						{recencyPill}
					</div>;

					return <li key={i}>
						{child.to.startsWith('http')
							? <a href={child.to} class={linkClasses} target="_blank" rel="noopener noreferrer">
									<span class="w-full">{child.label}</span>
									{recencyPill}
								</a>
							: isHomeLink
								? <Link to={libraryHomePath} onClick={closeMobileMenu} className="relative">
										<div class={twMerge(linkClasses, !docsMatch && 'opacity-100')}>
											<div
												class={twMerge(
													'w-full',
													!docsMatch
														? `font-bold text-transparent bg-clip-text bg-linear-to-r ${colorFrom} ${colorTo}`
														: '',
												)}
											>{child.label}</div>
										</div>
									</Link>
								: frameworkDocsTarget?.kind === 'examples'
									? <Link
											to="/$libraryId/$version/docs/framework/$framework/examples/$"
											params={{
												libraryId,
												version,
												framework: frameworkDocsTarget.framework,
												_splat: frameworkDocsTarget.splat,
											}}
											onClick={closeMobileMenu}
											preload="intent"
											activeOptions={{
												exact: true,
												includeHash: false,
												includeSearch: false,
											}}
											className="relative"
										>
											{(props: { isActive: boolean }) => renderLinkContent(props.isActive)}
										</Link>
									: frameworkDocsTarget
										? <Link
												to="/$libraryId/$version/docs/framework/$framework/$"
												params={{
													libraryId,
													version,
													framework: frameworkDocsTarget.framework,
													_splat: frameworkDocsTarget.splat,
												}}
												onClick={closeMobileMenu}
												preload="intent"
												activeOptions={{
													exact: true,
													includeHash: false,
													includeSearch: false,
												}}
												className="relative"
											>
												{(props: { isActive: boolean }) => renderLinkContent(props.isActive)}
											</Link>
										: <Link
												from="/$libraryId/$version/docs"
												to={child.to}
												params={linkParams}
												onClick={closeMobileMenu}
												preload="intent"
												activeOptions={{
													exact: true,
													includeHash: false,
													includeSearch: false,
												}}
												className="relative"
											>
												{(props: { isActive: boolean }) => renderLinkContent(props.isActive)}
											</Link>}
					</li>;
				})}
			</ul>
		</>;

		return group.collapsible
			? <details
					key={`group-${i}`}
					class="[&>summary]:before:mr-1 [&>summary]:marker:text-[0.8em] [&>summary]:marker:leading-4 relative select-none"
					open={openGroups[groupKey] ?? false}
				>{groupContent}</details>
			: <div
					key={`group-${i}`}
					class="[&>summary]:before:mr-1 [&>summary]:marker:text-[0.8em] [&>summary]:marker:leading-4 relative select-none"
				>{groupContent}</div>;
	});

	const smallMenu = <div class="min-[900px]:hidden">
		<input
			id={mobileMenuToggleId}
			type="checkbox"
			aria-label="Documentation menu"
			aria-controls="docs-mobile-menu"
			checked={mobileMenuOpen}
			data-docs-mobile-menu-toggle
			class="sr-only"
			onChange={(event) => {
				setMobileMenuOpen(event.currentTarget.checked);
			}}
		/>
		<label
			htmlFor={mobileMenuToggleId}
			aria-label="Close documentation menu"
			data-docs-mobile-backdrop
			class="fixed inset-x-0 bottom-0 top-[var(--navbar-height)] z-40 bg-black/30 backdrop-blur-sm"
		/>
		<div
			ref={mobileMenuDialogRef}
			id="docs-mobile-menu"
			role="dialog"
			aria-modal="true"
			aria-label="Documentation navigation"
			data-docs-mobile-menu
			tabIndex={-1}
			class="fixed inset-x-0 top-[var(--navbar-height)] z-50 m-0 w-full max-w-none p-0 min-[900px]:hidden
        max-h-[calc(100dvh-var(--navbar-height))] overflow-y-auto
        bg-white dark:bg-black/95 backdrop-blur-lg border-b border-gray-500/20 shadow-xl"
		>
			<div class="flex items-center justify-between py-2 px-4 border-b border-gray-500/20">
				<span class="font-bold">Docs</span>
				<button
					type="button"
					aria-label="Close menu"
					aria-controls="docs-mobile-menu"
					class="p-1 rounded-md hover:bg-gray-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-current cursor-pointer"
					onClick={closeMobileMenu}
				>
					<X className="w-5 h-5" />
				</button>
			</div>
			<div class="flex flex-col gap-4 p-4 text-lg">
				<div class="flex flex-col gap-1">
					<FrameworkSelect libraryId={libraryId} />
					<VersionSelect libraryId={libraryId} />
				</div>
				<SearchButton />
				{menuItems}
			</div>
		</div>
	</div>;

	// State and timer for auto-hide behavior (similar to Navbar)
	const [showLargeMenu, setShowLargeMenu] = useState(false);
	const leaveTimer = useRef<NodeJS.Timeout | undefined>(undefined);
	const largeMenuTriggerRef = useRef<HTMLButtonElement>(null);
	const largeMenuClickOutsideRefs = useMemo(() => [largeMenuTriggerRef], []);

	const openLargeMenu = useCallback(() => {
		clearTimeout(leaveTimer.current);
		setShowLargeMenu(true);
	}, []);

	// Close menu when clicking outside (only on sm-xl screens where it's an overlay)
	const expandedMenuRef = useClickOutside<HTMLDivElement>({
		enabled: showLargeMenu && typeof window !== 'undefined' && window.innerWidth < 1280,
		onClickOutside: () => setShowLargeMenu(false),
		additionalRefs: largeMenuClickOutsideRefs,
	});

	const largeMenu = <>
		{/* Expanded menu - always visible on xl+, toggleable overlay on md-xl */}
		<div
			id="docs-desktop-menu"
			data-docs-desktop-menu
			ref={expandedMenuRef}
			class={twMerge(
				'max-w-[250px] xl:max-w-[300px] 2xl:max-w-[400px]',
				'flex-col overflow-hidden',
				'h-[calc(100dvh-var(--navbar-height)-var(--docs-tabs-height))] top-[calc(var(--navbar-height)+var(--docs-tabs-height))]',
				'border-r border-gray-500/20',
				'transition-all duration-300',
				'hidden min-[900px]:flex',
				'min-[900px]:fixed min-[900px]:left-0 min-[900px]:z-40 min-[900px]:bg-white min-[900px]:dark:bg-black/95 min-[900px]:backdrop-blur-lg min-[900px]:shadow-xl',
				'xl:sticky xl:z-20 xl:bg-transparent xl:dark:bg-transparent xl:backdrop-blur-none xl:shadow-none',
				!showLargeMenu && 'md:-translate-x-full xl:translate-x-0',
				showLargeMenu && 'md:translate-x-0',
			)}
			onPointerEnter={(e) => {
				if (e.pointerType === 'touch') return;
				if (window.innerWidth < 1280) {
					clearTimeout(leaveTimer.current);
				}
			}}
			onPointerLeave={(e) => {
				if (e.pointerType === 'touch') return;

				if (expandedMenuRef.current?.querySelector('[data-state="open"]')) return;
				if (window.innerWidth < 1280) {
					leaveTimer.current = setTimeout(() => {
						setShowLargeMenu(false);
					}, 300);
				}
			}}
		>
			<div class="flex-1 flex flex-col overflow-y-auto min-w-[230px]">
				<div class="flex flex-col gap-1 p-4">
					<FrameworkSelect libraryId={libraryId} />
					<VersionSelect libraryId={libraryId} />
				</div>
				<div class="flex-1 flex flex-col gap-4 text-base px-4 pt-0 pb-4">{menuItems}</div>
			</div>
		</div>
	</>;

	const docsTabs = <div
		class="sticky top-[var(--navbar-height)] z-30 border-b border-gray-500/20 bg-white/90 dark:bg-black/80 backdrop-blur-lg"
	>
		<div class="flex items-stretch">
			<button
				type="button"
				aria-label="Documentation menu"
				aria-expanded={mobileMenuOpen ? true : undefined}
				aria-controls="docs-mobile-menu"
				onClick={() => setMobileMenuOpen((prev) => !prev)}
				data-docs-mobile-trigger
				class="min-[900px]:hidden flex items-center gap-1.5 shrink-0 px-3 border-r border-gray-500/20 text-slate-600 dark:text-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-current"
			>
				<Menu className="w-4 h-4" data-docs-mobile-closed-icon />
				<X className="w-4 h-4" data-docs-mobile-open-icon />
				<span class="text-xs font-medium max-[479.98px]:sr-only">Menu</span>
			</button>
			<button
				ref={largeMenuTriggerRef}
				type="button"
				aria-label="Open documentation menu"
				aria-expanded={showLargeMenu}
				aria-controls="docs-desktop-menu"
				onPointerEnter={(event) => {
					if (event.pointerType === 'touch') return;
					openLargeMenu();
				}}
				onPointerDown={openLargeMenu}
				onMouseEnter={openLargeMenu}
				onFocus={openLargeMenu}
				onClick={openLargeMenu}
				data-docs-menu-trigger
				class="hidden min-[900px]:flex xl:hidden items-center gap-1 shrink-0 px-2 border-r border-gray-500/20 text-xs font-medium text-slate-600 dark:text-slate-300 min-[1120px]:gap-1.5 min-[1120px]:px-3 min-[1120px]:text-[13px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-current"
			>
				<Menu className="w-4 h-4" />
				<span class="text-xs font-medium">Menu</span>
			</button>
			<div class="relative flex min-w-0 flex-1 items-stretch">
				<nav
					aria-label="Documentation sections"
					class="flex min-w-0 flex-1 items-stretch gap-3 overflow-x-auto px-3 text-xs min-[1120px]:gap-6 min-[1120px]:px-6 min-[1120px]:text-[13px] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
				>{tabbedMenuConfig.map((tab) => {
					const target = tab.firstItem;
					const isActive = tab.id === activeTabId;

					if (!target) {
						return null;
					}

					const linkParams =
						!target.to.startsWith('/') || target.to.includes('/$libraryId')
							? { libraryId, version } as never
							: undefined;

					return <Link
						key={tab.id}
						from="/$libraryId/$version/docs"
						to={target.to}
						params={linkParams}
						activeOptions={{
							exact: true,
							includeHash: false,
							includeSearch: false,
						}}
						aria-current={isActive ? 'page' : undefined}
						className={twMerge(
							'relative whitespace-nowrap py-3 font-semibold transition-colors',
							'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-current rounded-sm',
							isActive
								? `text-transparent bg-clip-text bg-linear-to-r ${colorFrom} ${colorTo}`
								: 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100',
						)}
					>
						{tab.label}
						{isActive
							? <span
									aria-hidden="true"
									class={twMerge(
										'absolute left-0 right-0 -bottom-px h-[3px] rounded-t-full bg-linear-to-r',
										colorFrom,
										colorTo,
									)}
								/>
							: null}
					</Link>;
				})}</nav>
				<div
					aria-hidden="true"
					data-docs-tabs-scroll-fade
					class="pointer-events-none absolute inset-y-0 right-0 z-10 w-8 bg-linear-to-r from-white/0 to-white/95 dark:from-black/0 dark:to-black/90 min-[640px]:w-10"
				/>
			</div>
			{shouldShowDocsPartnerSlot && activePartners.length
				? <DocsPartnerSlot
						orderPlacementContext={docsPartnerOrderContext}
						partners={activePartners}
					/>
				: null}
		</div>
	</div>;

	return <WidthToggleContext.Provider value={{ isFullWidth, setIsFullWidth }}>
		<DocNavigationContext.Provider
			value={{
				libraryId,
				version,
				prevItem,
				nextItem,
				colorFrom,
				colorTo,
				textColor,
			}}
		>
			<div
				data-docs-layout
				data-docs-menu-open={showLargeMenu ? 'true' : undefined}
				class={`
           md:min-h-[calc(100dvh-var(--navbar-height))]
           flex flex-col
          w-full transition-all duration-300
          [overflow-x:clip]`}
			>
				{smallMenu}
				{docsTabs}
				<div class="flex flex-col md:flex-row flex-1 min-h-0">
					{largeMenu}
					<div class={twMerge('flex flex-col max-w-full min-w-0 flex-1 min-h-0 relative')}>
						<div
							class={twMerge(
								`max-w-full min-w-0 flex flex-col justify-center w-full`,

								!isLandingPage && 'px-4 md:px-8',

								!isLandingPage && !isExample && !isNpmStats && !isFullWidth && 'mx-auto w-[900px]',
							)}
						>{children}</div>
						{!isLandingPage &&
							<div class="pt-8 md:pt-12">
								<Footer />
							</div>}
					</div>
					{!isLandingPage &&
						<RightRail breakpoint="md" className="md:w-[220px]" stickyOffset="docs-tabs">
							<PartnersRail analyticsPlacement="docs_rail" partners={activePartners} />
							<div
								class="hidden md:block border border-gray-500/20 rounded-l-lg overflow-hidden w-full"
							>
								<RecentPostsWidget enabled={isDesktopViewport} />
							</div>
						</RightRail>}
				</div>
			</div>
		</DocNavigationContext.Provider>
	</WidthToggleContext.Provider>;
}
