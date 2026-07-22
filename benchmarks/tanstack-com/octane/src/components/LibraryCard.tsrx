import { Link, useParams } from '@octanejs/tanstack-router';
import { type Library } from '~/libraries';
import { frameworkOptions } from '~/libraries/frameworks';
import { twMerge } from 'tailwind-merge';

export default function LibraryCard({
	library,
	index = 0,
	isGeneric = false,
	namePrefix,
}: {
	library: Library;
	index?: number;
	isGeneric?: boolean;
	namePrefix?: string;
}) {
	const isExternal = library.to?.startsWith('http');
	const Component = isExternal ? 'a' : Link;
	const props = isExternal
		? { href: library.to, target: '_blank', rel: 'noopener noreferrer' }
		: { to: library.to ?? '#' };
	const params = useParams({ strict: false });
	const frameworkPrefix =
		namePrefix ?? frameworkOptions.find((framework) => framework.value === params.framework)?.label;

	const hasTanStackPrefix = library.name.startsWith('TanStack ');
	const nameWithoutPrefix = library.name.replace('TanStack ', '');
	const displayName = frameworkPrefix
		? `${frameworkPrefix}-${nameWithoutPrefix}`
		: nameWithoutPrefix;

	return <Component
		key={library.id}
		{...props}
		className={twMerge(
			'p-8 relative group z-0 min-h-[250px] xl:min-h-[220px] shadow-sm hover:shadow-none bg-white dark:bg-gray-900',

			'transition-all duration-300 ease-out',

			'rounded-xl border border-gray-200 dark:border-gray-800 hover:border-current/50',

			isGeneric
				? 'text-slate-500 dark:text-slate-400 before:bg-slate-500/20 dark:before:bg-slate-400/20'
				: 'before:bg-current',
			'before:content-[""] before:absolute before:inset-0 before:blur-xl before:opacity-0 hover:before:opacity-20 before:transition-all before:duration-300 before:ease-out',

			'after:absolute after:inset-0 after:-z-10 after:bg-white dark:after:bg-gray-900 after:backdrop-blur-sm after:rounded-xl',

			'hover:-translate-y-1',
			!isGeneric && library.cardStyles,
		)}
		style={{
			zIndex: index,
			willChange: 'transform',
		}}
	>
		{}
		<div class="z-0 relative group-hover:blur-[0.5px] transition-[filter] duration-300 ease-out">
			<div class="flex gap-2 justify-between items-center">
				<div
					class={twMerge(
						`flex items-center gap-2 text-[1.2rem] font-extrabold uppercase [letter-spacing:-.04em]`,
					)}
					style={{
						viewTransitionName: `library-name-${library.id}`,
					}}
				>
					{hasTanStackPrefix
						? <>
								<span
									class={twMerge(
										'rounded-lg leading-none flex items-center',
										isGeneric ? 'bg-slate-500 dark:bg-slate-400' : 'bg-current',
									)}
								>
									<span
										class="text-white dark:text-black text-xs leading-none p-1.5 px-2 uppercase"
									>
										TanStack
									</span>
								</span>
								<span
									class={isGeneric ? 'text-slate-500 dark:text-slate-400' : 'text-current'}
								>{displayName as string}</span>
							</>
						: <span
								class={isGeneric ? 'text-slate-500 dark:text-slate-400' : 'text-current'}
							>{displayName as string}</span>}
				</div>
			</div>
			<div
				class={twMerge(
					`text-sm italic font-medium mt-3`,
					isGeneric ? 'text-slate-500 dark:text-slate-400' : 'text-current',
				)}
			>{library.tagline as string}</div>

			{/* Description preview with ellipsis */}
			<div
				class={`text-sm mt-3 text-gray-600 dark:text-gray-400 line-clamp-3 leading-relaxed`}
			>{library.description as string}</div>
		</div>

		{/* Foreground content that appears on hover */}
		<div
			class="absolute inset-0 z-30 bg-white/95 dark:bg-black/95 p-6 rounded-xl
                    backdrop-blur-sm flex flex-col justify-center opacity-0 group-hover:opacity-100
                    transition-opacity duration-300 ease-out pointer-events-none group-hover:pointer-events-auto"
		>
			<div
				class={`text-sm text-gray-800 dark:text-gray-200 leading-relaxed`}
			>{library.description as string}</div>
			<div class="mt-6 text-center">
				<span
					class="inline-flex items-center gap-2 px-4 py-2 bg-black/5 dark:bg-white/10 
                        rounded-full text-sm font-medium text-gray-900 dark:text-white"
				>
					Click to learn more
					<svg
						class="w-4 h-4 transform transition-transform duration-200 group-hover:translate-x-0.5"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
					>
						<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
					</svg>
				</span>
			</div>
		</div>
		{/* Badge */}
		{library.badge && !isGeneric
			? <div
					class={twMerge(
						`absolute -top-2 -right-2 z-40 px-2 py-1 rounded-md`,
						['bg-linear-to-r', library.colorFrom, library.colorTo],
						'uppercase font-black italic text-xs',
						library.badgeTextStyle ?? 'text-white',
					)}
					style={{
						animation: 'pulseScale 3s infinite',
						animationTimingFunction: 'ease-in-out',
						animationDelay: `${index * 0.5}s`,
						['--scale-factor' as any]: '1.1',
					}}
				>
					<span>{library.badge as string}</span>
				</div>
			: null}
	</Component>;
}
