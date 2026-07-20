import { useQuery } from '@tanstack/react-query';
import { Download, Star } from 'lucide-react';
import type * as React from 'react';
import type { Library } from '~/libraries';
import { ossStatsQuery } from '~/queries/stats';

interface LibraryStatsSectionProps {
	library: Library;
}

function isValidMetric(value: number | undefined | null): value is number {
	return value !== undefined && value !== null && value > 0 && Number.isFinite(value);
}

function LibraryPlainStat({
	href,
	icon,
	label,
	value,
}: {
	href: string;
	icon: React.ReactNode;
	label: string;
	value: number | undefined;
}) {
	const hasValue = isValidMetric(value);

	return (
		<a
			href={href}
			target="_blank"
			rel="noreferrer"
			className="group inline-flex items-baseline gap-2 text-left"
			aria-label={`${hasValue ? value.toLocaleString() : '0'} ${label}`}
		>
			<span className="text-zinc-500 transition-colors group-hover:text-zinc-950 dark:text-zinc-500 dark:group-hover:text-white">
				{icon}
			</span>
			<span
				className="text-xl font-black text-zinc-950 transition-colors group-hover:text-zinc-700 dark:text-white dark:group-hover:text-zinc-200"
				style={{ fontVariantNumeric: 'tabular-nums' }}
			>
				{hasValue ? value.toLocaleString() : '0'}
			</span>
			<span className="text-sm font-bold text-zinc-500 transition-colors group-hover:text-zinc-700 dark:text-zinc-400 dark:group-hover:text-zinc-200">
				{label}
			</span>
		</a>
	);
}

export function LibraryStatsSection({ library }: LibraryStatsSectionProps) {
	const { data: stats } = useQuery(ossStatsQuery({ library }));

	return (
		<div className="mx-auto w-full max-w-[80rem] px-4 xl:max-w-[92rem]">
			<div className="flex flex-col items-start gap-3 sm:flex-row sm:flex-wrap sm:gap-6">
				<LibraryPlainStat
					href="https://www.npmjs.com/org/tanstack"
					icon={<Download size={18} aria-hidden="true" />}
					label="NPM Downloads"
					value={stats?.npm?.totalDownloads}
				/>
				<LibraryPlainStat
					href={`https://github.com/${library.repo}`}
					icon={<Star size={18} aria-hidden="true" />}
					label="GitHub Stars"
					value={stats?.github?.starCount}
				/>
			</div>
		</div>
	);
}
