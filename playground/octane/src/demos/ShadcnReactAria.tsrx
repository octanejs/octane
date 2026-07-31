// The React Aria base of @octanejs/shadcn, rendered from the package's own
// per-family subpaths. Everything here goes through @octanejs/aria/components
// (RAC) rather than @octanejs/radix, while keeping the same data-slot contract
// and the same aria-nova class strings the Radix tab uses.
//
// Every family the base currently ships is rendered below, so switching tabs is
// a real side-by-side check rather than a spot check.
import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from '@octanejs/shadcn/react-aria/Accordion';
import { Alert, AlertDescription, AlertTitle } from '@octanejs/shadcn/react-aria/Alert';
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from '@octanejs/shadcn/react-aria/AlertDialog';
import { AspectRatio } from '@octanejs/shadcn/react-aria/AspectRatio';
import { Avatar, AvatarFallback } from '@octanejs/shadcn/react-aria/Avatar';
import { Badge } from '@octanejs/shadcn/react-aria/Badge';
import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbList,
	BreadcrumbPage,
} from '@octanejs/shadcn/react-aria/Breadcrumb';
import { Button, LinkButton } from '@octanejs/shadcn/react-aria/Button';
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from '@octanejs/shadcn/react-aria/Card';
import { Checkbox } from '@octanejs/shadcn/react-aria/Checkbox';
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from '@octanejs/shadcn/react-aria/Collapsible';
import {
	Dialog,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from '@octanejs/shadcn/react-aria/Dialog';
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyTitle,
} from '@octanejs/shadcn/react-aria/Empty';
import {
	Field,
	FieldContent,
	FieldDescription,
	FieldLabel,
} from '@octanejs/shadcn/react-aria/Field';
import { Input } from '@octanejs/shadcn/react-aria/Input';
import {
	Item,
	ItemContent,
	ItemDescription,
	ItemGroup,
	ItemTitle,
} from '@octanejs/shadcn/react-aria/Item';
import { Kbd, KbdGroup } from '@octanejs/shadcn/react-aria/Kbd';
import { Label } from '@octanejs/shadcn/react-aria/Label';
import { NativeSelect, NativeSelectOption } from '@octanejs/shadcn/react-aria/NativeSelect';
import {
	Pagination,
	PaginationContent,
	PaginationItem,
	PaginationLink,
} from '@octanejs/shadcn/react-aria/Pagination';
import {
	Popover,
	PopoverDescription,
	PopoverHeader,
	PopoverTitle,
	PopoverTrigger,
} from '@octanejs/shadcn/react-aria/Popover';
import { RadioGroup, RadioGroupItem } from '@octanejs/shadcn/react-aria/RadioGroup';
import { ScrollArea } from '@octanejs/shadcn/react-aria/ScrollArea';
import { Separator } from '@octanejs/shadcn/react-aria/Separator';
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
	SheetTrigger,
} from '@octanejs/shadcn/react-aria/Sheet';
import { Skeleton } from '@octanejs/shadcn/react-aria/Skeleton';
import { Switch } from '@octanejs/shadcn/react-aria/Switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@octanejs/shadcn/react-aria/Tabs';
import { Textarea } from '@octanejs/shadcn/react-aria/Textarea';
import { Toggle } from '@octanejs/shadcn/react-aria/Toggle';

function Section(props: { title: string; children?: unknown }) @{
	<section class="space-y-3">
		<h3 class="text-sm font-medium text-muted-foreground">{props.title as string}</h3>
		<div class="flex flex-wrap items-start gap-3">{props.children}</div>
	</section>
}

// OCTANE DIVERGENCE: RAC collections (Tabs, Breadcrumbs, ListBox, Table, Menu)
// walk their children as element DESCRIPTORS. A `@{ … }` body compiles children
// into a block the walk cannot enter, so a collection authored that way renders
// its shell with no items — silently. Author collection-backed families with
// `return <jsx>`, which emits descriptors.
function TabsExample() {
	return <Tabs defaultSelectedKey="one" class="w-full max-w-sm">
		<TabsList>
			<TabsTrigger id="one">One</TabsTrigger>
			<TabsTrigger id="two">Two</TabsTrigger>
		</TabsList>
		<TabsContent id="one">First panel</TabsContent>
		<TabsContent id="two">Second panel</TabsContent>
	</Tabs>;
}

// RadioGroupItem, like Checkbox and Switch, styles the CONTROL — its label
// belongs beside it. RAC's radio collection also needs descriptor children.
function RadioGroupExample() {
	return <RadioGroup defaultValue="one" className="grid gap-2">
		<div className="flex items-center gap-2">
			<RadioGroupItem value="one" id="ra-one" />
			<Label for="ra-one">One</Label>
		</div>
		<div className="flex items-center gap-2">
			<RadioGroupItem value="two" id="ra-two" />
			<Label for="ra-two">Two</Label>
		</div>
	</RadioGroup>;
}

function AccordionExample() {
	return <Accordion className="w-full max-w-sm">
		<AccordionItem>
			<AccordionTrigger>Item one</AccordionTrigger>
			<AccordionContent>Panel body.</AccordionContent>
		</AccordionItem>
	</Accordion>;
}

function BreadcrumbExample() {
	return <Breadcrumb>
		<BreadcrumbList>
			<BreadcrumbItem>
				<BreadcrumbLink href="#">Home</BreadcrumbLink>
			</BreadcrumbItem>
			<BreadcrumbItem>
				<BreadcrumbPage>Components</BreadcrumbPage>
			</BreadcrumbItem>
		</BreadcrumbList>
	</Breadcrumb>;
}

export function ShadcnReactAriaDemo() @{
	<div class="space-y-8">
		<Section title="Button — RAC Button + Link">
			<Button>Default</Button>
			<Button variant="secondary">Secondary</Button>
			<Button variant="outline">Outline</Button>
			<Button variant="ghost">Ghost</Button>
			<Button variant="destructive">Destructive</Button>
			<Button variant="link">Link</Button>
			<Button size="sm">Small</Button>
			<Button size="lg">Large</Button>
			<Button isDisabled>Disabled</Button>
			<LinkButton href="#react-aria" variant="outline">
				LinkButton
			</LinkButton>
		</Section>

		<Section title="Badge">
			<Badge>Default</Badge>
			<Badge variant="secondary">Secondary</Badge>
			<Badge variant="destructive">Destructive</Badge>
			<Badge variant="outline">Outline</Badge>
		</Section>

		{/* Checkbox and Switch style the control itself (a 16px box, a 32px
    track), so their label goes BESIDE them — passing it as children
    renders the text inside the control. Toggle is a button: its children
    are its content. */}
		<Section title="Checkbox / Switch / Toggle — RAC selection primitives">
			<div class="flex items-center gap-2">
				<Checkbox id="ra-terms" />
				<Label for="ra-terms">Accept terms</Label>
			</div>
			<div class="flex items-center gap-2">
				<Switch id="ra-airplane" />
				<Label for="ra-airplane">Airplane mode</Label>
			</div>
			<Toggle>Bold</Toggle>
		</Section>

		<Section title="RadioGroup">
			<RadioGroupExample />
		</Section>

		<Section title="Field — Input / Textarea / NativeSelect">
			<Field className="w-full max-w-sm">
				<FieldLabel>
					<Label>Email</Label>
				</FieldLabel>
				<FieldContent>
					<Input type="email" placeholder="you@example.com" />
					<FieldDescription>We never share it.</FieldDescription>
				</FieldContent>
			</Field>
			<Textarea className="max-w-sm" placeholder="Tell us more…" />
			<NativeSelect className="max-w-[12rem]">
				<NativeSelectOption value="a">Option A</NativeSelectOption>
				<NativeSelectOption value="b">Option B</NativeSelectOption>
			</NativeSelect>
		</Section>

		<Section title="Tabs — RAC Tabs/TabList/TabPanel">
			<TabsExample />
		</Section>

		<Section title="Overlays — Dialog / Sheet / AlertDialog / Popover">
			<DialogTrigger>
				<Button variant="outline">Open dialog</Button>
				<Dialog>
					<DialogHeader>
						<DialogTitle>Dialog</DialogTitle>
						<DialogDescription>Rendered through RAC Modal.</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button size="sm">Done</Button>
					</DialogFooter>
				</Dialog>
			</DialogTrigger>

			<SheetTrigger>
				<Button variant="outline">Open sheet</Button>
				<SheetContent>
					<SheetHeader>
						<SheetTitle>Sheet</SheetTitle>
						<SheetDescription>Slides in from the side.</SheetDescription>
					</SheetHeader>
				</SheetContent>
			</SheetTrigger>

			<AlertDialogTrigger>
				<Button variant="outline">Open alert</Button>
				<AlertDialog>
					<AlertDialogHeader>
						<AlertDialogTitle>Are you sure?</AlertDialogTitle>
						<AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction>Continue</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialog>
			</AlertDialogTrigger>

			<PopoverTrigger>
				<Button variant="outline">Open popover</Button>
				<Popover>
					<PopoverHeader>
						<PopoverTitle>Popover</PopoverTitle>
						<PopoverDescription>Positioned against its trigger.</PopoverDescription>
					</PopoverHeader>
				</Popover>
			</PopoverTrigger>
		</Section>

		<Section title="Collapsible / Accordion — RAC Disclosure">
			<Collapsible className="w-full max-w-sm">
				<CollapsibleTrigger>
					<Button variant="ghost" size="sm">
						Toggle details
					</Button>
				</CollapsibleTrigger>
				<CollapsibleContent>Hidden until expanded.</CollapsibleContent>
			</Collapsible>
			<AccordionExample />
		</Section>

		<Section title="Breadcrumb / Pagination — RAC navigation">
			<BreadcrumbExample />
			<Pagination>
				<PaginationContent>
					<PaginationItem>
						<PaginationLink href="#">1</PaginationLink>
					</PaginationItem>
					<PaginationItem>
						<PaginationLink href="#">2</PaginationLink>
					</PaginationItem>
				</PaginationContent>
			</Pagination>
		</Section>

		<Section title="Item — list rows">
			<ItemGroup className="w-full max-w-sm">
				<Item>
					<ItemContent>
						<ItemTitle>First item</ItemTitle>
						<ItemDescription>With a description.</ItemDescription>
					</ItemContent>
				</Item>
			</ItemGroup>
		</Section>

		<Section title="Kbd">
			<KbdGroup>
				<Kbd>⌘</Kbd>
				<Kbd>K</Kbd>
			</KbdGroup>
		</Section>

		<Section title="Separator — orientation via aria-orientation">
			<div class="w-full max-w-sm space-y-2">
				<div class="text-sm">Above</div>
				<Separator />
				<div class="text-sm">Below</div>
			</div>
		</Section>

		<Section title="ScrollArea">
			<ScrollArea className="h-24 w-full max-w-sm rounded-md border p-2 text-sm">
				<p>Scrollable region rendered by the React Aria base.</p>
				<p>Upstream implements this as one native-overflow element.</p>
				<p>So there is no custom viewport or scrollbar part.</p>
				<p>Keep scrolling to see the overflow behavior.</p>
				<p>Last line.</p>
			</ScrollArea>
		</Section>

		<Section title="Avatar / Skeleton">
			<Avatar>
				<AvatarFallback>OA</AvatarFallback>
			</Avatar>
			<Skeleton className="h-8 w-32" />
		</Section>

		<Section title="Alert">
			<Alert>
				<AlertTitle>Heads up</AlertTitle>
				<AlertDescription>This alert renders through the React Aria base.</AlertDescription>
			</Alert>
		</Section>

		<Section title="Card">
			<Card className="w-full max-w-sm">
				<CardHeader>
					<CardTitle>React Aria base</CardTitle>
					<CardDescription>Same slots and classes, different primitives.</CardDescription>
				</CardHeader>
				<CardContent>
					<p class="text-sm text-muted-foreground">Composed from RAC primitives.</p>
				</CardContent>
				<CardFooter>
					<Button size="sm">Action</Button>
				</CardFooter>
			</Card>
		</Section>

		<Section title="Empty">
			<Empty className="w-full max-w-sm">
				<EmptyHeader>
					<EmptyTitle>Nothing here</EmptyTitle>
					<EmptyDescription>This state is base-agnostic.</EmptyDescription>
				</EmptyHeader>
			</Empty>
		</Section>

		<Section title="AspectRatio">
			<div class="w-48">
				<AspectRatio ratio={16 / 9}>
					<div class="flex size-full items-center justify-center rounded-md bg-muted text-xs">
						16 / 9
					</div>
				</AspectRatio>
			</div>
		</Section>
	</div>
}
