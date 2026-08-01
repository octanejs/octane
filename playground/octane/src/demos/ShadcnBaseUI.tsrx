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
//   Everything else — DERIVED from this package's React Aria base, not
//     transcribed. Compare against the React Aria tab: they should look
//     identical, and any difference is a porting bug worth reporting.
//     `Skeleton` is the likeliest to be wrong, since its background token is
//     known to differ per base (`bg-accent` in Radix, `bg-muted` in React Aria).
//
// Still absent: the overlay and form-control families (Checkbox, Switch, Dialog,
// Popover, Tooltip, …). Base UI's primitive API is structurally different from
// React Aria's, so those cannot be derived and need transcribed sources.
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
import { Button } from '@octanejs/shadcn/base-ui/Button';
import { Checkbox } from '@octanejs/shadcn/base-ui/Checkbox';
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
import { Skeleton } from '@octanejs/shadcn/base-ui/Skeleton';
import { Spinner } from '@octanejs/shadcn/base-ui/Spinner';
import { InboxIcon, TriangleAlertIcon } from '@octanejs/lucide';

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
			<p class="text-sm font-medium">Partial base — 21 of 44 families</p>
			<p class="mt-1 text-sm text-muted-foreground">
				Accordion, Button, Input, Label and Separator run on real Base UI primitives. Alert is
				verified byte-identical to upstream's Base UI source. Every other class string is derived
				from the React Aria base, so compare the two tabs — they should look identical, and any
				difference is a porting bug. Checkbox, Switch, Dialog and the other overlay and form-control
				families are not ported yet.
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

		<Section title="Spinner" note="Resolves upstream's IconPlaceholder to lucide.">
			<div class="flex items-center gap-4">
				<Spinner />
				<Spinner class="size-6" />
				<Spinner class="size-8 text-muted-foreground" />
			</div>
		</Section>
	</div>
}
