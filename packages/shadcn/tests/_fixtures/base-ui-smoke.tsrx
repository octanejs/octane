// One minimal, realistic mount per Base UI family. Coverage breadth, not depth: a single
// crashing component otherwise takes down a whole page and hides every family after it, so each
// one gets its own fixture and its own pass/fail.
//
// EVERY CASE IS STANDALONE ON PURPOSE — no Field.Root, no Form, no provider wrapper. That is the
// condition this suite exists to protect. `Label` originally routed through Base UI's
// `Field.Label`, which calls `useFieldRootContext(false)` and therefore throws
// "FieldRootContext is missing" outside a `<Field.Root>`. shadcn's Label is documented and used
// as a standalone component, so that made every ordinary use a runtime crash — one that reached
// the playground because nothing here mounted these families bare.
import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from '@octanejs/shadcn/base-ui/Accordion';
import { Alert, AlertAction, AlertDescription, AlertTitle } from '@octanejs/shadcn/base-ui/Alert';
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
import { AspectRatio } from '@octanejs/shadcn/base-ui/AspectRatio';
import {
	Avatar,
	AvatarFallback,
	AvatarGroup,
	AvatarGroupCount,
} from '@octanejs/shadcn/base-ui/Avatar';
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
import { Progress } from '@octanejs/shadcn/base-ui/Progress';
import {
	Pagination,
	PaginationContent,
	PaginationEllipsis,
	PaginationItem,
	PaginationLink,
	PaginationNext,
	PaginationPrevious,
} from '@octanejs/shadcn/base-ui/Pagination';
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
import { Checkbox } from '@octanejs/shadcn/base-ui/Checkbox';
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from '@octanejs/shadcn/base-ui/Collapsible';
import {
	Dialog,
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
import { Button } from '@octanejs/shadcn/base-ui/Button';
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
import { Input } from '@octanejs/shadcn/base-ui/Input';
import { Kbd, KbdGroup } from '@octanejs/shadcn/base-ui/Kbd';
import { Label } from '@octanejs/shadcn/base-ui/Label';
import {
	NativeSelect,
	NativeSelectOptGroup,
	NativeSelectOption,
} from '@octanejs/shadcn/base-ui/NativeSelect';
import { Separator } from '@octanejs/shadcn/base-ui/Separator';
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
import { Textarea } from '@octanejs/shadcn/base-ui/Textarea';

export function AccordionCase() @{
	<Accordion defaultValue={['a']}>
		<AccordionItem value="a">
			<AccordionTrigger>Trigger</AccordionTrigger>
			<AccordionContent>Content</AccordionContent>
		</AccordionItem>
	</Accordion>
}

export function AlertCase() @{
	<Alert>
		<AlertTitle>Title</AlertTitle>
		<AlertDescription>Description</AlertDescription>
		<AlertAction>Action</AlertAction>
	</Alert>
}

export function AspectRatioCase() @{
	<AspectRatio ratio={16 / 9}>
		<div>Media</div>
	</AspectRatio>
}

export function ButtonCase() @{
	<Button variant="outline" size="sm">Press</Button>
}

export function CardCase() @{
	<Card>
		<CardHeader>
			<CardTitle>Title</CardTitle>
			<CardDescription>Description</CardDescription>
			<CardAction>Action</CardAction>
		</CardHeader>
		<CardContent>Content</CardContent>
		<CardFooter>Footer</CardFooter>
	</Card>
}

export function EmptyCase() @{
	<Empty>
		<EmptyHeader>
			<EmptyMedia variant="icon">
				<span>icon</span>
			</EmptyMedia>
			<EmptyTitle>Nothing here</EmptyTitle>
			<EmptyDescription>Description</EmptyDescription>
		</EmptyHeader>
		<EmptyContent>Content</EmptyContent>
	</Empty>
}

export function InputCase() @{
	<Input placeholder="Email" />
}

export function KbdCase() @{
	<KbdGroup>
		<Kbd>Ctrl</Kbd>
		<Kbd>K</Kbd>
	</KbdGroup>
}

export function LabelCase() @{
	<Label>Email</Label>
}

export function NativeSelectCase() @{
	<NativeSelect>
		<NativeSelectOption value="a">A</NativeSelectOption>
		<NativeSelectOptGroup label="Group">
			<NativeSelectOption value="b">B</NativeSelectOption>
		</NativeSelectOptGroup>
	</NativeSelect>
}

export function SeparatorCase() @{
	<Separator />
}

export function SeparatorVerticalCase() @{
	<Separator orientation="vertical" />
}

export function SkeletonCase() @{
	<Skeleton class="h-4 w-32" />
}

export function SpinnerCase() @{
	<Spinner />
}

export function TextareaCase() @{
	<Textarea placeholder="Message" />
}

// Rendered OPEN so the portalled tree actually exists in the DOM. A closed alert-dialog renders
// only its trigger, which would make any assertion about the content vacuous.
export function AlertDialogCase() @{
	<AlertDialog defaultOpen>
		<AlertDialogTrigger>Open</AlertDialogTrigger>
		<AlertDialogContent>
			<AlertDialogHeader>
				<AlertDialogMedia>
					<span>icon</span>
				</AlertDialogMedia>
				<AlertDialogTitle>Are you sure?</AlertDialogTitle>
				<AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
			</AlertDialogHeader>
			<AlertDialogFooter>
				<AlertDialogCancel>Cancel</AlertDialogCancel>
				<AlertDialogAction>Continue</AlertDialogAction>
			</AlertDialogFooter>
		</AlertDialogContent>
	</AlertDialog>
}

export function CheckboxCase() @{
	<Checkbox defaultChecked />
}

export function CheckboxDisabledCase() @{
	<Checkbox disabled />
}

export function SwitchCase() @{
	<Switch defaultChecked />
}

export function SwitchDisabledCase() @{
	<Switch disabled />
}

export function RadioGroupCase() @{
	<RadioGroup defaultValue="a">
		<RadioGroupItem value="a" />
		<RadioGroupItem value="b" disabled />
	</RadioGroup>
}

// Rendered OPEN so the portalled tree exists. A closed overlay renders only its trigger, which
// would make every assertion about the content vacuous.
export function DialogCase() @{
	<Dialog defaultOpen>
		<DialogTrigger>Open dialog</DialogTrigger>
		<DialogContent>
			<DialogHeader>
				<DialogTitle>Dialog title</DialogTitle>
				<DialogDescription>Dialog description.</DialogDescription>
			</DialogHeader>
			<DialogFooter>Footer content</DialogFooter>
		</DialogContent>
	</Dialog>
}

export function PopoverCase() @{
	<Popover defaultOpen>
		<PopoverTrigger>Open popover</PopoverTrigger>
		<PopoverContent>
			<PopoverHeader>
				<PopoverTitle>Popover title</PopoverTitle>
				<PopoverDescription>Popover description.</PopoverDescription>
			</PopoverHeader>
		</PopoverContent>
	</Popover>
}

export function TooltipCase() @{
	<TooltipProvider>
		<Tooltip defaultOpen>
			<TooltipTrigger>Hover me</TooltipTrigger>
			<TooltipContent>Tooltip body</TooltipContent>
		</Tooltip>
	</TooltipProvider>
}

export function CollapsibleCase() @{
	<Collapsible defaultOpen>
		<CollapsibleTrigger>Toggle</CollapsibleTrigger>
		<CollapsibleContent>Collapsible body</CollapsibleContent>
	</Collapsible>
}

// Rendered OPEN so the portalled tree exists; a closed sheet renders only its trigger.
export function SheetCase() @{
	<Sheet defaultOpen>
		<SheetTrigger>Open sheet</SheetTrigger>
		<SheetContent>
			<SheetHeader>
				<SheetTitle>Sheet title</SheetTitle>
				<SheetDescription>Sheet description.</SheetDescription>
			</SheetHeader>
			<SheetFooter>Sheet footer</SheetFooter>
		</SheetContent>
	</Sheet>
}

export function SheetLeftCase() @{
	<Sheet defaultOpen>
		<SheetTrigger>Open left</SheetTrigger>
		<SheetContent side="left">
			<SheetTitle>Left sheet</SheetTitle>
		</SheetContent>
	</Sheet>
}

export function AvatarCase() @{
	<Avatar>
		<AvatarFallback>AB</AvatarFallback>
	</Avatar>
}

export function AvatarGroupCase() @{
	<AvatarGroup>
		<Avatar size="lg">
			<AvatarFallback>CD</AvatarFallback>
		</Avatar>
		<AvatarGroupCount>+2</AvatarGroupCount>
	</AvatarGroup>
}

export function ProgressCase() @{
	<Progress value={40} />
}

// Indeterminate: shadcn's `value` is optional, and Base UI's Root types it as `number | null`.
export function ProgressNoValueCase() @{
	<Progress />
}

export function SliderCase() @{
	<Slider defaultValue={[30]} />
}

export function SliderRangeCase() @{
	<Slider defaultValue={[20, 60]} />
}

export function TogglePressedCase() @{
	<Toggle defaultPressed>Bold</Toggle>
}

export function ToggleGroupCase() @{
	<ToggleGroup defaultValue={['b']}>
		<ToggleGroupItem value="a">A</ToggleGroupItem>
		<ToggleGroupItem value="b">B</ToggleGroupItem>
	</ToggleGroup>
}

export function TableCase() @{
	<Table>
		<TableCaption>Recent invoices</TableCaption>
		<TableHeader>
			<TableRow>
				<TableHead>Invoice</TableHead>
				<TableHead>Amount</TableHead>
			</TableRow>
		</TableHeader>
		<TableBody>
			<TableRow data-state="selected">
				<TableCell>INV-001</TableCell>
				<TableCell>$250.00</TableCell>
			</TableRow>
		</TableBody>
		<TableFooter>
			<TableRow>
				<TableCell>Total</TableCell>
				<TableCell>$250.00</TableCell>
			</TableRow>
		</TableFooter>
	</Table>
}

export function PaginationCase() @{
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
				<PaginationEllipsis />
			</PaginationItem>
			<PaginationItem>
				<PaginationNext href="#next" />
			</PaginationItem>
		</PaginationContent>
	</Pagination>
}

// Standalone on purpose, like every case here: FieldLabel must not require a Field.Root ancestor.
export function FieldCase() @{
	<FieldSet>
		<FieldLegend>Contact</FieldLegend>
		<FieldGroup>
			<Field>
				<FieldLabel htmlFor="email-x">Email</FieldLabel>
				<FieldDescription>We never share it.</FieldDescription>
			</Field>
			<FieldSeparator>or</FieldSeparator>
			<Field orientation="horizontal" data-invalid="true">
				<FieldContent>
					<FieldTitle>Phone</FieldTitle>
				</FieldContent>
			</Field>
		</FieldGroup>
	</FieldSet>
}

export function FieldErrorsCase() @{
	<FieldError
		errors={[{ message: 'Required' }, { message: 'Required' }, { message: 'Too short' }]}
	/>
}

export function FieldErrorSingleCase() @{
	<FieldError errors={[{ message: 'Required' }, { message: 'Required' }]} />
}

export function FieldErrorEmptyCase() @{
	<div data-slot="probe">
		<FieldError errors={[]} />
	</div>
}

// Base UI accepts a scalar for a single-value slider; the thumb count must follow the value shape.
export function SliderScalarCase() @{
	<Slider defaultValue={30} />
}

export function SliderScalarZeroCase() @{
	<Slider value={0} />
}

export function BadgeCase() @{
	<div>
		<Badge>Default</Badge>
		<Badge variant="secondary">Secondary</Badge>
		<Badge variant="destructive">Destructive</Badge>
		<Badge variant="outline">Outline</Badge>
	</div>
}

export function BreadcrumbCase() @{
	<Breadcrumb>
		<BreadcrumbList>
			<BreadcrumbItem>
				<BreadcrumbLink href="/">Home</BreadcrumbLink>
			</BreadcrumbItem>
			<BreadcrumbSeparator />
			<BreadcrumbItem>
				<BreadcrumbEllipsis />
			</BreadcrumbItem>
			<BreadcrumbSeparator>/</BreadcrumbSeparator>
			<BreadcrumbItem>
				<BreadcrumbPage>Current</BreadcrumbPage>
			</BreadcrumbItem>
		</BreadcrumbList>
	</Breadcrumb>
}

export function ItemCase() @{
	<ItemGroup>
		<Item>
			<ItemMedia variant="icon" />
			<ItemContent>
				<ItemTitle>Item title</ItemTitle>
				<ItemDescription>Item description text.</ItemDescription>
			</ItemContent>
			<ItemActions>Act</ItemActions>
		</Item>
		<ItemSeparator />
		<Item variant="outline" size="sm">
			<ItemContent>
				<ItemTitle>Second</ItemTitle>
			</ItemContent>
		</Item>
	</ItemGroup>
}

// Open so the portalled tree exists. Standalone: the label must not need a Group ancestor.
export function DropdownMenuCase() @{
	<DropdownMenu defaultOpen>
		<DropdownMenuTrigger>Open menu</DropdownMenuTrigger>
		<DropdownMenuContent>
			<DropdownMenuLabel>My account</DropdownMenuLabel>
			<DropdownMenuSeparator />
			<DropdownMenuGroup>
				<DropdownMenuItem>
					Profile
					<DropdownMenuShortcut>⇧⌘P</DropdownMenuShortcut>
				</DropdownMenuItem>
				<DropdownMenuItem variant="destructive">Delete</DropdownMenuItem>
				<DropdownMenuItem disabled>Unavailable</DropdownMenuItem>
			</DropdownMenuGroup>
			<DropdownMenuSeparator />
			<DropdownMenuCheckboxItem checked>Show sidebar</DropdownMenuCheckboxItem>
			<DropdownMenuRadioGroup value="light">
				<DropdownMenuRadioItem value="light">Light</DropdownMenuRadioItem>
				<DropdownMenuRadioItem value="dark">Dark</DropdownMenuRadioItem>
			</DropdownMenuRadioGroup>
			<DropdownMenuSub>
				<DropdownMenuSubTrigger>More</DropdownMenuSubTrigger>
				<DropdownMenuSubContent>
					<DropdownMenuItem>Nested</DropdownMenuItem>
				</DropdownMenuSubContent>
			</DropdownMenuSub>
		</DropdownMenuContent>
	</DropdownMenu>
}

// side/alignOffset must reach the Positioner, not be swept onto the Popup where they are inert.
export function DropdownMenuSideCase() @{
	<DropdownMenu defaultOpen>
		<DropdownMenuTrigger>Open</DropdownMenuTrigger>
		<DropdownMenuContent side="top" alignOffset={12}>
			<DropdownMenuItem>One</DropdownMenuItem>
		</DropdownMenuContent>
	</DropdownMenu>
}

export function PopoverSideCase() @{
	<Popover defaultOpen>
		<PopoverTrigger>Open</PopoverTrigger>
		<PopoverContent side="right">Popover body</PopoverContent>
	</Popover>
}
