import { useState, createElement } from 'octane';
import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from '@/components/ui/accordion.tsrx';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert.tsrx';
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from '@/components/ui/alert-dialog.tsrx';
import { AspectRatio } from '@/components/ui/aspect-ratio.tsrx';
import {
	ContextMenu,
	ContextMenuCheckboxItem,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuLabel,
	ContextMenuSeparator,
	ContextMenuShortcut,
	ContextMenuTrigger,
} from '@/components/ui/context-menu.tsrx';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card.tsrx';
import {
	Menubar,
	MenubarContent,
	MenubarItem,
	MenubarMenu,
	MenubarSeparator,
	MenubarShortcut,
	MenubarTrigger,
} from '@/components/ui/menubar.tsrx';
import {
	NavigationMenu,
	NavigationMenuContent,
	NavigationMenuItem,
	NavigationMenuLink,
	NavigationMenuList,
	NavigationMenuTrigger,
} from '@/components/ui/navigation-menu.tsrx';
import { Avatar, AvatarFallback, AvatarGroup, AvatarGroupCount } from '@/components/ui/avatar.tsrx';
import { Badge } from '@/components/ui/badge.tsrx';
import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbList,
	BreadcrumbPage,
	BreadcrumbSeparator,
} from '@/components/ui/breadcrumb.tsrx';
import { Button } from '@/components/ui/button.tsrx';
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '@/components/ui/card.tsrx';
import { Checkbox } from '@/components/ui/checkbox.tsrx';
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from '@/components/ui/collapsible.tsrx';
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from '@/components/ui/dialog.tsrx';
import {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu.tsrx';
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from '@/components/ui/empty.tsrx';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field.tsrx';
import { Input } from '@/components/ui/input.tsrx';
import { Item, ItemContent, ItemDescription, ItemTitle } from '@/components/ui/item.tsrx';
import { Kbd, KbdGroup } from '@/components/ui/kbd.tsrx';
import { Label } from '@/components/ui/label.tsrx';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select.tsrx';
import {
	Pagination,
	PaginationContent,
	PaginationItem,
	PaginationLink,
	PaginationNext,
	PaginationPrevious,
} from '@/components/ui/pagination.tsrx';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover.tsrx';
import { Progress } from '@/components/ui/progress.tsrx';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group.tsrx';
import { ScrollArea } from '@/components/ui/scroll-area.tsrx';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select.tsrx';
import { Separator } from '@/components/ui/separator.tsrx';
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
	SheetTrigger,
} from '@/components/ui/sheet.tsrx';
import { Skeleton } from '@/components/ui/skeleton.tsrx';
import { Slider } from '@/components/ui/slider.tsrx';
import { Toaster } from '@/components/ui/sonner.tsrx';
import { toast } from '@octanejs/sonner';
import { Spinner } from '@/components/ui/spinner.tsrx';
import { Switch } from '@/components/ui/switch.tsrx';
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@/components/ui/table.tsrx';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs.tsrx';
import { Textarea } from '@/components/ui/textarea.tsrx';
import { Toggle } from '@/components/ui/toggle.tsrx';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group.tsrx';
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from '@/components/ui/tooltip.tsrx';

// The full shadcn-on-octane gallery: every registry-installed component family
// in one grid, app-owned sources (registry mode), Tailwind classes only.
export function ShadcnDemo() @{
	const [statusBar, setStatusBar] = useState(false);
	const [agreed, setAgreed] = useState(false);
	const [notifications, setNotifications] = useState(true);
	const [lastAction, setLastAction] = useState('none');

	<div class="flex flex-col gap-4">
		<div>
			<h2 class="demo-title">{'shadcn/ui on octane — component gallery'}</h2>
			<p class="demo-blurb">
				{'All registry-installed families, app-owned sources. last action: ' + lastAction}
			</p>
		</div>

		<div class="columns-1 gap-4 md:columns-2 xl:columns-3 [&>*]:mb-4 [&>*]:break-inside-avoid">
			<Card>
				<CardHeader>
					<CardTitle>{'Button'}</CardTitle>
				</CardHeader>
				<CardContent className="flex flex-wrap items-center gap-2">
					<Button onClick={() => setLastAction('default')}>{'Default'}</Button>
					<Button variant="secondary">{'Secondary'}</Button>
					<Button variant="outline">{'Outline'}</Button>
					<Button variant="destructive">{'Destructive'}</Button>
					<Button variant="ghost">{'Ghost'}</Button>
					<Button variant="link">{'Link'}</Button>
					<Button variant="outline" disabled>{'Disabled'}</Button>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>{'Badge'}</CardTitle>
				</CardHeader>
				<CardContent className="flex flex-wrap items-center gap-2">
					<Badge>{'Default'}</Badge>
					<Badge variant="secondary">{'Secondary'}</Badge>
					<Badge variant="outline">{'Outline'}</Badge>
					<Badge variant="destructive">{'Destructive'}</Badge>
					<Badge variant="ghost">{'Ghost'}</Badge>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>{'Inputs'}</CardTitle>
				</CardHeader>
				<CardContent className="flex flex-col gap-3">
					<Input placeholder="Your name" aria-label="Name" />
					<Textarea placeholder="Message" aria-label="Message" />
					<NativeSelect aria-label="Fruit">
						<NativeSelectOption value="apple">Apple</NativeSelectOption>
						<NativeSelectOption value="banana">Banana</NativeSelectOption>
					</NativeSelect>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>{'Selection controls'}</CardTitle>
				</CardHeader>
				<CardContent className="flex flex-col gap-4">
					<div class="flex items-center gap-2">
						<Checkbox
							id="agree"
							checked={agreed}
							onCheckedChange={(v: boolean) => setAgreed(v === true)}
						/>
						<Label htmlFor="agree">{'Agree: ' + (agreed ? 'yes' : 'no')}</Label>
					</div>
					<RadioGroup defaultValue="a" aria-label="Options">
						<div class="flex items-center gap-2">
							<RadioGroupItem value="a" id="ra" />
							<Label htmlFor="ra">{'Option A'}</Label>
						</div>
						<div class="flex items-center gap-2">
							<RadioGroupItem value="b" id="rb" />
							<Label htmlFor="rb">{'Option B'}</Label>
						</div>
					</RadioGroup>
					<div class="flex items-center gap-2">
						<Switch
							id="notif"
							checked={notifications}
							onCheckedChange={(v: boolean) => setNotifications(v)}
						/>
						<Label htmlFor="notif">{'Notifications ' + (notifications ? 'on' : 'off')}</Label>
					</div>
					<Slider defaultValue={[40]} max={100} step={1} aria-label="Volume" />
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>{'Tabs & toggles'}</CardTitle>
				</CardHeader>
				<CardContent className="flex flex-col gap-3">
					<Tabs defaultValue="account">
						<TabsList>
							<TabsTrigger value="account">{'Account'}</TabsTrigger>
							<TabsTrigger value="password">{'Password'}</TabsTrigger>
						</TabsList>
						<TabsContent value="account">{'Account settings live here.'}</TabsContent>
						<TabsContent value="password">{'Change your password here.'}</TabsContent>
					</Tabs>
					<div class="flex items-center gap-2">
						<Toggle aria-label="Bold">{'B'}</Toggle>
						<ToggleGroup type="single" defaultValue="center" variant="outline" aria-label="Align">
							<ToggleGroupItem value="left">{'L'}</ToggleGroupItem>
							<ToggleGroupItem value="center">{'C'}</ToggleGroupItem>
							<ToggleGroupItem value="right">{'R'}</ToggleGroupItem>
						</ToggleGroup>
					</div>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>{'Select'}</CardTitle>
				</CardHeader>
				<CardContent>
					<Select defaultValue="banana">
						{createElement(
							SelectTrigger,
							{ className: 'w-full', 'aria-label': 'Fruit select' },
							createElement(SelectValue, { placeholder: 'Pick a fruit' }),
						)}
						<SelectContent>
							<SelectItem value="apple">{'Apple'}</SelectItem>
							<SelectItem value="banana">{'Banana'}</SelectItem>
							<SelectItem value="cherry">{'Cherry'}</SelectItem>
						</SelectContent>
					</Select>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>{'Overlays'}</CardTitle>
				</CardHeader>
				<CardContent className="flex flex-wrap gap-2">
					<Dialog>
						{createElement(
							DialogTrigger,
							{ asChild: true },
							createElement(Button, { variant: 'outline' }, 'Dialog'),
						)}
						<DialogContent>
							<DialogHeader>
								<DialogTitle>{'Dialog title'}</DialogTitle>
								<DialogDescription>{'Composed through the portal.'}</DialogDescription>
							</DialogHeader>
							<DialogFooter showCloseButton={true} />
						</DialogContent>
					</Dialog>
					<AlertDialog>
						{createElement(
							AlertDialogTrigger,
							{ asChild: true },
							createElement(Button, { variant: 'outline' }, 'Alert dialog'),
						)}
						<AlertDialogContent>
							<AlertDialogHeader>
								<AlertDialogTitle>{'Delete item?'}</AlertDialogTitle>
								<AlertDialogDescription>{'This action cannot be undone.'}</AlertDialogDescription>
							</AlertDialogHeader>
							<AlertDialogFooter>
								<AlertDialogCancel>{'Cancel'}</AlertDialogCancel>
								<AlertDialogAction
									variant="destructive"
									onClick={() => setLastAction('deleted')}
								>{'Delete'}</AlertDialogAction>
							</AlertDialogFooter>
						</AlertDialogContent>
					</AlertDialog>
					<Sheet>
						{createElement(
							SheetTrigger,
							{ asChild: true },
							createElement(Button, { variant: 'outline' }, 'Sheet'),
						)}
						<SheetContent>
							<SheetHeader>
								<SheetTitle>{'Sheet panel'}</SheetTitle>
								<SheetDescription>{'Slides in from the right.'}</SheetDescription>
							</SheetHeader>
						</SheetContent>
					</Sheet>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>{'Menus & popovers'}</CardTitle>
				</CardHeader>
				<CardContent className="flex flex-wrap gap-2">
					<DropdownMenu>
						{createElement(
							DropdownMenuTrigger,
							{ asChild: true },
							createElement(Button, { variant: 'outline' }, 'Menu'),
						)}
						<DropdownMenuContent>
							<DropdownMenuLabel>{'Appearance'}</DropdownMenuLabel>
							<DropdownMenuSeparator />
							<DropdownMenuCheckboxItem
								checked={statusBar}
								onCheckedChange={(v: boolean) => setStatusBar(v)}
							>{'Status bar'}</DropdownMenuCheckboxItem>
							<DropdownMenuItem
								onSelect={() => setLastAction('menu: profile')}
							>{'Profile'}</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
					<Popover>
						{createElement(
							PopoverTrigger,
							{ asChild: true },
							createElement(Button, { variant: 'outline' }, 'Popover'),
						)}
						<PopoverContent>{'Popper-positioned content.'}</PopoverContent>
					</Popover>
					<TooltipProvider>
						<Tooltip>
							{createElement(
								TooltipTrigger,
								{ asChild: true },
								createElement(Button, { variant: 'outline' }, 'Tooltip'),
							)}
							<TooltipContent>{'Helpful tip.'}</TooltipContent>
						</Tooltip>
					</TooltipProvider>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>{'Navigation'}</CardTitle>
				</CardHeader>
				<CardContent className="flex flex-col gap-3">
					<Breadcrumb>
						<BreadcrumbList>
							<BreadcrumbItem>
								<BreadcrumbLink href="#">{'Home'}</BreadcrumbLink>
							</BreadcrumbItem>
							<BreadcrumbSeparator />
							<BreadcrumbItem>
								<BreadcrumbPage>{'Gallery'}</BreadcrumbPage>
							</BreadcrumbItem>
						</BreadcrumbList>
					</Breadcrumb>
					<Pagination>
						<PaginationContent>
							<PaginationItem>
								<PaginationPrevious href="#" />
							</PaginationItem>
							<PaginationItem>
								<PaginationLink href="#" isActive>{'1'}</PaginationLink>
							</PaginationItem>
							<PaginationItem>
								<PaginationLink href="#">{'2'}</PaginationLink>
							</PaginationItem>
							<PaginationItem>
								<PaginationNext href="#" />
							</PaginationItem>
						</PaginationContent>
					</Pagination>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>{'Avatar'}</CardTitle>
				</CardHeader>
				<CardContent className="flex items-center gap-4">
					<Avatar>
						<AvatarFallback>{'OC'}</AvatarFallback>
					</Avatar>
					<AvatarGroup>
						<Avatar>
							<AvatarFallback>{'AB'}</AvatarFallback>
						</Avatar>
						<Avatar>
							<AvatarFallback>{'CD'}</AvatarFallback>
						</Avatar>
						<AvatarGroupCount>{'+3'}</AvatarGroupCount>
					</AvatarGroup>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>{'Feedback'}</CardTitle>
				</CardHeader>
				<CardContent className="flex flex-col gap-3">
					<Alert>
						<AlertTitle>{'Heads up'}</AlertTitle>
						<AlertDescription>{'Everything in this gallery is app-owned source.'}</AlertDescription>
					</Alert>
					<Progress value={60} aria-label="Progress" />
					<div class="flex items-center gap-3">
						<Spinner />
						<Skeleton className="h-4 w-24" />
						<KbdGroup>
							<Kbd>{'⌘'}</Kbd>
							<Kbd>{'K'}</Kbd>
						</KbdGroup>
					</div>
					<Button
						variant="outline"
						onClick={() => toast.success('Saved', { description: 'Toast from the gallery.' })}
					>{'Show toast'}</Button>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>{'Table'}</CardTitle>
				</CardHeader>
				<CardContent>
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>{'Name'}</TableHead>
								<TableHead>{'Role'}</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							<TableRow>
								<TableCell>{'Ada'}</TableCell>
								<TableCell>{'Engineer'}</TableCell>
							</TableRow>
							<TableRow>
								<TableCell>{'Linus'}</TableCell>
								<TableCell>{'Maintainer'}</TableCell>
							</TableRow>
						</TableBody>
					</Table>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>{'Structure'}</CardTitle>
				</CardHeader>
				<CardContent className="flex flex-col gap-3">
					<Collapsible>
						{createElement(
							CollapsibleTrigger,
							{ asChild: true },
							createElement(Button, { variant: 'outline', size: 'sm' }, 'Toggle details'),
						)}
						<CollapsibleContent>{'Hidden details revealed.'}</CollapsibleContent>
					</Collapsible>
					<Separator />
					<div class="w-24">
						<AspectRatio ratio={16 / 9}>
							<div
								class="flex size-full items-center justify-center rounded-md bg-muted text-xs"
							>{'16:9'}</div>
						</AspectRatio>
					</div>
					<ScrollArea className="h-16 rounded-md border p-2">
						<p class="text-sm">{'Line one'}</p>
						<p class="text-sm">{'Line two'}</p>
						<p class="text-sm">{'Line three'}</p>
						<p class="text-sm">{'Line four'}</p>
						<p class="text-sm">{'Line five'}</p>
					</ScrollArea>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>{'Item, Empty & Field'}</CardTitle>
				</CardHeader>
				<CardContent className="flex flex-col gap-3">
					<Item variant="outline">
						<ItemContent>
							<ItemTitle>{'Item title'}</ItemTitle>
							<ItemDescription>{'Item description.'}</ItemDescription>
						</ItemContent>
					</Item>
					<Empty className="border py-4">
						<EmptyHeader>
							<EmptyMedia variant="icon">{'∅'}</EmptyMedia>
							<EmptyTitle>{'No results'}</EmptyTitle>
							<EmptyDescription>{'Try a different search.'}</EmptyDescription>
						</EmptyHeader>
					</Empty>
					<Field>
						<FieldLabel htmlFor="field-email">{'Email'}</FieldLabel>
						<Input id="field-email" placeholder="you@example.com" />
						<FieldDescription>{'The Field family replaces react-hook-form here.'}</FieldDescription>
					</Field>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>{'Accordion'}</CardTitle>
					<CardDescription>{'Your custom flavor, {props.children} lowering.'}</CardDescription>
				</CardHeader>
				<CardContent>
					<Accordion type="single" collapsible>
						<AccordionItem value="a">
							<AccordionTrigger>{'Is it faithful?'}</AccordionTrigger>
							<AccordionContent>{'Verbatim class strings from the shared sources.'}</AccordionContent>
						</AccordionItem>
						<AccordionItem value="b">
							<AccordionTrigger>{'Does it SSR?'}</AccordionTrigger>
							<AccordionContent>{'Portal-free components server-render.'}</AccordionContent>
						</AccordionItem>
					</Accordion>
				</CardContent>
			</Card>
			<Card>
				<CardHeader>
					<CardTitle>{'Context menu'}</CardTitle>
				</CardHeader>
				<CardContent>
					<ContextMenu>
						<ContextMenuTrigger
							className="flex h-24 items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground"
						>{'Right-click here'}</ContextMenuTrigger>
						<ContextMenuContent>
							<ContextMenuLabel>{'Actions'}</ContextMenuLabel>
							<ContextMenuItem onSelect={() => setLastAction('context: back')}>
								{'Back'}
								<ContextMenuShortcut>{'⌘['}</ContextMenuShortcut>
							</ContextMenuItem>
							<ContextMenuItem
								onSelect={() => setLastAction('context: forward')}
							>{'Forward'}</ContextMenuItem>
							<ContextMenuSeparator />
							<ContextMenuCheckboxItem
								checked={statusBar}
								onCheckedChange={(next: boolean) => setStatusBar(next)}
							>{'Show status bar'}</ContextMenuCheckboxItem>
						</ContextMenuContent>
					</ContextMenu>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>{'Hover card'}</CardTitle>
				</CardHeader>
				<CardContent>
					<HoverCard>
						<HoverCardTrigger
							className="text-sm underline underline-offset-4"
						>{'@octanejs'}</HoverCardTrigger>
						<HoverCardContent>
							<p className="text-sm">{'Hover cards open on intent, not on click.'}</p>
						</HoverCardContent>
					</HoverCard>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>{'Menubar'}</CardTitle>
				</CardHeader>
				<CardContent>
					<Menubar>
						<MenubarMenu>
							<MenubarTrigger>{'File'}</MenubarTrigger>
							<MenubarContent>
								<MenubarItem onSelect={() => setLastAction('menubar: new tab')}>
									{'New tab'}
									<MenubarShortcut>{'⌘T'}</MenubarShortcut>
								</MenubarItem>
								<MenubarSeparator />
								<MenubarItem
									onSelect={() => setLastAction('menubar: print')}
								>{'Print'}</MenubarItem>
							</MenubarContent>
						</MenubarMenu>
						<MenubarMenu>
							<MenubarTrigger>{'Edit'}</MenubarTrigger>
							<MenubarContent>
								<MenubarItem onSelect={() => setLastAction('menubar: undo')}>{'Undo'}</MenubarItem>
							</MenubarContent>
						</MenubarMenu>
					</Menubar>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>{'Navigation menu'}</CardTitle>
				</CardHeader>
				<CardContent>
					<NavigationMenu>
						<NavigationMenuList>
							<NavigationMenuItem>
								<NavigationMenuTrigger>{'Docs'}</NavigationMenuTrigger>
								<NavigationMenuContent>
									<div className="grid w-56 gap-1 p-2">
										<NavigationMenuLink href="#/counter">{'Counter demo'}</NavigationMenuLink>
										<NavigationMenuLink href="#/suspense">{'Suspense demo'}</NavigationMenuLink>
									</div>
								</NavigationMenuContent>
							</NavigationMenuItem>
						</NavigationMenuList>
					</NavigationMenu>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>{'Sidebar'}</CardTitle>
				</CardHeader>
				<CardContent
					className="text-sm text-muted-foreground"
				>{'This playground’s own navigation IS the sidebar component — rail, mobile sheet, Cmd/Ctrl+B and the collapse cookie. A second SidebarProvider nested here would fight it for the same keyboard shortcut, so it is demonstrated by the shell instead of by a card.'}</CardContent>
			</Card>
		</div>

		<Toaster position="bottom-right" />
	</div>
}
