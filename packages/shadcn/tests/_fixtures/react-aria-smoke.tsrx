// One minimal, realistic mount per React Aria family. The point is coverage
// breadth, not depth: a single crashing component otherwise takes down a whole
// page and hides every family after it, so each one gets its own fixture and
// its own pass/fail.
import { Accordion, AccordionItem } from '@octanejs/shadcn/react-aria/Accordion';
import { Alert, AlertDescription, AlertTitle } from '@octanejs/shadcn/react-aria/Alert';
import {
	AlertDialog,
	AlertDialogDescription,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from '@octanejs/shadcn/react-aria/AlertDialog';
import { AspectRatio } from '@octanejs/shadcn/react-aria/AspectRatio';
import { Avatar, AvatarFallback, AvatarImage } from '@octanejs/shadcn/react-aria/Avatar';
import { Badge } from '@octanejs/shadcn/react-aria/Badge';
import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbList,
} from '@octanejs/shadcn/react-aria/Breadcrumb';
import { Button, LinkButton } from '@octanejs/shadcn/react-aria/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@octanejs/shadcn/react-aria/Card';
import { Checkbox } from '@octanejs/shadcn/react-aria/Checkbox';
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from '@octanejs/shadcn/react-aria/Collapsible';
import { Dialog, DialogTitle, DialogTrigger } from '@octanejs/shadcn/react-aria/Dialog';
import { Empty, EmptyHeader, EmptyTitle } from '@octanejs/shadcn/react-aria/Empty';
import { Field, FieldContent, FieldLabel } from '@octanejs/shadcn/react-aria/Field';
import { Input } from '@octanejs/shadcn/react-aria/Input';
import { Item, ItemContent, ItemGroup, ItemTitle } from '@octanejs/shadcn/react-aria/Item';
import { Kbd, KbdGroup } from '@octanejs/shadcn/react-aria/Kbd';
import { Label } from '@octanejs/shadcn/react-aria/Label';
import { NativeSelect, NativeSelectOption } from '@octanejs/shadcn/react-aria/NativeSelect';
import {
	Pagination,
	PaginationContent,
	PaginationItem,
	PaginationLink,
} from '@octanejs/shadcn/react-aria/Pagination';
import { Popover, PopoverTitle, PopoverTrigger } from '@octanejs/shadcn/react-aria/Popover';
import { RadioGroup, RadioGroupItem } from '@octanejs/shadcn/react-aria/RadioGroup';
import { ScrollArea } from '@octanejs/shadcn/react-aria/ScrollArea';
import { Separator } from '@octanejs/shadcn/react-aria/Separator';
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@octanejs/shadcn/react-aria/Sheet';
import { Skeleton } from '@octanejs/shadcn/react-aria/Skeleton';
import { Slider } from '@octanejs/shadcn/react-aria/Slider';
import { Spinner } from '@octanejs/shadcn/react-aria/Spinner';
import { Switch } from '@octanejs/shadcn/react-aria/Switch';
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@octanejs/shadcn/react-aria/Table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@octanejs/shadcn/react-aria/Tabs';
import { Textarea } from '@octanejs/shadcn/react-aria/Textarea';
import { Toggle } from '@octanejs/shadcn/react-aria/Toggle';

export function AccordionCase() @{
	<Accordion>
		<AccordionItem>One</AccordionItem>
	</Accordion>
}
export function AlertCase() @{
	<Alert>
		<AlertTitle>T</AlertTitle>
		<AlertDescription>D</AlertDescription>
	</Alert>
}
export function AlertDialogCase() @{
	<AlertDialogTrigger>
		<Button>Open</Button>
		<AlertDialog>
			<AlertDialogHeader>
				<AlertDialogTitle>T</AlertDialogTitle>
				<AlertDialogDescription>D</AlertDialogDescription>
			</AlertDialogHeader>
		</AlertDialog>
	</AlertDialogTrigger>
}
export function AspectRatioCase() @{
	<AspectRatio ratio={1}>
		<div>x</div>
	</AspectRatio>
}
export function AvatarCase() @{
	<Avatar>
		<AvatarFallback>OA</AvatarFallback>
	</Avatar>
}
export function BadgeCase() @{
	<Badge>B</Badge>
}
export function BreadcrumbCase() {
	return <Breadcrumb>
		<BreadcrumbList>
			<BreadcrumbItem>
				<BreadcrumbLink href="#">H</BreadcrumbLink>
			</BreadcrumbItem>
		</BreadcrumbList>
	</Breadcrumb>;
}
export function ButtonCase() @{
	<Button>Go</Button>
}
export function LinkButtonCase() @{
	<LinkButton href="#">Go</LinkButton>
}
export function CardCase() @{
	<Card>
		<CardHeader>
			<CardTitle>T</CardTitle>
		</CardHeader>
		<CardContent>C</CardContent>
	</Card>
}
export function CheckboxCase() @{
	<Checkbox>Accept</Checkbox>
}
export function CollapsibleCase() @{
	<Collapsible>
		<CollapsibleTrigger>
			<Button>T</Button>
		</CollapsibleTrigger>
		<CollapsibleContent>C</CollapsibleContent>
	</Collapsible>
}
export function DialogCase() @{
	<DialogTrigger>
		<Button>Open</Button>
		<Dialog>
			<DialogTitle>T</DialogTitle>
		</Dialog>
	</DialogTrigger>
}
export function EmptyCase() @{
	<Empty>
		<EmptyHeader>
			<EmptyTitle>T</EmptyTitle>
		</EmptyHeader>
	</Empty>
}
export function FieldCase() @{
	<Field>
		<FieldLabel>
			<Label>L</Label>
		</FieldLabel>
		<FieldContent>
			<Input />
		</FieldContent>
	</Field>
}
export function InputCase() @{
	<Input placeholder="p" />
}
export function ItemCase() @{
	<ItemGroup>
		<Item>
			<ItemContent>
				<ItemTitle>T</ItemTitle>
			</ItemContent>
		</Item>
	</ItemGroup>
}
export function KbdCase() @{
	<KbdGroup>
		<Kbd>K</Kbd>
	</KbdGroup>
}
export function LabelCase() @{
	<Label>L</Label>
}
export function NativeSelectCase() @{
	<NativeSelect>
		<NativeSelectOption value="a">A</NativeSelectOption>
	</NativeSelect>
}
export function PaginationCase() @{
	<Pagination>
		<PaginationContent>
			<PaginationItem>
				<PaginationLink href="#">1</PaginationLink>
			</PaginationItem>
		</PaginationContent>
	</Pagination>
}
export function PopoverCase() @{
	<PopoverTrigger>
		<Button>Open</Button>
		<Popover>
			<PopoverTitle>T</PopoverTitle>
		</Popover>
	</PopoverTrigger>
}
export function RadioGroupCase() @{
	<RadioGroup defaultValue="a">
		<RadioGroupItem value="a">A</RadioGroupItem>
	</RadioGroup>
}
export function ScrollAreaCase() @{
	<ScrollArea>content</ScrollArea>
}
export function SeparatorCase() @{
	<Separator />
}
export function SheetCase() @{
	<SheetTrigger>
		<Button>Open</Button>
		<SheetContent>
			<SheetTitle>T</SheetTitle>
		</SheetContent>
	</SheetTrigger>
}
export function SkeletonCase() @{
	<Skeleton />
}
export function SliderCase() @{
	<Slider defaultValue={[50]} />
}
export function SpinnerCase() @{
	<Spinner />
}
export function SwitchCase() @{
	<Switch>On</Switch>
}
export function TableCase() {
	return <Table aria-label="t">
		<TableHeader>
			<TableRow>
				<TableHead isRowHeader>Name</TableHead>
			</TableRow>
		</TableHeader>
		<TableBody>
			<TableRow>
				<TableCell>A</TableCell>
			</TableRow>
		</TableBody>
	</Table>;
}
// OCTANE DIVERGENCE: RAC collections walk their children as element
// DESCRIPTORS. A `@{ … }` body compiles children to a block the walk cannot
// enter, so a collection authored that way renders empty. Collection-backed
// families are therefore authored with `return <jsx>`.
export function TabsCase() {
	return <Tabs defaultSelectedKey="a">
		<TabsList>
			<TabsTrigger id="a">A</TabsTrigger>
		</TabsList>
		<TabsContent id="a">P</TabsContent>
	</Tabs>;
}
export function TextareaCase() @{
	<Textarea placeholder="p" />
}
export function ToggleCase() @{
	<Toggle>B</Toggle>
}

// Upstream applies `style`/`onLoad`/`onError` BEFORE spreading `{...props}`, so
// a caller-supplied value of the same name wins. These fixtures pin that, since
// it is upstream React's behavior too and the port must not quietly diverge.
export function AspectRatioCallerStyle() {
	return <AspectRatio ratio={16 / 9} style={{ opacity: 0.5 }}>
		<div>x</div>
	</AspectRatio>;
}

export function AvatarCallerOnError(props: any) {
	return <Avatar>
		<AvatarImage src="broken.png" onError={props.onError} />
		<AvatarFallback>FB</AvatarFallback>
	</Avatar>;
}
