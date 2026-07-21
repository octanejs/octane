import { twMerge } from 'tailwind-merge';
import type { LibrarySlim } from '~/libraries';

type LibraryWordmarkProps = {
	className?: string;
	colorProduct?: boolean;
	includeTanStack?: boolean;
	library: Pick<LibrarySlim, 'colorFrom' | 'colorTo' | 'name'>;
	productClassName?: string;
	tanStackClassName?: string;
};

export function LibraryWordmark({
	className,
	colorProduct = true,
	includeTanStack = true,
	library,
	productClassName,
	tanStackClassName,
}: LibraryWordmarkProps) {
	const productName = library.name.replace(/^TanStack\s+/i, '');

	return <span
		class={twMerge(
			'inline-flex flex-wrap items-baseline gap-x-[0.22em] gap-y-1 font-black uppercase leading-none [letter-spacing:-.05em]',
			className,
		)}
	>
		{includeTanStack
			? <span class={twMerge('inline-block', tanStackClassName)}>TanStack</span>
			: null}
		<span
			class={twMerge(
				'inline-block pr-1',
				colorProduct
					? `bg-linear-to-r bg-clip-text text-transparent ${library.colorFrom} ${library.colorTo}`
					: '',
				productClassName,
			)}
		>
			{productName as string}
		</span>
	</span>;
}
