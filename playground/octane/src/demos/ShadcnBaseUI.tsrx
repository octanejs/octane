// The Base UI base of @octanejs/shadcn, rendered from the package's own
// per-family subpaths (@octanejs/shadcn/base-ui/<Family>).
//
// THIS IS A PARTIAL BASE, and the families here have three different pedigrees.
// Check them differently:
//
//   Accordion — transcribed from upstream and running on the real
//     @octanejs/base-ui accordion primitive. The most INTERACTIVE family here, so
//     exercise it: single mode should collapse an open item when its trigger is
//     clicked, opening one should close the others, and the disabled item should
//     not respond at all.
//
//   Button, Input, Label, Separator — running on real Base UI primitives
//     (Button, Field.Control, Field.Label, Separator). Their class strings are
//     still derived, but their BEHAVIOR is the primitive's. Separator is the one
//     to look hardest at: Base UI emits `aria-orientation` like RAC rather than
//     `data-orientation` like Radix, so it needs the aria base's conditional
//     utilities. If a separator has no thickness, that is the bug.
//
//   Alert — transcribed and verified byte-identical to upstream's source. Should
//     need no scrutiny.
//
//   Dialog, AlertDialog, Popover, Tooltip — still carry the radix KEYFRAME motion utilities
//     (`data-open:animate-in` / `data-closed:animate-out`) rather than the transition pair the
//     transcribed sheet uses. Base UI does emit both `data-open` and `data-closed`, so those
//     utilities are not dead — but the sheet's derived version jumped on close and these have not
//     been checked against upstream sources. OPEN AND CLOSE EACH ONE: a snap on close is the
//     thing to report.
//
//   Avatar, Progress, Toggle, ToggleGroup — class strings derived, but
//     each ADAPTED to a part tree or attribute that Base UI genuinely differs on,
//     checked against the primitive's real output rather than assumed. What to
//     look at: a pressed Toggle / ToggleGroup item must actually shade (Base UI
//     emits `data-pressed`, not Radix's `data-[state=on]`); the Progress and
//     Progress fill must sit flush against the left edge of its rail and stop at
//     the right percentage — a fill offset sideways from where the number says it
//     should be is the double-offset bug it was adapted to avoid. Slider is
//     transcribed rather than derived, and is the one family here whose geometry
//     no test can reach: check every thumb is visible and round.
//
//   Everything else — DERIVED from this package's React Aria base, not
//     transcribed. Compare against the React Aria tab: they should look
//     identical, and any difference is a porting bug worth reporting.
//     `Skeleton` is the likeliest to be wrong, since its background token is
//     known to differ per base (`bg-accent` in Radix, `bg-muted` in React Aria).
//
// Still absent: 9 of 44 families. Four are blocked on unported @octanejs/base-ui
// primitives (navigation-menu, scroll-area, select, tabs) and sonner on
// next-themes; the rest are simply not ported yet. The README carries the
// generated per-base coverage table.
import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from '@octanejs/shadcn/base-ui/Accordion';
import { Alert, AlertAction, AlertDescription, AlertTitle } from '@octanejs/shadcn/base-ui/Alert';
import {
	Avatar,
	AvatarFallback,
	AvatarGroup,
	AvatarGroupCount,
	AvatarImage,
} from '@octanejs/shadcn/base-ui/Avatar';
import { Badge } from '@octanejs/shadcn/base-ui/Badge';
import {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuSeparator,
	DropdownMenuShortcut,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuTrigger,
} from '@octanejs/shadcn/base-ui/DropdownMenu';
import {
	Item,
	ItemActions,
	ItemContent,
	ItemDescription,
	ItemGroup,
	ItemMedia,
	ItemSeparator,
	ItemTitle,
} from '@octanejs/shadcn/base-ui/Item';
import {
	Breadcrumb,
	BreadcrumbEllipsis,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbList,
	BreadcrumbPage,
	BreadcrumbSeparator,
} from '@octanejs/shadcn/base-ui/Breadcrumb';
import {
	Field,
	FieldContent,
	FieldDescription,
	FieldError,
	FieldGroup,
	FieldLabel,
	FieldLegend,
	FieldSeparator,
	FieldSet,
	FieldTitle,
} from '@octanejs/shadcn/base-ui/Field';
import {
	Pagination,
	PaginationContent,
	PaginationEllipsis,
	PaginationItem,
	PaginationLink,
	PaginationNext,
	PaginationPrevious,
} from '@octanejs/shadcn/base-ui/Pagination';
import { Progress } from '@octanejs/shadcn/base-ui/Progress';
import {
	Table,
	TableBody,
	TableCaption,
	TableCell,
	TableFooter,
	TableHead,
	TableHeader,
	TableRow,
} from '@octanejs/shadcn/base-ui/Table';
import { Slider } from '@octanejs/shadcn/base-ui/Slider';
import { Toggle } from '@octanejs/shadcn/base-ui/Toggle';
import { ToggleGroup, ToggleGroupItem } from '@octanejs/shadcn/base-ui/ToggleGroup';
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogMedia,
	AlertDialogTitle,
	AlertDialogTrigger,
} from '@octanejs/shadcn/base-ui/AlertDialog';
import { Button } from '@octanejs/shadcn/base-ui/Button';
import { Checkbox } from '@octanejs/shadcn/base-ui/Checkbox';
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from '@octanejs/shadcn/base-ui/Collapsible';
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from '@octanejs/shadcn/base-ui/Dialog';
import {
	Popover,
	PopoverContent,
	PopoverDescription,
	PopoverHeader,
	PopoverTitle,
	PopoverTrigger,
} from '@octanejs/shadcn/base-ui/Popover';
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from '@octanejs/shadcn/base-ui/Tooltip';
import { RadioGroup, RadioGroupItem } from '@octanejs/shadcn/base-ui/RadioGroup';
import { Switch } from '@octanejs/shadcn/base-ui/Switch';
import { Input } from '@octanejs/shadcn/base-ui/Input';
import { Kbd, KbdGroup } from '@octanejs/shadcn/base-ui/Kbd';
import { Label } from '@octanejs/shadcn/base-ui/Label';
import { Separator } from '@octanejs/shadcn/base-ui/Separator';
import { Textarea } from '@octanejs/shadcn/base-ui/Textarea';
import { AspectRatio } from '@octanejs/shadcn/base-ui/AspectRatio';
import {
	Card,
	CardAction,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from '@octanejs/shadcn/base-ui/Card';
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from '@octanejs/shadcn/base-ui/Empty';
import {
	NativeSelect,
	NativeSelectOptGroup,
	NativeSelectOption,
} from '@octanejs/shadcn/base-ui/NativeSelect';
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetFooter,
	SheetHeader,
	SheetTitle,
	SheetTrigger,
} from '@octanejs/shadcn/base-ui/Sheet';
import { Skeleton } from '@octanejs/shadcn/base-ui/Skeleton';
import { Spinner } from '@octanejs/shadcn/base-ui/Spinner';
import { BellIcon, InboxIcon, TriangleAlertIcon } from '@octanejs/lucide';

function Section({ title, note, children }: { title: string; note?: string; children?: unknown }) @{
	<section class="space-y-3">
		<div class="space-y-0.5">
			<h3 class="text-sm font-medium">{title}</h3>
			@if (note) {
				<p class="text-xs text-muted-foreground">{note as string}</p>
			}
		</div>
		{children}
	</section>
}

export function ShadcnBaseUIDemo() @{
	<div class="space-y-8">
		<div class="rounded-lg border border-dashed p-4">
			<p class="text-sm font-medium">Partial base — 23 of 44 families</p>
			<p class="mt-1 text-sm text-muted-foreground">
				Most families here now run on real Base UI primitives — Accordion, Button, Input, Label,
				Separator, Checkbox, Switch, RadioGroup, Dialog, AlertDialog, Popover, Tooltip and
				Collapsible. Alert is verified byte-identical to upstream's Base UI source. The remaining
				class strings are derived from the React Aria base, so compare the two tabs: they should
				look identical, and any difference is a porting bug.
			</p>
		</div>

		<Section
			title="Accordion"
			note="Transcribed from upstream. Runs on the @octanejs/base-ui accordion primitive — this one is really interactive, so click the triggers."
		>
			<Accordion defaultValue={['item-1']}>
				<AccordionItem value="item-1">
					<AccordionTrigger>Is it accessible?</AccordionTrigger>
					<AccordionContent>
						Yes. The trigger is a real button, the panel gets role="region", and the two are wired
						together with aria-controls and aria-labelledby.
					</AccordionContent>
				</AccordionItem>
				<AccordionItem value="item-2">
					<AccordionTrigger>Does single mode collapse?</AccordionTrigger>
					<AccordionContent>
						Opening this one should close the others, and clicking an open trigger should close it.
						That behavior had no test upstream under jsdom, so a regression test was added.
					</AccordionContent>
				</AccordionItem>
				<AccordionItem value="item-3" disabled>
					<AccordionTrigger>Disabled item</AccordionTrigger>
					<AccordionContent>You should not be able to reach this.</AccordionContent>
				</AccordionItem>
			</Accordion>
		</Section>

		<Section
			title="Button"
			note="Runs on the @octanejs/base-ui Button primitive. cva strings are shared across upstream's bases; the Base UI base omits data-variant/data-size by design."
		>
			<div class="space-y-3">
				<div class="flex flex-wrap items-center gap-2">
					<Button>Default</Button>
					<Button variant="secondary">Secondary</Button>
					<Button variant="outline">Outline</Button>
					<Button variant="ghost">Ghost</Button>
					<Button variant="destructive">Destructive</Button>
					<Button variant="link">Link</Button>
				</div>
				<div class="flex flex-wrap items-center gap-2">
					<Button size="xs">xs</Button>
					<Button size="sm">sm</Button>
					<Button>default</Button>
					<Button size="lg">lg</Button>
					<Button disabled>Disabled</Button>
				</div>
			</div>
		</Section>

		<Section
			title="Input, Textarea and Label"
			note="Input is Base UI's Field.Control; Textarea is a plain host, since Base UI ships no textarea primitive."
		>
			<div class="grid max-w-sm gap-4">
				<div class="grid gap-2">
					<Label>Email</Label>
					<Input type="email" placeholder="you@example.com" />
				</div>
				<div class="grid gap-2">
					<Label>Message</Label>
					<Textarea placeholder="Type your message…" />
				</div>
				<Input placeholder="Disabled" disabled />
			</div>
		</Section>

		<Section
			title="Separator"
			note="The one family where copying the wrong base is a real bug: Base UI emits aria-orientation like RAC, not data-orientation like Radix. Both directions should be visible below."
		>
			<div class="space-y-4">
				<div>
					<p class="text-sm">Above</p>
					<Separator class="my-2" />
					<p class="text-sm">Below</p>
				</div>
				<div class="flex h-8 items-center gap-3 text-sm">
					<span>Left</span>
					<Separator orientation="vertical" />
					<span>Middle</span>
					<Separator orientation="vertical" />
					<span>Right</span>
				</div>
			</div>
		</Section>

		<Section title="Kbd" note="Plain host elements — Base UI ships no Keyboard primitive.">
			<KbdGroup>
				<Kbd>Ctrl</Kbd>
				<Kbd>Shift</Kbd>
				<Kbd>K</Kbd>
			</KbdGroup>
		</Section>

		<Section
			title="AlertDialog"
			note="Transcribed from upstream. Portals to document.body — open it, then dismiss with Cancel or Escape."
		>
			<AlertDialog>
				<AlertDialogTrigger render={<Button variant="outline" />}>
					Delete account
				</AlertDialogTrigger>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogMedia>
							<TriangleAlertIcon />
						</AlertDialogMedia>
						<AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
						<AlertDialogDescription>
							This permanently deletes your account and removes your data from our servers.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction>Continue</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</Section>

		<Section
			title="Checkbox, Switch and RadioGroup"
			note="Highest-risk families: Base UI publishes data-checked/data-unchecked, not Radix's data-[state=checked], and every Root is a span so `disabled:` can never match. Toggle each one — if the appearance does not change, the dialect is wrong."
		>
			<div class="space-y-4">
				<div class="flex flex-wrap items-center gap-6">
					<Label class="gap-2">
						<Checkbox />
						Unchecked
					</Label>
					<Label class="gap-2">
						<Checkbox defaultChecked />
						Checked
					</Label>
					<Label class="gap-2">
						<Checkbox disabled />
						Disabled
					</Label>
				</div>

				<div class="flex flex-wrap items-center gap-6">
					<Label class="gap-2">
						<Switch />
						Off
					</Label>
					<Label class="gap-2">
						<Switch defaultChecked />
						On
					</Label>
					<Label class="gap-2">
						<Switch size="sm" defaultChecked />
						Small
					</Label>
					<Label class="gap-2">
						<Switch disabled />
						Disabled
					</Label>
				</div>

				<RadioGroup defaultValue="comfortable">
					<Label class="gap-2">
						<RadioGroupItem value="default" />
						Default
					</Label>
					<Label class="gap-2">
						<RadioGroupItem value="comfortable" />
						Comfortable
					</Label>
					<Label class="gap-2">
						<RadioGroupItem value="compact" disabled />
						Compact (disabled)
					</Label>
				</RadioGroup>
			</div>
		</Section>

		<Section
			title="Dialog, Popover and Tooltip"
			note="All portalled. Base UI adds a Positioner layer and names its transform-origin var --transform-origin, not Radix's --radix-*. Watch the open animation: scaling from the wrong corner means the var is wrong."
		>
			<div class="flex flex-wrap items-center gap-3">
				<Dialog>
					<DialogTrigger render={<Button variant="outline" />}>Open dialog</DialogTrigger>
					<DialogContent>
						<DialogHeader>
							<DialogTitle>Edit profile</DialogTitle>
							<DialogDescription>
								Make changes to your profile here. Click save when you are done.
							</DialogDescription>
						</DialogHeader>
						<div class="grid gap-2">
							<Label>Name</Label>
							<Input placeholder="Your name" />
						</div>
						<DialogFooter>
							<DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
							<Button>Save changes</Button>
						</DialogFooter>
					</DialogContent>
				</Dialog>

				<Popover>
					<PopoverTrigger render={<Button variant="outline" />}>Open popover</PopoverTrigger>
					<PopoverContent>
						<PopoverHeader>
							<PopoverTitle>Dimensions</PopoverTitle>
							<PopoverDescription>Set the dimensions for the layer.</PopoverDescription>
						</PopoverHeader>
					</PopoverContent>
				</Popover>

				<TooltipProvider>
					<Tooltip>
						<TooltipTrigger render={<Button variant="outline" />}>Hover me</TooltipTrigger>
						<TooltipContent>Add to library</TooltipContent>
					</Tooltip>
				</TooltipProvider>
			</div>
		</Section>

		<Section
			title="Collapsible"
			note="Unstyled in every base — layout is the consumer's. Click to toggle; the trigger's aria-controls points at the panel."
		>
			<Collapsible class="w-full max-w-sm space-y-2">
				<CollapsibleTrigger render={<Button variant="outline" />}>
					Toggle details
				</CollapsibleTrigger>
				<CollapsibleContent class="rounded-lg border p-3 text-sm text-muted-foreground">
					Base UI calls this part Panel; shadcn calls it CollapsibleContent. Same element, same
					data-slot.
				</CollapsibleContent>
			</Collapsible>
		</Section>

		<Section
			title="Sheet"
			note="A Dialog anchored to an edge. Open each side — the slide-in direction comes from data-side, which this component sets itself."
		>
			<div class="flex flex-wrap items-center gap-2">
				<Sheet>
					<SheetTrigger render={<Button variant="outline" />}>Right</SheetTrigger>
					<SheetContent>
						<SheetHeader>
							<SheetTitle>Edit profile</SheetTitle>
							<SheetDescription>Make changes here. Click save when you are done.</SheetDescription>
						</SheetHeader>
						<SheetFooter>
							<Button>Save changes</Button>
						</SheetFooter>
					</SheetContent>
				</Sheet>

				<Sheet>
					<SheetTrigger render={<Button variant="outline" />}>Left</SheetTrigger>
					<SheetContent side="left">
						<SheetHeader>
							<SheetTitle>Navigation</SheetTitle>
							<SheetDescription>Slides in from the left.</SheetDescription>
						</SheetHeader>
					</SheetContent>
				</Sheet>

				<Sheet>
					<SheetTrigger render={<Button variant="outline" />}>Bottom</SheetTrigger>
					<SheetContent side="bottom">
						<SheetHeader>
							<SheetTitle>Details</SheetTitle>
							<SheetDescription>Slides up from the bottom.</SheetDescription>
						</SheetHeader>
					</SheetContent>
				</Sheet>
			</div>
		</Section>

		<Section title="Alert" note="Verified byte-identical to upstream.">
			<div class="space-y-3">
				<Alert>
					<TriangleAlertIcon />
					<AlertTitle>Heads up</AlertTitle>
					<AlertDescription>
						This alert came through the Base UI base and uses no headless primitive.
					</AlertDescription>
				</Alert>

				<Alert variant="destructive">
					<TriangleAlertIcon />
					<AlertTitle>Something failed</AlertTitle>
					<AlertDescription>The destructive variant, with a trailing action slot.</AlertDescription>
					<AlertAction>
						<span class="text-xs text-muted-foreground">Undo</span>
					</AlertAction>
				</Alert>
			</div>
		</Section>

		<Section title="Card" note="Derived — compare against the React Aria tab.">
			<div class="grid gap-4 sm:grid-cols-2">
				<Card>
					<CardHeader>
						<CardTitle>Default card</CardTitle>
						<CardDescription>With a header, content and footer.</CardDescription>
						<CardAction>
							<span class="text-xs text-muted-foreground">Action</span>
						</CardAction>
					</CardHeader>
					<CardContent>
						<p class="text-sm text-muted-foreground">
							Card spacing is driven by the --card-spacing custom property.
						</p>
					</CardContent>
					<CardFooter>
						<span class="text-xs text-muted-foreground">Footer</span>
					</CardFooter>
				</Card>

				<Card size="sm">
					<CardHeader>
						<CardTitle>Small card</CardTitle>
						<CardDescription>size="sm" tightens the spacing token.</CardDescription>
					</CardHeader>
					<CardContent>
						<p class="text-sm text-muted-foreground">The title also drops to text-sm.</p>
					</CardContent>
				</Card>
			</div>
		</Section>

		<Section title="Empty" note="Derived — compare against the React Aria tab.">
			<Empty>
				<EmptyHeader>
					<EmptyMedia variant="icon">
						<InboxIcon />
					</EmptyMedia>
					<EmptyTitle>No messages</EmptyTitle>
					<EmptyDescription>Anything you receive will show up here.</EmptyDescription>
				</EmptyHeader>
				<EmptyContent>
					<span class="text-xs text-muted-foreground">EmptyContent slot</span>
				</EmptyContent>
			</Empty>
		</Section>

		<Section title="NativeSelect" note="A real <select> — native change semantics, no primitive.">
			<div class="flex flex-wrap items-center gap-4">
				<NativeSelect>
					<NativeSelectOption value="a">Default size</NativeSelectOption>
					<NativeSelectOption value="b">Second option</NativeSelectOption>
					<NativeSelectOptGroup label="Grouped">
						<NativeSelectOption value="c">Inside a group</NativeSelectOption>
					</NativeSelectOptGroup>
				</NativeSelect>

				<NativeSelect size="sm">
					<NativeSelectOption value="a">Small size</NativeSelectOption>
					<NativeSelectOption value="b">Second option</NativeSelectOption>
				</NativeSelect>

				<NativeSelect disabled>
					<NativeSelectOption value="a">Disabled</NativeSelectOption>
				</NativeSelect>
			</div>
		</Section>

		<Section title="AspectRatio" note="Derived — compare against the React Aria tab.">
			<div class="max-w-sm">
				<AspectRatio ratio={16 / 9}>
					<div
						class="flex size-full items-center justify-center rounded-lg bg-muted text-sm text-muted-foreground"
					>
						16 / 9
					</div>
				</AspectRatio>
			</div>
		</Section>

		<Section title="Skeleton" note="Most likely to be wrong: the bg token differs per base.">
			<div class="flex items-center gap-4">
				<Skeleton class="size-10 rounded-full" />
				<div class="space-y-2">
					<Skeleton class="h-4 w-[220px]" />
					<Skeleton class="h-4 w-[160px]" />
				</div>
			</div>
		</Section>

		<Section
			title="Table"
			note="Base-independent: no table primitive exists in either Radix or Base UI, so this is the radix file unchanged and a test asserts the two render identical DOM."
		>
			<Table>
				<TableCaption>Recent invoices</TableCaption>
				<TableHeader>
					<TableRow>
						<TableHead>Invoice</TableHead>
						<TableHead>Status</TableHead>
						<TableHead>Amount</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					<TableRow>
						<TableCell>INV-001</TableCell>
						<TableCell>Paid</TableCell>
						<TableCell>$250.00</TableCell>
					</TableRow>
					<TableRow data-state="selected">
						<TableCell>INV-002</TableCell>
						<TableCell>Pending</TableCell>
						<TableCell>$150.00</TableCell>
					</TableRow>
					<TableRow>
						<TableCell>INV-003</TableCell>
						<TableCell>Unpaid</TableCell>
						<TableCell>$350.00</TableCell>
					</TableRow>
				</TableBody>
				<TableFooter>
					<TableRow>
						<TableCell>Total</TableCell>
						<TableCell />
						<TableCell>$750.00</TableCell>
					</TableRow>
				</TableFooter>
			</Table>
		</Section>

		<Section
			title="Pagination"
			note="Transcribed. Base UI has no Slot, so upstream composes the link as Button + nativeButton={false} + render — which means these links carry role=button and tabindex, unlike the Radix tab's plain anchors. Styling should still match Radix exactly, and page 2 must read as the current page."
		>
			<Pagination>
				<PaginationContent>
					<PaginationItem>
						<PaginationPrevious href="#prev" />
					</PaginationItem>
					<PaginationItem>
						<PaginationLink href="#1">1</PaginationLink>
					</PaginationItem>
					<PaginationItem>
						<PaginationLink href="#2" isActive>2</PaginationLink>
					</PaginationItem>
					<PaginationItem>
						<PaginationLink href="#3">3</PaginationLink>
					</PaginationItem>
					<PaginationItem>
						<PaginationEllipsis />
					</PaginationItem>
					<PaginationItem>
						<PaginationNext href="#next" />
					</PaginationItem>
				</PaginationContent>
			</Pagination>
		</Section>

		<Section
			title="Field"
			note="Transcribed. Upstream does NOT route this through Base UI's Field primitive — it is host elements plus this base's Label and Separator — so data-invalid stays consumer-written. The invalid row must go red, and the separator must show a rule with 'or' centred on it."
		>
			<FieldSet>
				<FieldLegend>Contact details</FieldLegend>
				<FieldGroup>
					<Field>
						<FieldLabel htmlFor="field-email">Email</FieldLabel>
						<Input id="field-email" type="email" placeholder="you@example.com" />
						<FieldDescription>We will never share your address.</FieldDescription>
					</Field>
					<FieldSeparator>or</FieldSeparator>
					<Field data-invalid="true">
						<FieldLabel htmlFor="field-phone">Phone</FieldLabel>
						<Input id="field-phone" aria-invalid="true" placeholder="+1 555 0100" />
						<FieldError errors={[{ message: 'Enter a valid number' }]} />
					</Field>
					<Field orientation="horizontal">
						<Checkbox id="field-tos" />
						<FieldContent>
							<FieldTitle>Accept terms</FieldTitle>
							<FieldDescription>Required before continuing.</FieldDescription>
						</FieldContent>
					</Field>
				</FieldGroup>
			</FieldSet>
		</Section>

		<Section
			title="Badge"
			note="No primitive in any base — a plain span. The cva strings are shared with Radix and a test asserts they stay identical, so this should look exactly like the Radix tab. No asChild/render escape here yet: see the file header."
		>
			<div class="flex flex-wrap items-center gap-2">
				<Badge>Default</Badge>
				<Badge variant="secondary">Secondary</Badge>
				<Badge variant="destructive">Destructive</Badge>
				<Badge variant="outline">Outline</Badge>
				<Badge variant="ghost">Ghost</Badge>
				<Badge variant="link">Link</Badge>
			</div>
		</Section>

		<Section
			title="Breadcrumb"
			note="Host elements throughout, class strings from the Radix source — should match the Radix tab exactly. BreadcrumbLink has no asChild here yet: see the file header."
		>
			<Breadcrumb>
				<BreadcrumbList>
					<BreadcrumbItem>
						<BreadcrumbLink href="#home">Home</BreadcrumbLink>
					</BreadcrumbItem>
					<BreadcrumbSeparator />
					<BreadcrumbItem>
						<BreadcrumbEllipsis />
					</BreadcrumbItem>
					<BreadcrumbSeparator />
					<BreadcrumbItem>
						<BreadcrumbLink href="#components">Components</BreadcrumbLink>
					</BreadcrumbItem>
					<BreadcrumbSeparator />
					<BreadcrumbItem>
						<BreadcrumbPage>Breadcrumb</BreadcrumbPage>
					</BreadcrumbItem>
				</BreadcrumbList>
			</Breadcrumb>
		</Section>

		<Section
			title="Item"
			note="Host elements plus this base's Separator. The data-variant/data-size utilities read attributes the component writes itself, so no primitive dialect is involved — this should match the Radix tab. Item has no asChild here yet: see the file header."
		>
			<ItemGroup class="max-w-md">
				<Item variant="outline">
					<ItemMedia variant="icon">
						<BellIcon />
					</ItemMedia>
					<ItemContent>
						<ItemTitle>Notifications</ItemTitle>
						<ItemDescription>Choose what you want to be notified about.</ItemDescription>
					</ItemContent>
					<ItemActions>
						<Switch />
					</ItemActions>
				</Item>
				<ItemSeparator />
				<Item variant="muted" size="sm">
					<ItemContent>
						<ItemTitle>Compact row</ItemTitle>
						<ItemDescription>Uses the sm size.</ItemDescription>
					</ItemContent>
				</Item>
			</ItemGroup>
		</Section>

		<Section
			title="DropdownMenu"
			note="Runs on the Base UI Menu primitive: Portal > Positioner > Popup. Open it and check the submenu — hovering 'More' must keep that row highlighted (it uses data-popup-open, not data-open), the checkbox and radio ticks must appear, and arrow keys must move the highlight."
		>
			<DropdownMenu>
				<DropdownMenuTrigger render={<Button variant="outline" />}>Open menu</DropdownMenuTrigger>
				<DropdownMenuContent>
					<DropdownMenuLabel>My account</DropdownMenuLabel>
					<DropdownMenuSeparator />
					<DropdownMenuGroup>
						<DropdownMenuItem>
							Profile
							<DropdownMenuShortcut>⇧⌘P</DropdownMenuShortcut>
						</DropdownMenuItem>
						<DropdownMenuItem>
							Billing
							<DropdownMenuShortcut>⌘B</DropdownMenuShortcut>
						</DropdownMenuItem>
						<DropdownMenuItem disabled>Unavailable</DropdownMenuItem>
					</DropdownMenuGroup>
					<DropdownMenuSeparator />
					<DropdownMenuCheckboxItem checked>Show sidebar</DropdownMenuCheckboxItem>
					<DropdownMenuSeparator />
					<DropdownMenuRadioGroup value="light">
						<DropdownMenuRadioItem value="light">Light</DropdownMenuRadioItem>
						<DropdownMenuRadioItem value="dark">Dark</DropdownMenuRadioItem>
					</DropdownMenuRadioGroup>
					<DropdownMenuSeparator />
					<DropdownMenuSub>
						<DropdownMenuSubTrigger>More options</DropdownMenuSubTrigger>
						<DropdownMenuSubContent>
							<DropdownMenuItem>Nested item</DropdownMenuItem>
							<DropdownMenuItem variant="destructive">Delete</DropdownMenuItem>
						</DropdownMenuSubContent>
					</DropdownMenuSub>
				</DropdownMenuContent>
			</DropdownMenu>
		</Section>

		<Section title="Avatar" note="Direct one-to-one mapping — no Base UI dialect involved.">
			<div class="flex items-center gap-6">
				<Avatar>
					<AvatarImage src="https://github.com/shadcn.png" alt="@shadcn" />
					<AvatarFallback>CN</AvatarFallback>
				</Avatar>
				<Avatar size="sm">
					<AvatarFallback>SM</AvatarFallback>
				</Avatar>
				<Avatar size="lg">
					<AvatarFallback>LG</AvatarFallback>
				</Avatar>
				<AvatarGroup>
					<Avatar>
						<AvatarFallback>A</AvatarFallback>
					</Avatar>
					<Avatar>
						<AvatarFallback>B</AvatarFallback>
					</Avatar>
					<AvatarGroupCount>+3</AvatarGroupCount>
				</AvatarGroup>
			</div>
		</Section>

		<Section
			title="Progress"
			note="Base UI adds a Track part and sizes the fill by width — each bar's fill should start flush left and end at its labelled percentage."
		>
			<div class="flex max-w-md flex-col gap-4">
				<Progress value={0} />
				<Progress value={25} />
				<Progress value={50} />
				<Progress value={100} />
			</div>
		</Section>

		<Section
			title="Slider"
			note="Transcribed. Thumbs sit OUTSIDE the track (nested, they get clipped to a sliver by its overflow-hidden). thumbAlignment='edge' measures with getBoundingClientRect, so thumbs and fill are hidden until laid out — jsdom cannot see this, only a browser can. Every thumb must be visible and round, the end thumbs flush with the rail ends, and the fill must track a drag exactly."
		>
			<div class="flex max-w-md flex-col gap-8">
				<Slider defaultValue={[50]} />
				<Slider defaultValue={[25, 75]} />
				<Slider defaultValue={[40]} step={10} />
				<Slider defaultValue={[30]} disabled />
			</div>
		</Section>

		<Section
			title="Toggle"
			note="Pressed state rides on `data-pressed`, not Radix's `data-[state=on]` — a pressed toggle that does not shade is that dialect being wrong."
		>
			<div class="flex items-center gap-3">
				<Toggle>Default</Toggle>
				<Toggle defaultPressed>Pressed</Toggle>
				<Toggle variant="outline">Outline</Toggle>
				<Toggle size="sm">Small</Toggle>
				<Toggle size="lg">Large</Toggle>
				<Toggle disabled>Disabled</Toggle>
			</div>
		</Section>

		<Section
			title="ToggleGroup"
			note="Base UI has no ToggleGroup.Item — items are plain Toggles. Values are always arrays here, in single mode too."
		>
			<div class="flex flex-col items-start gap-4">
				<ToggleGroup defaultValue={['b']}>
					<ToggleGroupItem value="a">A</ToggleGroupItem>
					<ToggleGroupItem value="b">B</ToggleGroupItem>
					<ToggleGroupItem value="c">C</ToggleGroupItem>
				</ToggleGroup>
				<ToggleGroup type="multiple" variant="outline" defaultValue={['bold', 'italic']}>
					<ToggleGroupItem value="bold">Bold</ToggleGroupItem>
					<ToggleGroupItem value="italic">Italic</ToggleGroupItem>
					<ToggleGroupItem value="underline">Underline</ToggleGroupItem>
				</ToggleGroup>
			</div>
		</Section>

		<Section title="Spinner" note="Resolves upstream's IconPlaceholder to lucide.">
			<div class="flex items-center gap-4">
				<Spinner />
				<Spinner class="size-6" />
				<Spinner class="size-8 text-muted-foreground" />
			</div>
		</Section>
	</div>
}
