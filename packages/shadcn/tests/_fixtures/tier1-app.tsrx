// Tier-1 fixtures: one small composition per component family, exercising the
// representative props the contract tests assert on.
import { createElement } from 'octane';
import {
	Alert,
	AlertAction,
	AlertDescription,
	AlertTitle,
	Breadcrumb,
	BreadcrumbEllipsis,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbList,
	BreadcrumbPage,
	BreadcrumbSeparator,
	Button,
	Card,
	CardAction,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
	Input,
	Item,
	ItemContent,
	ItemDescription,
	ItemGroup,
	ItemSeparator,
	ItemTitle,
	Kbd,
	KbdGroup,
	Label,
	NativeSelect,
	NativeSelectOption,
	Pagination,
	PaginationContent,
	PaginationEllipsis,
	PaginationItem,
	PaginationLink,
	PaginationNext,
	PaginationPrevious,
	Separator,
	Skeleton,
	Spinner,
	Table,
	TableBody,
	TableCaption,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
	Textarea,
} from '@octanejs/shadcn';

export function AlertFixture() @{
	<Alert variant="destructive">
		<AlertTitle>Heads up</AlertTitle>
		<AlertDescription>Something went wrong.</AlertDescription>
		<AlertAction>Retry</AlertAction>
	</Alert>
}

export function ButtonFixture() @{
	<Button variant="destructive" size="sm" className="extra" type="submit">Delete</Button>
}

export function ButtonAsChildFixture() {
	return createElement(
		Button,
		{ asChild: true, variant: 'outline', size: 'lg' },
		createElement('a', { href: '#docs' }, 'Docs'),
	);
}

export function BreadcrumbFixture() @{
	<Breadcrumb>
		<BreadcrumbList>
			<BreadcrumbItem>
				<BreadcrumbLink href="/">Home</BreadcrumbLink>
			</BreadcrumbItem>
			<BreadcrumbSeparator />
			<BreadcrumbItem>
				<BreadcrumbEllipsis />
			</BreadcrumbItem>
			<BreadcrumbSeparator>
				<span data-testid="custom-sep">/</span>
			</BreadcrumbSeparator>
			<BreadcrumbItem>
				<BreadcrumbPage>Current</BreadcrumbPage>
			</BreadcrumbItem>
		</BreadcrumbList>
	</Breadcrumb>
}

export function CardFixture() @{
	<Card size="sm">
		<CardHeader>
			<CardTitle>Title</CardTitle>
			<CardDescription>Desc</CardDescription>
			<CardAction>Act</CardAction>
		</CardHeader>
		<CardContent>Body</CardContent>
		<CardFooter>Foot</CardFooter>
	</Card>
}

export function EmptyFixture() @{
	<Empty>
		<EmptyHeader>
			<EmptyMedia variant="icon">i</EmptyMedia>
			<EmptyTitle>No results</EmptyTitle>
			<EmptyDescription>Try a different search.</EmptyDescription>
		</EmptyHeader>
		<EmptyContent>content</EmptyContent>
	</Empty>
}

export function InputFixture() @{
	<Input type="email" placeholder="mail" className="w-3" />
}

export function ItemFixture() @{
	<ItemGroup>
		<Item variant="outline" size="sm">
			<ItemContent>
				<ItemTitle>First</ItemTitle>
				<ItemDescription>Desc</ItemDescription>
			</ItemContent>
		</Item>
		<ItemSeparator />
		<Item>Second</Item>
	</ItemGroup>
}

export function KbdFixture() @{
	<KbdGroup>
		<Kbd>⌘</Kbd>
		<Kbd>K</Kbd>
	</KbdGroup>
}

export function LabelFixture() @{
	<Label htmlFor="name">Name</Label>
}

export function NativeSelectFixture() @{
	<NativeSelect size="sm" className="pick" aria-label="Fruit">
		<NativeSelectOption value="a">A</NativeSelectOption>
	</NativeSelect>
}

export function PaginationFixture() @{
	<Pagination>
		<PaginationContent>
			<PaginationItem>
				<PaginationPrevious href="#prev" />
			</PaginationItem>
			<PaginationItem>
				<PaginationLink href="#1" isActive>{'1'}</PaginationLink>
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

export function SeparatorFixture() @{
	<div>
		<Separator />
		<Separator orientation="vertical" decorative={false} />
	</div>
}

export function SkeletonFixture() @{
	<Skeleton className="h-4" />
}

export function SpinnerFixture() @{
	<Spinner className="size-8" />
}

export function TableFixture() @{
	<Table className="mine">
		<TableCaption>People</TableCaption>
		<TableHeader>
			<TableRow>
				<TableHead>Name</TableHead>
			</TableRow>
		</TableHeader>
		<TableBody>
			<TableRow>
				<TableCell>Ada</TableCell>
			</TableRow>
		</TableBody>
	</Table>
}

export function TextareaFixture() @{
	<Textarea placeholder="notes" className="h-9" />
}
