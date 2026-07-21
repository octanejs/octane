import { Check, ChevronsUpDown } from '@octanejs/lucide';
import { twMerge } from 'tailwind-merge';
import {
	Dropdown,
	DropdownContent,
	DropdownItem,
	DropdownSeparator,
	DropdownTrigger,
} from '~/components/Dropdown.tsrx';
import { findMaintainerByAuthorName } from '~/utils/authors';
import authorFallbackAvatar from '~/images/author-fallback.svg';

function getAuthorAvatar(name: string): string {
	return findMaintainerByAuthorName(name)?.avatar ?? authorFallbackAvatar;
}

type BlogAuthorFilterProps = {
	authors: string[];
	selected: string | undefined;
	onSelect: (author: string | undefined) => void;
	className?: string;
};

export function BlogAuthorFilter({
	authors,
	selected,
	onSelect,
	className,
}: BlogAuthorFilterProps) {
	// Ignore URL values that don't correspond to a real author in the list.
	const activeAuthor =
		selected && authors.includes(selected) ? selected : undefined;

	return <div class={twMerge('w-full', className)}>
		<Dropdown>
			<DropdownTrigger>
				<button
					type="button"
					class={twMerge(
						'relative w-full flex items-center gap-2 rounded-md py-1.5 px-2 text-left text-sm cursor-pointer transition-colors',
						'focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
						activeAuthor
							? 'bg-blue-50 dark:bg-blue-950/40 ring-1 ring-blue-500/50 text-blue-700 dark:text-blue-200'
							: 'hover:bg-gray-500/10',
					)}
				>
					<span
						class={twMerge(
							'flex items-center justify-center w-6 h-6 rounded border overflow-hidden shrink-0',
							activeAuthor ? 'border-blue-500/30' : 'border-gray-500/20',
						)}
					>
						<img
							height={20}
							width={20}
							src={activeAuthor ? getAuthorAvatar(activeAuthor) : authorFallbackAvatar}
							alt=""
							class="w-full h-full object-cover"
						/>
					</span>
					<span class="truncate font-medium flex-1">{activeAuthor ?? 'All authors' as string}</span>
					<span class="flex items-center pr-1">
						<ChevronsUpDown className="h-4 w-4 opacity-40" aria-hidden="true" />
					</span>
				</button>
			</DropdownTrigger>
			<DropdownContent align="start" className="max-h-80 overflow-auto min-w-[16rem]">
				<DropdownItem
					onSelect={() => onSelect(undefined)}
					className={twMerge(
						'pr-8 relative',
						!activeAuthor
							? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-200 font-medium'
							: 'font-normal',
					)}
				>
					<span class="truncate">All authors</span>
					{!activeAuthor
						? <Check
								className="h-4 w-4 absolute right-2 text-blue-600 dark:text-blue-300"
								aria-hidden="true"
							/>
						: null}
				</DropdownItem>
				{authors.length > 0 ? <DropdownSeparator /> : null}
				{authors.map((name) => {
					const isSelected = activeAuthor === name;
					return <DropdownItem
						key={name}
						onSelect={() => onSelect(name)}
						className={twMerge(
							'pr-8 pl-2 relative',
							isSelected
								? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-200 font-medium'
								: 'font-normal',
						)}
					>
						<img
							height={20}
							width={20}
							src={getAuthorAvatar(name)}
							alt=""
							class="w-5 h-5 rounded object-cover shrink-0"
						/>
						<span class="truncate">{name as string}</span>
						{isSelected
							? <Check
									className="h-4 w-4 absolute right-2 text-blue-600 dark:text-blue-300"
									aria-hidden="true"
								/>
							: null}
					</DropdownItem>;
				})}
			</DropdownContent>
		</Dropdown>
	</div>;
}
