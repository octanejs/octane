import { Check, ChevronsUpDown } from '@octanejs/lucide';
import { twMerge } from 'tailwind-merge';
import { Dropdown, DropdownTrigger, DropdownContent, DropdownItem } from './Dropdown.tsrx';

export type SelectOption = {
	label: string;
	value: string;
	logo?: string;
};

export type SelectProps<T extends SelectOption> = {
	className?: string;
	icon?: any;
	selected: string;
	available: T[];
	onSelect: (selected: T) => void;
};

export function Select<T extends SelectOption>({
	className = '',
	icon,
	selected,
	available,
	onSelect,
}: SelectProps<T>) {
	if (available.length === 0) {
		return null;
	}

	const selectedOption = available.find(({ value }) => selected === value);

	if (!selectedOption) {
		return null;
	}

	return <div class={twMerge('w-full', className)}>
		<Dropdown>
			<DropdownTrigger>
				<button
					type="button"
					class="relative items-center w-full gap-2 flex hover:bg-gray-500/10 cursor-pointer rounded-md py-1.5 px-2 text-left focus:outline-none text-sm"
				>
					{icon
						? <span
								class="flex items-center justify-center w-6 h-6 rounded border border-gray-500/20"
							>{icon}</span>
						: selectedOption.logo
							? <span
									class="flex items-center justify-center w-6 h-6 rounded border border-gray-500/20"
								>
									<img
										height={16}
										width={16}
										src={selectedOption.logo}
										alt={`${selectedOption.label} logo`}
									/>
								</span>
							: null}
					<span class="truncate font-medium">
						{selectedOption.label as string}
					</span>
					<span class="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
						<ChevronsUpDown className="h-4 w-4 opacity-40" aria-hidden="true" />
					</span>
				</button>
			</DropdownTrigger>
			<DropdownContent align="start" className="max-h-80 overflow-auto">{available.map(
				(option) => <DropdownItem
					key={option.value}
					onSelect={() => onSelect(option)}
					className={twMerge(
						'pr-8',
						option.logo ? 'pl-2' : '',
						selected === option.value ? 'font-medium' : 'font-normal',
					)}
				>
					{option.logo
						? <img
								height={18}
								width={18}
								src={option.logo}
								alt={`${option.label} logo`}
								class="shrink-0"
							/>
						: null}
					<span class="truncate">
						{option.label as string}
					</span>
					{selected === option.value
						? <Check
								className="h-4 w-4 absolute right-2 text-gray-800 dark:text-gray-400"
								aria-hidden="true"
							/>
						: null}
				</DropdownItem>,
			)}</DropdownContent>
		</Dropdown>
	</div>;
}
