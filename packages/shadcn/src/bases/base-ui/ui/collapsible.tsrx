// Base UI base collapsible — runs on @octanejs/base-ui's Collapsible.
//
// PART MAPPING: shadcn names the content part `CollapsibleContent` while the Base UI part
// underneath is `Collapsible.Panel` — the same rename this base already makes for `accordion`.
// The exported names and all three `data-slot` values stay as shadcn defines them, so consumers
// see no difference between bases.
//
// No class strings: upstream ships this family unstyled in every base, leaving layout to the
// consumer. There is correspondingly no styling risk here, and nothing to verify against a
// class-string source.
import { Collapsible as CollapsiblePrimitive } from '@octanejs/base-ui/collapsible';

type Props = Record<string, unknown>;

export function Collapsible(props: Props) @{
	<CollapsiblePrimitive.Root data-slot="collapsible" {...props} />
}

export function CollapsibleTrigger(props: Props) @{
	<CollapsiblePrimitive.Trigger data-slot="collapsible-trigger" {...props} />
}

export function CollapsibleContent(props: Props) @{
	<CollapsiblePrimitive.Panel data-slot="collapsible-content" {...props} />
}
