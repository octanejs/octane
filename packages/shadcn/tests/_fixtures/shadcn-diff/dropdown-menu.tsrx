import {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuShortcut,
	DropdownMenuTrigger,
} from '@octanejs/shadcn/DropdownMenu';
import { useState } from 'octane';

export function DropdownApp() @{
	const [checked, setChecked] = useState(false);
	const [last, setLast] = useState('none');
	<div>
		<DropdownMenu modal={false}>
			<DropdownMenuTrigger id="mt">Open menu</DropdownMenuTrigger>
			<DropdownMenuContent onFocusOutside={(event: Event) => event.preventDefault()}>
				<DropdownMenuLabel inset>Actions</DropdownMenuLabel>
				<DropdownMenuGroup>
					<DropdownMenuItem id="mi-copy" onSelect={() => setLast('copy')}>
						Copy
						<DropdownMenuShortcut>⌘C</DropdownMenuShortcut>
					</DropdownMenuItem>
					<DropdownMenuItem id="mi-del" variant="destructive" disabled>Delete</DropdownMenuItem>
				</DropdownMenuGroup>
				<DropdownMenuSeparator />
				<DropdownMenuCheckboxItem id="mi-check" checked={checked} onCheckedChange={setChecked}>
					Notifications
				</DropdownMenuCheckboxItem>
			</DropdownMenuContent>
		</DropdownMenu>
		<span id="dd-state">{'checked:' + checked + ' last:' + last}</span>
	</div>
}
