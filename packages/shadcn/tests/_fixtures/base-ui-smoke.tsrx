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
import { Checkbox } from '@octanejs/shadcn/base-ui/Checkbox';
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
