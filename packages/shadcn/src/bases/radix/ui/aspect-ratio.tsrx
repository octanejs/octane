// Ported from shadcn-ui/ui@4baadbc6517070ae8f8feb2c97037adc2b305544
// apps/v4/registry/bases/radix/ui/aspect-ratio.tsx (the `"use client"`
// directive is dropped — octane has no RSC axis).
import { AspectRatio as AspectRatioPrimitive } from '@octanejs/radix';

type Props = Record<string, unknown>;

export function AspectRatio(props: Props) @{
	<AspectRatioPrimitive.Root data-slot="aspect-ratio" {...props} />
}
