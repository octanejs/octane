import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'octane';
import { twMerge } from 'tailwind-merge';

const LazyAiDock = lazy(() => import('./SearchModal.tsrx').then((m) => ({ default: m.AiDock })));
const LazyNavbarAuthControls = lazy(
	() => import('./NavbarAuthControls.tsrx').then(
		(m) => ({
			default: m.NavbarAuthControls,
		}),
	),
);
import { NavbarCartButton } from './NavbarCartButton.tsrx';
import { Link, useLocation, useMatches } from '@octanejs/tanstack-router';
import {
	BookOpen,
	Code,
	ExternalLink,
	Grid2X2,
	Hammer,
	Heart,
	HelpCircle,
	Mail,
	Menu,
	Newspaper,
	Paintbrush,
	ShieldCheck,
	ShoppingBag,
	Sparkles,
	TrendingUp,
	User,
	Users,
	X,
} from '@octanejs/lucide';
import { ThemeToggle } from './ThemeToggle.tsrx';
import { AiDockButton, SearchButton } from './SearchButton.tsrx';
import { BrandContextMenu } from './BrandContextMenu.tsrx';
import { useSearchContext } from '~/contexts/SearchContext.tsrx';
import {
	isPublicLibrary,
	librariesByGroup,
	librariesGroupNamesMap,
	type LibrarySlim,
	type PublicLibrarySlim,
} from '~/libraries';
import { GithubIcon } from '~/components/icons/GithubIcon.tsrx';
import {
	Dropdown,
	DropdownContent,
	DropdownItem,
	DropdownTrigger,
} from '~/components/Dropdown.tsrx';
import { DiscordIcon } from '~/components/icons/DiscordIcon.tsrx';
import { InstagramIcon } from '~/components/icons/InstagramIcon.tsrx';
import { OptimizedImage } from '~/components/OptimizedImage.tsrx';
import { BSkyIcon } from '~/components/icons/BSkyIcon.tsrx';
import { BrandXIcon } from '~/components/icons/BrandXIcon.tsrx';
import { YouTubeIcon } from '~/components/icons/YouTubeIcon.tsrx';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '~/components/Collapsible.tsrx';
import { groupToSlug } from '~/components/stack/stack-categories';
import { getProducts } from '~/utils/shop.functions';
import { formatMoney, shopifyImageUrl } from '~/utils/shopify-format';
import type { ProductListItem } from '~/utils/shopify-queries';

type LogoProps = {
	title?: any;
};

const LogoSection = ({ title }: LogoProps) => {
	return <Link
		to="/"
		className={twMerge(`inline-flex items-center gap-1.5 cursor-pointer`, title ? 'shrink-0' : '')}
	>
		<div
			class="w-[30px] inline-grid items-center grid-cols-1 grid-rows-1 [&>*]:transition-opacity [&>*]:duration-1000"
		>
			<OptimizedImage
				src="/images/logos/logo-color-100.png"
				alt=""
				width={30}
				quality={90}
				className="row-start-1 col-start-1 w-full group-hover:opacity-0"
			/>
			<img
				src="/images/logos/logo-black.svg"
				alt=""
				class="row-start-1 col-start-1 w-full dark:opacity-0 opacity-0 group-hover:opacity-100"
			/>
			<img
				src="/images/logos/logo-white.svg"
				alt=""
				class="row-start-1 col-start-1 w-full light:opacity-0 dark:block opacity-0 group-hover:opacity-100"
			/>
		</div>
		<div>TanStack</div>
	</Link>;
};

type IconComponent = any;

type NavMenuKey = 'libraries' | 'learn' | 'community' | 'tools' | 'merch' | 'support';

type NavMenuItem = {
	label: string;
	to: string;
	hash?: string;
	description?: string;
	badge?: string;
	icon?: IconComponent;
};

type NavMenuSection = {
	label: string;
	items: readonly NavMenuItem[];
};

type NavMenuGroup = {
	key: NavMenuKey;
	label: string;
	to?: string;
	sections: readonly NavMenuSection[];
	rail?: {
		eyebrow: string;
		title: string;
		description: string;
		item: NavMenuItem;
	};
};

type NavigationLibrary = PublicLibrarySlim;

const MERCH_MENU_PRODUCT_COUNT = 6;

type LibraryGroupId = keyof typeof librariesByGroup;

const DESKTOP_NAV_CLASS = 'hidden min-[900px]:flex';
const MOBILE_NAV_CLASS = 'min-[900px]:hidden';
const DESKTOP_SOCIAL_CLASS = 'hidden min-[1120px]:flex';
const LIBRARY_MENU_GROUP_IDS: readonly LibraryGroupId[] = [
	'framework',
	'state',
	'headlessUI',
	'performance',
	'tooling',
];
const DESKTOP_LIBRARY_MENU_GROUP_COLUMNS: readonly (readonly LibraryGroupId[])[] = [
	['framework', 'state'],
	['headlessUI', 'performance'],
	['tooling'],
];

const NAV_GROUPS = [
	{
		key: 'libraries',
		label: 'Libraries',
		to: '/libraries',
		sections: [],
	},
	{
		key: 'learn',
		label: 'Blog',
		to: '/blog',
		sections: [
			{
				label: 'Resources',
				items: [
					{
						label: 'Blog',
						to: '/blog',
						description: 'Release notes, architecture notes, and essays.',
						icon: Newspaper,
					},
					{
						label: 'YouTube',
						to: 'https://youtube.com/@tan_stack',
						description: 'The official TanStack channel.',
						icon: YouTubeIcon,
					},
				],
			},
		],
		rail: {
			eyebrow: 'Workshops',
			title: 'Learn from maintainers',
			description: 'Remote and in-person TanStack workshops for teams that need depth.',
			item: {
				label: 'Professional Workshops',
				to: '/workshops',
				icon: Users,
			},
		},
	},
	{
		key: 'community',
		label: 'Community',
		sections: [
			{
				label: 'Channels',
				items: [
					{
						label: 'Discord',
						to: 'https://tlinz.com/discord',
						description: 'Community support and real-time discussion.',
						icon: DiscordIcon,
					},
					{
						label: 'GitHub',
						to: 'https://github.com/TanStack',
						description: 'Source, issues, discussions, and releases.',
						icon: GithubIcon,
					},
				],
			},
			{
				label: 'People & Work',
				items: [
					{
						label: 'Maintainers',
						to: '/maintainers',
						description: 'Meet the people maintaining the stack.',
						icon: Code,
					},
					{
						label: 'Contributors',
						to: '/maintainers',
						description: 'Core, library, and community contributors.',
						icon: Users,
					},
					{
						label: 'Showcase',
						to: '/showcase',
						description: 'Products and teams building with TanStack.',
						icon: Sparkles,
					},
				],
			},
		],
	},
	{
		key: 'tools',
		label: 'Tools',
		sections: [
			{
				label: 'Tools',
				items: [
					{
						label: 'Builder',
						to: '/builder',
						description: 'Generate TanStack app starters.',
						badge: 'Alpha',
						icon: Hammer,
					},
					{
						label: 'Stats',
						to: '/stats/npm',
						description: 'NPM and ecosystem usage data.',
						icon: TrendingUp,
					},
				],
			},
		],
	},
	{
		key: 'merch',
		label: 'Merch',
		to: '/shop',
		sections: [],
	},
	{
		key: 'support',
		label: 'Support',
		sections: [
			{
				label: 'Support',
				items: [
					{
						label: 'Support Overview',
						to: '/support',
						description: 'Find the right support path.',
						icon: HelpCircle,
					},
					{
						label: 'Partners',
						to: '/partners',
						description: 'Companies supporting TanStack.',
						icon: Heart,
					},
					{
						label: 'OSS Sponsors',
						to: '/',
						hash: 'sponsors',
						description: 'Sponsors keeping TanStack open source.',
						icon: ShieldCheck,
					},
					{
						label: 'Enterprise Support',
						to: '/paid-support',
						description: 'Private consulting and expert support.',
						icon: Users,
					},
					{
						label: 'Contact',
						to: 'mailto:support@tanstack.com',
						description: 'Get in touch with the TanStack team.',
						icon: Mail,
					},
				],
			},
			{
				label: 'About',
				items: [
					{
						label: 'Ethos',
						to: '/ethos',
						description: 'How we think about open source and products.',
						icon: ShieldCheck,
					},
					{
						label: 'Tenets',
						to: '/tenets',
						description: 'The values that shape TanStack libraries.',
						icon: BookOpen,
					},
					{
						label: 'Brand Guide',
						to: '/brand-guide',
						description: 'Logos, colors, and brand usage.',
						icon: Paintbrush,
					},
				],
			},
		],
		rail: {
			eyebrow: 'Partners',
			title: 'Work with TanStack',
			description: 'Sponsorships, placements, and partner pages.',
			item: {
				label: 'Partnership Inquiry',
				to: 'mailto:partners@tanstack.com?subject=TanStack Partnership Inquiry',
				icon: Mail,
			},
		},
	},
] as const satisfies readonly NavMenuGroup[];

function isNavigationLibrary(library: LibrarySlim): library is NavigationLibrary {
	return isPublicLibrary(library);
}

function getLibraryDisplayName(library: LibrarySlim) {
	return library.name.replace(/^TanStack\s+/, '');
}

function isExternalLink(to: string) {
	return to.startsWith('http') || to.startsWith('mailto:');
}

function getLibraryDocsTo(library: NavigationLibrary) {
	return `${library.to}/latest/docs`;
}

function getLibraryMenuGroups() {
	return LIBRARY_MENU_GROUP_IDS.map((groupId) => {
		const groupLibraries = librariesByGroup[groupId];
		const libraries = groupLibraries.filter(isNavigationLibrary);

		return {
			id: groupId,
			label: librariesGroupNamesMap[groupId],
			libraries,
		};
	}).filter((group) => group.libraries.length > 0);
}

function getDesktopLibraryMenuColumns(libraryMenuGroups: ReturnType<typeof getLibraryMenuGroups>) {
	const groupsById = new Map(libraryMenuGroups.map((group) => [group.id, group]));

	return DESKTOP_LIBRARY_MENU_GROUP_COLUMNS.map(
		(columnGroupIds) => columnGroupIds.flatMap((groupId) => {
			const group = groupsById.get(groupId);

			return group ? [group] : [];
		}),
	).filter((columnGroups) => columnGroups.length > 0);
}

function AiDockMount() {
	const { isAiDockOpen } = useSearchContext();
	const [hasActivated, setHasActivated] = useState(isAiDockOpen);

	useEffect(() => {
		if (isAiDockOpen) {
			setHasActivated(true);
		}
	}, [isAiDockOpen]);

	if (!hasActivated && !isAiDockOpen) {
		return null;
	}

	return <Suspense fallback={null}>
		<LazyAiDock />
	</Suspense>;
}

export function Navbar({ children }: { children?: any }) {
	const matches = useMatches();
	const location = useLocation();

	const { Title } = useMemo(() => {
		const match = [...matches].reverse().find((m) => m.staticData.Title);

		return {
			Title: match?.staticData.Title ?? null,
		};
	}, [matches]);

	const containerRef = useRef<HTMLDivElement>(null);
	const desktopNavRef = useRef<HTMLElement>(null);

	useEffect(() => {
		const desktopNav = desktopNavRef.current;

		if (!desktopNav) {
			return;
		}

		const updateDesktopNavWidth = () => {
			const targetWidth = Math.ceil(desktopNav.getBoundingClientRect().width + 32);

			desktopNav.style.setProperty('--ts-primary-nav-target-width', `${targetWidth}px`);
		};

		let animationFrameId: number | null = null;
		const scheduleDesktopNavWidthUpdate = () => {
			if (animationFrameId !== null) {
				return;
			}

			animationFrameId = window.requestAnimationFrame(() => {
				animationFrameId = null;
				updateDesktopNavWidth();
			});
		};

		updateDesktopNavWidth();

		const resizeObserver =
			typeof window.ResizeObserver === 'function'
				? new window.ResizeObserver(scheduleDesktopNavWidthUpdate)
				: null;

		resizeObserver?.observe(desktopNav);
		window.addEventListener('resize', scheduleDesktopNavWidthUpdate);

		return () => {
			if (animationFrameId !== null) {
				window.cancelAnimationFrame(animationFrameId);
			}

			resizeObserver?.disconnect();
			window.removeEventListener('resize', scheduleDesktopNavWidthUpdate);
		};
	}, []);

	const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
	const [dismissedDesktopMenuKey, setDismissedDesktopMenuKey] = useState<NavMenuKey | null>(null);
	const [canLoadAuthControls, setCanLoadAuthControls] = useState(false);

	useEffect(() => {
		setMobileMenuOpen(false);
	}, [location.href]);

	const blurActiveNavigationElement = useCallback(() => {
		if (typeof document === 'undefined') {
			return;
		}

		const activeElement = document.activeElement;

		if (activeElement instanceof HTMLElement && containerRef.current?.contains(activeElement)) {
			activeElement.blur();
		}
	}, []);

	const dismissDesktopMenu = useCallback((key: NavMenuKey) => {
		setDismissedDesktopMenuKey(key);
		blurActiveNavigationElement();
	}, [blurActiveNavigationElement]);

	const requestAuthControls = useCallback(() => {
		setCanLoadAuthControls(true);
	}, []);

	useEffect(() => {
		if (!mobileMenuOpen) {
			return;
		}

		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === 'Escape') {
				setMobileMenuOpen(false);
			}
		};

		document.addEventListener('keydown', onKeyDown);

		return () => {
			document.removeEventListener('keydown', onKeyDown);
		};
	}, [mobileMenuOpen]);

	const getLoginButtonFallback = (className?: string) => <Link
		to="/login"
		aria-label="Log In"
		className={twMerge(
			'flex shrink-0 items-center gap-1 rounded-md px-2 py-1.5 whitespace-nowrap',
			'bg-black dark:bg-white text-white dark:text-black',
			'hover:bg-gray-800 dark:hover:bg-gray-200',
			'transition-colors duration-200 text-xs font-medium',
			className,
		)}
	>
		<User className="w-3.5 h-3.5" />
		<span class="hidden min-[430px]:inline">Log In</span>
	</Link>;
	const renderAuthControls = (className?: string) => canLoadAuthControls
		? <Suspense fallback={getLoginButtonFallback(className)}>
				<LazyNavbarAuthControls className={className} />
			</Suspense>
		: (getLoginButtonFallback(className));

	const socialLinks = <SocialStack />;
	const siteBackdropActive = mobileMenuOpen;

	const navbar = <div
		class={twMerge(
			'w-full h-[var(--navbar-height)] p-2 fixed top-0 z-[100] bg-white/90 dark:bg-black/90 backdrop-blur-lg',
			'flex items-center justify-between gap-2 min-[1120px]:gap-3',
			'border-b border-gray-500/20',
		)}
		ref={containerRef}
	>
		<div class="flex min-w-0 flex-1 items-center gap-2 min-[1120px]:gap-3">
			<div class="flex items-center gap-2 font-black text-xl uppercase min-w-0">
				<BrandContextMenu className={twMerge(`flex items-center group shrink-0`)}>
					<LogoSection title={Title} />
				</BrandContextMenu>
				{Title
					? <div class="truncate">
							<Title />
						</div>
					: null}
			</div>

			<nav
				ref={desktopNavRef}
				aria-label="Primary navigation"
				class={twMerge(DESKTOP_NAV_CLASS, 'relative shrink-0 items-center gap-0')}
			>{NAV_GROUPS.map(
				(group) => <DesktopNavTrigger
					key={group.key}
					group={group}
					dismissed={dismissedDesktopMenuKey === group.key}
					onDismiss={() => dismissDesktopMenu(group.key)}
					onResetDismissed={() => {
						setDismissedDesktopMenuKey(
							(dismissedKey) => dismissedKey === group.key ? null : dismissedKey,
						);
					}}
				/>,
			)}</nav>
		</div>

		<div class="flex shrink-0 items-center gap-1.5 sm:gap-2">
			<div class={DESKTOP_SOCIAL_CLASS}>{socialLinks}</div>
			<ThemeToggle />
			<NavbarCartButton />
			<SearchButton iconOnly />
			<AiDockButton />
			<div
				class={twMerge(DESKTOP_NAV_CLASS, 'items-center gap-2')}
				onFocusCapture={requestAuthControls}
				onPointerEnter={requestAuthControls}
				onTouchStart={requestAuthControls}
			>{renderAuthControls()}</div>
			<button
				type="button"
				aria-label={mobileMenuOpen ? 'Close Menu' : 'Open Menu'}
				aria-expanded={mobileMenuOpen}
				aria-controls="primary-mobile-menu"
				class={twMerge(
					'inline-flex h-9 w-9 items-center justify-center rounded-md',
					'text-gray-700 transition-colors hover:bg-gray-500/10',
					'dark:text-gray-200',
					MOBILE_NAV_CLASS,
				)}
				onClick={() => setMobileMenuOpen((prev) => !prev)}
			>
				{mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
			</button>
		</div>
	</div>;

	const mobileMenu = <Collapsible
		open={mobileMenuOpen}
		onOpenChange={setMobileMenuOpen}
		className={MOBILE_NAV_CLASS}
	>
		<CollapsibleContent
			className={twMerge(
				'fixed left-0 right-0 top-[var(--navbar-height)] z-[90]',
				'motion-reduce:transition-none',
				mobileMenuOpen ? 'pointer-events-auto' : 'pointer-events-none',
			)}
		>
			<div
				id="primary-mobile-menu"
				data-mobile-menu
				aria-hidden={!mobileMenuOpen}
				class={twMerge(
					'ts-glass-menu max-h-[calc(100dvh-var(--navbar-height))] overflow-y-auto',
					'border-b border-white/45 bg-white/80 text-base shadow-2xl shadow-black/15 backdrop-blur-2xl backdrop-saturate-150',
					'dark:border-white/10 dark:bg-black/70 dark:shadow-black/50',
				)}
			>
				<div class="border-t border-white/30 dark:border-white/10">
					<div
						class="flex items-center justify-end gap-2 p-2"
						onFocusCapture={requestAuthControls}
						onPointerEnter={requestAuthControls}
						onTouchStart={requestAuthControls}
					>
						{socialLinks}
						{renderAuthControls('h-9 px-3 text-sm')}
					</div>
					<nav class="grid gap-1.5 px-2 pb-2" aria-label="Mobile navigation">{NAV_GROUPS.map(
						(group) =>
							<MobileMenuGroup
								key={group.key}
								group={group}
								onNavigate={() => setMobileMenuOpen(false)}
							/>,
					)}</nav>
				</div>
			</div>
		</CollapsibleContent>
	</Collapsible>;

	return <>
		{navbar}
		{mobileMenu}
		<div
			aria-hidden="true"
			data-site-menu-tint
			class={twMerge(
				'pointer-events-none fixed inset-x-0 bottom-0 top-[var(--navbar-height)] z-[80]',
				'bg-white/45 transition-opacity duration-200 motion-reduce:transition-none dark:bg-black/45',
				siteBackdropActive ? 'opacity-100' : 'opacity-0',
			)}
		/>
		<div
			data-site-content
			class={twMerge(
				`min-h-[calc(100dvh-var(--navbar-height))] flex flex-col
          min-w-0 w-full transition-[filter] duration-200 motion-reduce:transition-none
          pt-[var(--navbar-height)]`,
				siteBackdropActive ? 'blur-[4px]' : 'filter-none',
			)}
		>
			<div class="flex-1 min-w-0 flex flex-col w-full min-h-0">{children}</div>
		</div>
		<AiDockMount />
	</>;
}

function DesktopNavTrigger({
	group,
	dismissed,
	onDismiss,
	onResetDismissed,
}: {
	group: NavMenuGroup;
	dismissed: boolean;
	onDismiss: () => void;
	onResetDismissed: () => void;
}) {
	const triggerClassName = twMerge(
		'ts-mega-trigger inline-flex items-center gap-1 rounded-md px-2 py-2 text-xs font-medium min-[1120px]:gap-1.5 min-[1120px]:px-3 min-[1120px]:text-[13px]',
		'text-gray-700 transition-colors hover:bg-gray-500/10 hover:text-gray-950',
		'dark:text-gray-300 dark:hover:text-white',
	);

	return <div
		class="ts-mega-trigger-wrap"
		data-menu-key={group.key}
		data-menu-dismissed={dismissed ? 'true' : undefined}
		onPointerLeave={onResetDismissed}
		onFocusCapture={onResetDismissed}
	>
		{group.to
			? <Link
					to={group.to}
					data-menu-key={group.key}
					className={triggerClassName}
					onClick={onDismiss}
					preload="intent"
				>
					<span>{group.label}</span>
				</Link>
			: <button
					type="button"
					data-menu-key={group.key}
					class={triggerClassName}
					onMouseDown={(event) => {
						event.preventDefault();
					}}
				>
					<span>{group.label}</span>
				</button>}
		<DesktopNavDropdown group={group} onNavigate={onDismiss} />
	</div>;
}

function DesktopNavDropdown({
	group,
	onNavigate,
}: {
	group: NavMenuGroup;
	onNavigate: () => void;
}) {
	return <div class="ts-mega-dropdown">
		<div
			class={twMerge(
				'ts-mega-dropdown-panel ts-glass-menu rounded-xl',
				'w-max min-w-[var(--ts-primary-nav-target-width,0px)] max-w-[calc(100vw-2rem)]',
				'border border-white/45 bg-white/80 p-4 shadow-2xl shadow-black/15 backdrop-blur-2xl backdrop-saturate-150',
				'dark:border-white/10 dark:bg-black/70 dark:shadow-black/50',
			)}
		>
			<MegaMenuContent group={group} onNavigate={onNavigate} variant="desktop" />
		</div>
	</div>;
}

function MobileMenuGroup({ group, onNavigate }: { group: NavMenuGroup; onNavigate: () => void }) {
	return <Collapsible
		className="overflow-hidden rounded-lg border border-gray-500/10 bg-white/35 dark:border-white/10 dark:bg-white/[0.03]"
	>
		{({ open }: { open: boolean }) => <>
			{group.to
				? <div class="flex items-center">
						<CollapsibleTrigger
							aria-label={`${open ? 'Collapse' : 'Expand'} ${group.label}`}
							className={twMerge(
								'flex min-w-0 flex-1 items-center px-3 py-3 text-left font-black text-gray-800',
								'hover:text-gray-950 focus:outline-none dark:text-gray-200 dark:hover:text-white',
								open && 'text-gray-950 dark:text-white',
							)}
						>
							<span class="min-w-0 flex-1 truncate">{group.label}</span>
						</CollapsibleTrigger>
					</div>
				: <CollapsibleTrigger
						className={twMerge(
							'flex w-full items-center px-3 py-3 text-left font-black text-gray-800',
							'hover:text-gray-950 dark:text-gray-200 dark:hover:text-white',
							open && 'text-gray-950 dark:text-white',
						)}
					>{group.label}</CollapsibleTrigger>}
			<CollapsibleContent
				className="border-t border-gray-500/10 motion-reduce:transition-none dark:border-white/10"
			>
				<div class="px-2 pb-3 pt-1">
					<MegaMenuContent group={group} onNavigate={onNavigate} variant="mobile" />
				</div>
			</CollapsibleContent>
		</>}
	</Collapsible>;
}

function MegaMenuContent({
	group,
	onNavigate,
	variant,
}: {
	group: NavMenuGroup;
	onNavigate: () => void;
	variant: 'desktop' | 'mobile';
}) {
	if (group.key === 'libraries') {
		return <LibrariesMenuContent onNavigate={onNavigate} variant={variant} />;
	}

	if (group.key === 'merch') {
		return <MerchMenuContent onNavigate={onNavigate} variant={variant} />;
	}

	return <div
		class={twMerge(
			variant === 'desktop'
				? group.rail
					? 'grid w-max items-start gap-4 grid-cols-[max-content_260px]'
					: 'grid w-max gap-3'
				: 'grid gap-3',
		)}
	>
		<div>
			<div
				class={twMerge(
					'grid gap-3',
					variant === 'desktop' && group.sections.length > 1 && 'grid-cols-[repeat(2,260px)]',
				)}
			>{group.sections.map(
				(section, sectionIndex) => <div
					key={section.label}
					class={twMerge(
						variant === 'mobile' && sectionIndex === 0 && 'pt-1.5',
						variant === 'mobile' && sectionIndex > 0 && 'pt-3',
					)}
				>
					<div
						class="mb-2 px-2 text-xs font-black uppercase text-gray-500 dark:text-gray-400"
					>{section.label}</div>
					<div
						class={twMerge(
							'grid gap-1',
							variant === 'desktop' && group.key === 'learn' && 'grid-cols-[repeat(2,260px)]',
							variant === 'desktop' && group.key === 'tools' && 'grid-cols-[repeat(2,260px)]',
						)}
					>{section.items.map(
						(item) =>
							<MenuItemLink
								key={`${item.label}-${item.to}-${item.hash ?? ''}`}
								item={item}
								onNavigate={onNavigate}
								variant={variant}
							/>,
					)}</div>
				</div>,
			)}</div>
		</div>
		{group.rail ? <MenuRail rail={group.rail} onNavigate={onNavigate} variant={variant} /> : null}
	</div>;
}

function LibrariesMenuContent({
	onNavigate,
	variant,
}: {
	onNavigate: () => void;
	variant: 'desktop' | 'mobile';
}) {
	const libraryMenuGroups = getLibraryMenuGroups();
	const desktopLibraryMenuColumns = getDesktopLibraryMenuColumns(libraryMenuGroups);
	const allLibrariesItem: NavMenuItem = {
		label: 'All Libraries',
		to: '/libraries',
		description: 'Browse the full set of public packages.',
		icon: Grid2X2,
	};

	return <div class={twMerge(variant === 'desktop' ? 'grid gap-4' : 'grid gap-3')}>
		<div>
			<div
				class={twMerge(
					variant === 'desktop'
						? 'grid w-max max-h-[min(62dvh,560px)] grid-cols-[repeat(3,max-content)] items-start justify-start gap-x-8 overflow-y-auto pr-2'
						: 'grid gap-3',
				)}
			>
				{variant === 'mobile'
					? <MenuItemLink
							item={allLibrariesItem}
							onNavigate={onNavigate}
							variant="mobile"
							compact
						/>
					: null}
				{variant === 'desktop'
					? desktopLibraryMenuColumns.map(
							(columnGroups) =>
								<div
									key={columnGroups.map((group) => group.id).join('-')}
									class="grid content-start gap-y-5"
								>{columnGroups.map(
									(group) =>
										<LibraryMenuGroup
											key={group.id}
											group={group}
											onNavigate={onNavigate}
											variant="desktop"
										/>,
								)}</div>,
						)
					: libraryMenuGroups.map(
							(group) =>
								<LibraryMenuGroup
									key={group.id}
									group={group}
									onNavigate={onNavigate}
									variant="mobile"
								/>,
						)}
			</div>
		</div>
	</div>;
}

function LibraryMenuGroup({
	group,
	onNavigate,
	variant,
}: {
	group: ReturnType<typeof getLibraryMenuGroups>[number];
	onNavigate: () => void;
	variant: 'desktop' | 'mobile';
}) {
	const categorySlug = groupToSlug[group.id];

	return <section
		class={twMerge('break-inside-avoid', variant === 'desktop' ? '[break-inside:avoid]' : 'pb-3')}
	>
		<div class="mb-1.5 px-1">
			{variant === 'desktop'
				? <Link
						to="/stack/$category"
						params={{ category: categorySlug }}
						onClick={onNavigate}
						className="inline-flex rounded px-1 py-0.5 text-xs font-black uppercase text-gray-500 hover:bg-gray-500/10 hover:text-gray-950 focus:bg-gray-500/10 focus:text-gray-950 focus:outline-none dark:text-gray-400 dark:hover:text-white dark:focus:text-white"
						preload="intent"
					>{group.label}</Link>
				: <div
						class="px-1 py-0.5 text-xs font-black uppercase text-gray-500 dark:text-gray-400"
					>{group.label}</div>}
		</div>
		<div class="grid gap-0.5">{group.libraries.map(
			(library) => <LibraryMenuItem key={library.id} library={library} onNavigate={onNavigate} />,
		)}</div>
	</section>;
}

function LibraryMenuItem({
	library,
	onNavigate,
}: {
	library: NavigationLibrary;
	onNavigate: () => void;
}) {
	const name = getLibraryDisplayName(library);
	const docsTo = getLibraryDocsTo(library);

	return <div data-library-menu-item class="flex items-center gap-1.5">
		<Link
			to={library.to}
			onClick={onNavigate}
			className="group/library flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-2 text-sm font-black text-gray-900 hover:bg-gray-500/10 focus:bg-gray-500/10 focus:outline-none dark:text-gray-100"
			preload="intent"
		>
			<span
				class={twMerge('h-4 w-3.5 shrink-0 rounded-[5px] border border-white/30', library.bgStyle)}
			/>
			<span class="flex min-w-0 flex-1 items-center gap-1.5">
				<span class="min-w-0 truncate">{name}</span>
				{library.badge
					? <span
							data-library-badge
							class={twMerge(
								'invisible inline-flex shrink-0 rounded-md border border-current px-1.5 py-0.5 text-[0.58rem] font-black uppercase leading-none',
								'group-hover/library:visible group-focus-within/library:visible',
								library.textStyle,
							)}
						>{library.badge}</span>
					: null}
			</span>
		</Link>
		<div class="flex shrink-0 items-center gap-1">
			<Link
				to={docsTo}
				onClick={onNavigate}
				className="rounded-lg px-2 py-2 text-xs font-bold text-gray-600 hover:bg-gray-500/10 hover:text-gray-950 focus:bg-gray-500/10 focus:text-gray-950 focus:outline-none dark:text-gray-400 dark:hover:text-white dark:focus:text-white"
				preload="intent"
			>
				Docs
			</Link>
		</div>
	</div>;
}

function MerchMenuContent({
	onNavigate,
	variant,
}: {
	onNavigate: () => void;
	variant: 'desktop' | 'mobile';
}) {
	const rootRef = useRef<HTMLDivElement>(null);
	const [shouldLoad, setShouldLoad] = useState(false);
	const [products, setProducts] = useState<Array<ProductListItem>>([]);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		const root = rootRef.current;
		const triggerWrap =
			variant === 'desktop' ? root?.closest<HTMLElement>('.ts-mega-trigger-wrap') : null;
		const target = triggerWrap ?? root;

		if (!target) {
			return;
		}

		const load = () => {
			setShouldLoad(true);
		};

		target.addEventListener('pointerenter', load);
		target.addEventListener('focusin', load);

		return () => {
			target.removeEventListener('pointerenter', load);
			target.removeEventListener('focusin', load);
		};
	}, [variant]);

	useEffect(() => {
		if (!shouldLoad) {
			return;
		}

		let cancelled = false;

		async function loadProducts() {
			setLoading(true);

			try {
				const page = await getProducts({
					data: {
						first: MERCH_MENU_PRODUCT_COUNT,
						sortKey: 'CREATED_AT',
						reverse: true,
					},
				});

				if (!cancelled) {
					setProducts(page.nodes);
				}
			} catch {
				if (!cancelled) {
					setProducts([]);
				}
			} finally {
				if (!cancelled) {
					setLoading(false);
				}
			}
		}

		loadProducts();

		return () => {
			cancelled = true;
		};
	}, [shouldLoad]);

	const allMerchItem: NavMenuItem = {
		label: 'All Merch',
		to: '/shop',
		description: 'Browse all TanStack apparel, accessories, and stickers.',
		icon: ShoppingBag,
	};

	return <div ref={rootRef} class={twMerge(variant === 'desktop' ? 'grid gap-4' : 'grid gap-3')}>
		<section>
			<div class="mb-2 px-2 text-xs font-black uppercase text-gray-500 dark:text-gray-400">
				Recent Products
			</div>
			<div class={twMerge('grid gap-1', variant === 'desktop' && 'md:grid-cols-2')}>
				{shouldLoad && loading
					? Array.from(
							{ length: MERCH_MENU_PRODUCT_COUNT },
							(_, index) => <div
								key={index}
								class={twMerge(
									'rounded-lg px-2 py-1.5',
									variant === 'desktop'
										? 'flex w-44 items-center gap-2'
										: 'flex items-center gap-2',
								)}
								aria-hidden="true"
							>
								<div
									class={twMerge(
										'shrink-0 animate-pulse rounded-md bg-gray-200 dark:bg-gray-800',
										variant === 'desktop' ? 'h-10 w-10' : 'h-11 w-11',
									)}
								/>
								<div class="min-w-0 flex-1">
									<div class="h-3 w-3/4 animate-pulse rounded bg-gray-200 dark:bg-gray-800" />
									<div
										class="mt-1.5 h-2.5 w-1/3 animate-pulse rounded bg-gray-200 dark:bg-gray-800"
									/>
								</div>
							</div>,
						)
					: products.map(
							(product) =>
								<MerchProductLink
									key={product.id}
									product={product}
									onNavigate={onNavigate}
									variant={variant}
								/>,
						)}
			</div>
		</section>
		<MenuItemLink item={allMerchItem} onNavigate={onNavigate} variant={variant} compact />
	</div>;
}

function MerchProductLink({
	product,
	onNavigate,
	variant,
}: {
	product: ProductListItem;
	onNavigate: () => void;
	variant: 'desktop' | 'mobile';
}) {
	const image = product.featuredImage;
	const price = product.priceRange.minVariantPrice;

	return <Link
		to="/shop/products/$handle"
		params={{ handle: product.handle }}
		onClick={onNavigate}
		className={twMerge(
			'group flex items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-gray-500/10 focus:bg-gray-500/10 focus:outline-none',
			variant === 'desktop' && 'w-44',
			variant === 'mobile' && 'py-2',
		)}
		preload="intent"
	>
		<span
			class={twMerge(
				'block overflow-hidden rounded-md bg-gray-100 dark:bg-gray-900',
				variant === 'desktop' ? 'h-10 w-10 shrink-0' : 'h-11 w-11 shrink-0',
			)}
		>
			{image
				? <img
						src={shopifyImageUrl(image.url, { width: 160, format: 'webp' })}
						alt={image.altText ?? product.title}
						class="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
						loading="lazy"
					/>
				: <span class="flex h-full w-full items-center justify-center text-gray-400">
						<ShoppingBag className="h-5 w-5" />
					</span>}
		</span>
		<span class="block min-w-0">
			<span
				class="block truncate text-sm font-bold text-gray-950 dark:text-white"
			>{product.title}</span>
			<span class="mt-0.5 block text-xs text-gray-600 dark:text-gray-400">{formatMoney(
				price.amount,
				price.currencyCode,
			)}</span>
		</span>
	</Link>;
}

function MenuRail({
	rail,
	onNavigate,
	variant,
}: {
	rail: NonNullable<NavMenuGroup['rail']>;
	onNavigate: () => void;
	variant: 'desktop' | 'mobile';
}) {
	if (variant === 'mobile') {
		return <div class="pt-1">
			<MenuItemLink item={rail.item} onNavigate={onNavigate} variant="mobile" compact />
		</div>;
	}

	return <aside
		class="w-[260px] rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-950"
	>
		<div class="text-xs font-black uppercase text-gray-500 dark:text-gray-400">{rail.eyebrow}</div>
		<div class="mt-2 text-base font-black text-gray-950 dark:text-white">{rail.title}</div>
		<p class="mt-2 text-sm leading-6 text-gray-600 dark:text-gray-400">{rail.description}</p>
		<div class="mt-4">
			<MenuItemLink item={rail.item} onNavigate={onNavigate} variant="desktop" compact />
		</div>
	</aside>;
}

function MenuItemLink({
	item,
	onNavigate,
	variant,
	compact,
}: {
	item: NavMenuItem;
	onNavigate: () => void;
	variant: 'desktop' | 'mobile';
	compact?: boolean;
}) {
	const Icon = item.icon;
	const isExternal = isExternalLink(item.to);
	const className = twMerge(
		'group flex items-start gap-3 rounded-lg px-2 py-2.5 text-left',
		'hover:bg-gray-500/10 focus:bg-gray-500/10 focus:outline-none',
		compact && 'bg-white dark:bg-black/40',
		variant === 'desktop' && !compact && 'w-[260px]',
		variant === 'mobile' && 'px-2 py-3',
	);
	const content = <>
		{Icon
			? <span
					class="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-gray-100 text-gray-700 dark:bg-gray-900 dark:text-gray-300"
				>
					<Icon className="h-4 w-4" />
				</span>
			: null}
		<span class="min-w-0 flex-1">
			<span class="flex items-center gap-2">
				<span class="font-bold text-gray-950 dark:text-white">{item.label}</span>
				{item.badge
					? <span
							class="rounded-md border border-green-500/50 px-1.5 py-0.5 text-[0.6rem] font-black uppercase leading-none text-green-600 dark:text-green-400"
						>{item.badge}</span>
					: null}
				{isExternal && !item.to.startsWith('mailto:')
					? <ExternalLink
							className="h-3 w-3 text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-300"
						/>
					: null}
			</span>
			{item.description
				? <span
						class={twMerge(
							'mt-0.5 block text-gray-600 dark:text-gray-400',
							variant === 'desktop' ? 'text-xs leading-4' : 'text-sm leading-5',
						)}
					>{item.description}</span>
				: null}
		</span>
	</>;

	if (isExternal) {
		return <a
			href={item.to}
			target={item.to.startsWith('mailto:') ? undefined : '_blank'}
			rel={item.to.startsWith('mailto:') ? undefined : 'noopener noreferrer'}
			class={className}
			onClick={onNavigate}
		>{content}</a>;
	}

	return <Link
		to={item.to}
		hash={item.hash}
		className={className}
		onClick={onNavigate}
		preload="intent"
	>{content}</Link>;
}

const SOCIAL_LINKS = [
	{
		label: 'GitHub',
		href: 'https://github.com/TanStack',
		Icon: GithubIcon,
	},
	{
		label: 'Discord',
		href: 'https://tlinz.com/discord',
		Icon: DiscordIcon,
	},
	{
		label: 'YouTube',
		href: 'https://youtube.com/@tan_stack',
		Icon: YouTubeIcon,
	},
	{
		label: 'X (Twitter)',
		href: 'https://x.com/tan_stack',
		Icon: BrandXIcon,
	},
	{
		label: 'Bluesky',
		href: 'https://bsky.app/profile/tanstack.com',
		Icon: BSkyIcon,
	},
	{
		label: 'Instagram',
		href: 'https://instagram.com/tan_stack',
		Icon: InstagramIcon,
	},
] as const;

function SocialStack() {
	const stackTop = SOCIAL_LINKS.slice(0, 3);

	return <Dropdown>
		<DropdownTrigger>
			<button
				type="button"
				aria-label="TanStack social channels"
				title="Social channels"
				class="inline-flex h-9 items-center px-0"
			>
				<span class="relative inline-flex items-center">{stackTop.map(
					({ label, Icon }, i) => <span
						key={label}
						class={twMerge(
							'inline-flex h-7 w-7 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-600 shadow-sm transition-transform dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300',
							i > 0 && '-ml-3',
						)}
						style={{ zIndex: stackTop.length - i }}
					>
						<Icon className="h-3 w-3" />
					</span>,
				)}</span>
			</button>
		</DropdownTrigger>
		<DropdownContent align="end" sideOffset={8} className="min-w-44">{SOCIAL_LINKS.map(
			({ label, href, Icon }) => <DropdownItem key={href} asChild>
				<a
					href={href}
					target="_blank"
					rel="noopener noreferrer"
					aria-label={`TanStack on ${label}`}
				>
					<Icon className="h-3.5 w-3.5" />
					<span>{label}</span>
				</a>
			</DropdownItem>,
		)}</DropdownContent>
	</Dropdown>;
}
