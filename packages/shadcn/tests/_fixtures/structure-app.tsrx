// Structure-family fixtures: one small composition per component family,
// exercising the representative props the contract tests assert on.
import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from '../../src/bases/radix/ui/accordion.tsrx';
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from '../../src/bases/radix/ui/collapsible.tsrx';
import {
	Avatar,
	AvatarBadge,
	AvatarFallback,
	AvatarGroup,
	AvatarGroupCount,
	AvatarImage,
} from '../../src/bases/radix/ui/avatar.tsrx';
import { AspectRatio } from '../../src/bases/radix/ui/aspect-ratio.tsrx';
import { Progress } from '../../src/bases/radix/ui/progress.tsrx';
import { ScrollArea, ScrollBar } from '../../src/bases/radix/ui/scroll-area.tsrx';

export function AccordionFixture() @{
	<Accordion type="single" collapsible defaultValue="a" className="extra-accordion">
		<AccordionItem value="a">
			<AccordionTrigger data-testid="t-a">Section A</AccordionTrigger>
			<AccordionContent data-testid="c-a" className="extra-content">
				Panel A
			</AccordionContent>
		</AccordionItem>
		<AccordionItem value="b" className="extra-item">
			<AccordionTrigger data-testid="t-b" className="extra-trigger">
				Section B
			</AccordionTrigger>
			<AccordionContent data-testid="c-b">Panel B</AccordionContent>
		</AccordionItem>
	</Accordion>
}

export function AccordionMultipleFixture() @{
	<Accordion type="multiple" defaultValue={['a']}>
		<AccordionItem value="a">
			<AccordionTrigger data-testid="t-a">A</AccordionTrigger>
			<AccordionContent data-testid="c-a">Panel A</AccordionContent>
		</AccordionItem>
		<AccordionItem value="b">
			<AccordionTrigger data-testid="t-b">B</AccordionTrigger>
			<AccordionContent data-testid="c-b">Panel B</AccordionContent>
		</AccordionItem>
	</Accordion>
}

export function CollapsibleFixture() @{
	<Collapsible defaultOpen={false} data-testid="root">
		<CollapsibleTrigger data-testid="trigger">Toggle</CollapsibleTrigger>
		<CollapsibleContent data-testid="content">Hidden notes</CollapsibleContent>
	</Collapsible>
}

export function AvatarFixture() @{
	<Avatar size="sm" className="extra-avatar">
		<AvatarImage src="https://example.com/nope.png" alt="Ada" />
		<AvatarFallback data-testid="fallback">AL</AvatarFallback>
		<AvatarBadge data-testid="badge" />
	</Avatar>
}

export function AvatarGroupFixture() @{
	<AvatarGroup className="extra-group">
		<Avatar>
			<AvatarFallback>AB</AvatarFallback>
		</Avatar>
		<Avatar>
			<AvatarFallback>CD</AvatarFallback>
		</Avatar>
		<AvatarGroupCount data-testid="count">+3</AvatarGroupCount>
	</AvatarGroup>
}

export function AspectRatioFixture() @{
	<AspectRatio ratio={16 / 9} className="extra-ratio" data-testid="ratio">
		<img src="https://example.com/img.png" alt="wide" data-testid="ratio-child" />
	</AspectRatio>
}

export function ProgressFixture(props?: { value?: number | null }) @{
	<Progress value={props?.value} className="extra-progress" aria-label="Loading progress" />
}

export function ScrollAreaFixture() @{
	<ScrollArea className="extra-scroll">
		<div data-testid="scroll-content">
			line 1<br />
			line 2<br />
			line 3
		</div>
	</ScrollArea>
}

export function ScrollAreaHorizontalFixture() @{
	<ScrollArea type="always">
		<div data-testid="scroll-content">wide content</div>
		<ScrollBar orientation="horizontal" className="extra-bar" />
	</ScrollArea>
}
