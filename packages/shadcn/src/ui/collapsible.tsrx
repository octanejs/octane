// Ported from shadcn-ui/ui@4baadbc6517070ae8f8feb2c97037adc2b305544
// apps/v4/registry/bases/radix/ui/collapsible.tsx (the `"use client"`
// directive is dropped — octane has no RSC axis). Upstream references the
// `CollapsiblePrimitive.CollapsibleTrigger` / `CollapsibleContent` aliases;
// the @octanejs/radix binding exports the same components as `Trigger` /
// `Content`.
import { Collapsible as CollapsiblePrimitive } from '@octanejs/radix';

type Props = Record<string, unknown>;

export function Collapsible(props: Props) @{
	<CollapsiblePrimitive.Root data-slot="collapsible" {...props} />
}

export function CollapsibleTrigger(props: Props) @{
	<CollapsiblePrimitive.Trigger data-slot="collapsible-trigger" {...props} />
}

export function CollapsibleContent(props: Props) @{
	<CollapsiblePrimitive.Content data-slot="collapsible-content" {...props} />
}
