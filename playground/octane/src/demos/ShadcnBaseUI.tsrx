// The Base UI base of @octanejs/shadcn, rendered from the package's own
// per-family subpaths (@octanejs/shadcn/base-ui/<Family>).
//
// THIS IS A PARTIAL BASE, and the families here have three different pedigrees.
// Check them differently:
//
//   Accordion — transcribed from upstream and running on the real
//     @octanejs/base-ui accordion primitive. The only genuinely INTERACTIVE
//     family so far, so exercise it: single mode should collapse an open item
//     when its trigger is clicked, opening one should close the others, and the
//     disabled item should not respond at all.
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
// Still absent: every other primitive-backed family (Button, Checkbox, Switch,
// Dialog, Popover, …). Base UI's primitive API is structurally different from
// React Aria's, so those cannot be derived and need transcribed sources.
import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from '@octanejs/shadcn/base-ui/Accordion';
import { Alert, AlertAction, AlertDescription, AlertTitle } from '@octanejs/shadcn/base-ui/Alert';
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
			<p class="text-sm font-medium">Partial base — 7 of 44 families</p>
			<p class="mt-1 text-sm text-muted-foreground">
				Accordion is transcribed from upstream and runs on the real primitive. Alert is verified
				against upstream's Base UI source. The rest are derived from the React Aria base: compare
				the two tabs, they should be visually identical. Primitive-backed families (Button,
				Checkbox, Switch, Dialog, …) are not ported yet.
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
