import { useState } from 'octane';
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectLabel,
	SelectTrigger,
	SelectValue,
} from '@octanejs/shadcn/base-ui/Select';
import {
	NavigationMenu,
	NavigationMenuContent,
	NavigationMenuItem,
	NavigationMenuLink,
	NavigationMenuList,
	NavigationMenuTrigger,
} from '@octanejs/shadcn/base-ui/NavigationMenu';
import { ScrollArea, ScrollBar } from '@octanejs/shadcn/base-ui/ScrollArea';

export function SelectExample() @{
	const [value, setValue] = useState<string | null>('apple');
	<form>
		<Select
			name="fruit"
			value={value}
			onValueChange={setValue}
			items={{ apple: 'Apple', pear: 'Pear' }}
		>
			<SelectTrigger id="fruit-trigger" aria-label="Fruit" size="sm">
				<SelectValue />
			</SelectTrigger>
			<SelectContent alignItemWithTrigger={false}>
				<SelectGroup>
					<SelectLabel>Fruit</SelectLabel>
					<SelectItem value="apple">Apple</SelectItem>
					<SelectItem value="pear">Pear</SelectItem>
				</SelectGroup>
			</SelectContent>
		</Select>
		<output id="selected-fruit">{value as string}</output>
		<button id="choose-pear" type="button" onClick={() => setValue('pear')}>Choose pear</button>
	</form>
}

export function NavigationExample() @{
	<NavigationMenu>
		<NavigationMenuList>
			<NavigationMenuItem value="docs">
				<NavigationMenuTrigger id="docs-trigger">Docs</NavigationMenuTrigger>
				<NavigationMenuContent>
					<NavigationMenuLink href="#guide">Guide</NavigationMenuLink>
				</NavigationMenuContent>
			</NavigationMenuItem>
			<NavigationMenuItem>
				<NavigationMenuLink id="home-link" href="#home" active>Home</NavigationMenuLink>
			</NavigationMenuItem>
		</NavigationMenuList>
	</NavigationMenu>
}

export function ScrollExample() @{
	<ScrollArea id="scroll-example" className="h-24 w-40">
		<p>Scrollable content</p>
		<ScrollBar orientation="horizontal" keepMounted />
	</ScrollArea>
}
