import * as React from 'react';
import { useDebouncedValue } from '@tanstack/react-pacer';
import { Search } from 'lucide-react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Command } from 'cmdk';
import { twMerge } from 'tailwind-merge';
import { Spinner } from '~/components/Spinner';

type NpmSearchResult = {
	name: string;
	description?: string;
	version?: string;
	publisher?: { username?: string };
};

const CREATE_ITEM_VALUE = '__create__';
const MIN_SEARCH_QUERY_LENGTH = 2;

export type PackageSearchProps = {
	onSelect: (packageName: string) => void;
	placeholder?: string;
	autoFocus?: boolean;
};

export function PackageSearch({
	onSelect,
	placeholder = 'Search for a package...',
	autoFocus = false,
}: PackageSearchProps) {
	const [inputValue, setInputValue] = React.useState('');
	const [open, setOpen] = React.useState(false);
	const containerRef = React.useRef<HTMLDivElement>(null);

	const [debouncedInputValue] = useDebouncedValue(inputValue, {
		wait: 150,
	});

	React.useEffect(() => {
		const handleClickOutside = (event: MouseEvent) => {
			if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
				setOpen(false);
			}
		};

		document.addEventListener('mousedown', handleClickOutside);
		return () => {
			document.removeEventListener('mousedown', handleClickOutside);
		};
	}, []);

	const trimmedInput = debouncedInputValue.trim();
	const hasUsableQuery = trimmedInput.length >= MIN_SEARCH_QUERY_LENGTH;

	const searchQuery = useQuery({
		queryKey: ['npm-search', trimmedInput],
		queryFn: async () => {
			const response = await fetch(
				`https://registry.npmjs.org/-/v1/search?text=${encodeURIComponent(trimmedInput)}&size=10`,
			);
			const data = (await response.json()) as {
				objects: Array<{ package: NpmSearchResult }>;
			};
			return data.objects.map((r) => r.package);
		},
		enabled: hasUsableQuery,
		placeholderData: keepPreviousData,
	});

	const searchResults = hasUsableQuery ? (searchQuery.data ?? []) : [];
	const showCreateItem =
		hasUsableQuery &&
		trimmedInput.length > 0 &&
		!searchResults.some((d) => d.name === trimmedInput);

	const handleSelect = (value: string) => {
		if (value === CREATE_ITEM_VALUE) {
			if (!trimmedInput) return;
			onSelect(trimmedInput);
		} else {
			const match = searchResults.find((item) => item.name === value);
			if (!match) return;
			onSelect(match.name);
		}
		setInputValue('');
		setOpen(false);
	};

	const showList = open && inputValue.length > 0;

	return (
		<div className="relative w-full max-w-[250px]" ref={containerRef}>
			<Command className="w-full" shouldFilter={false} loop label="Search npm packages">
				<div className="relative text-xs">
					<Search className="pointer-events-none absolute left-1.5 top-1/2 size-3.5 -translate-y-1/2 text-gray-500" />
					<Command.Input
						placeholder={placeholder}
						className="h-6 w-full min-w-[180px] rounded bg-gray-500/10 py-0.5 pl-6 pr-6 text-xs outline-none"
						value={inputValue}
						onValueChange={setInputValue}
						onFocus={() => setOpen(true)}
						// eslint-disable-next-line jsx-a11y/no-autofocus
						autoFocus={autoFocus}
					/>
					{searchQuery.isFetching && (
						<div className="pointer-events-none absolute bottom-0 right-1.5 top-0 flex items-center justify-center">
							<Spinner className="text-xs" />
						</div>
					)}
				</div>
				<Command.List
					className={twMerge(
						'absolute z-10 mt-1 max-h-56 w-full overflow-auto rounded bg-white text-xs shadow-lg divide-y divide-gray-500/10 dark:bg-gray-800',
						!showList && 'hidden',
					)}
				>
					{inputValue.trim().length < MIN_SEARCH_QUERY_LENGTH ? (
						<div className="px-2 py-1.5 text-gray-500 dark:text-gray-400">
							Keep typing to search...
						</div>
					) : searchQuery.isLoading ? (
						<div className="px-2 py-1.5 text-gray-500 dark:text-gray-400">Searching...</div>
					) : !searchResults.length && !showCreateItem ? (
						<div className="px-2 py-1.5 text-gray-500 dark:text-gray-400">No packages found</div>
					) : null}
					{showCreateItem && (
						<Command.Item
							key={CREATE_ITEM_VALUE}
							value={CREATE_ITEM_VALUE}
							onSelect={handleSelect}
							className="cursor-pointer px-2 py-1.5 hover:bg-gray-500/20 data-[selected=true]:bg-gray-500/20"
						>
							<div className="font-medium">Use "{trimmedInput}"</div>
						</Command.Item>
					)}
					{searchResults.map((item) => (
						<Command.Item
							key={item.name}
							value={item.name}
							onSelect={handleSelect}
							className="cursor-pointer px-2 py-1.5 hover:bg-gray-500/20 data-[selected=true]:bg-gray-500/20"
						>
							<div className="font-medium">{item.name}</div>
							{item.description ? (
								<div className="text-[11px] leading-snug text-gray-500 dark:text-gray-400">
									{item.description}
								</div>
							) : null}
							<div className="text-[10px] leading-snug text-gray-400 dark:text-gray-500">
								{item.version ? `v${item.version}` : ''}
								{item.version && item.publisher?.username ? ' • ' : ''}
								{item.publisher?.username}
							</div>
						</Command.Item>
					))}
				</Command.List>
			</Command>
		</div>
	);
}
