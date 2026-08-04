// Base UI base label — a plain host `<label>`.
//
// NOT `Field.Label`, and that is the whole point of this file. Base UI's label part is
// `Field.Label`, but it calls `useFieldRootContext(false)` — it HARD-REQUIRES a `<Field.Root>`
// ancestor and throws "FieldRootContext is missing" without one. Upstream's own FieldLabel does
// the same, so that is faithful behavior, not a porting defect.
//
// shadcn's `Label`, by contrast, is a standalone component: the docs use it beside an Input with
// no Field wrapper at all, which is exactly how the playground uses it. Routing it through
// `Field.Label` made every such use a runtime crash. A plain `<label>` works standalone AND
// inside a Field, and consumers who want Base UI's automatic label/control association can reach
// for `Field.Label` directly.
//
// Regression coverage: `tests/base-ui-standalone.test.ts`.
//
// UNVERIFIED PROVENANCE: the class string is taken from this package's React Aria base rather
// than transcribed from upstream's Base UI source. It carries one utility the Radix base omits
// (`peer-data-disabled:opacity-50`).
import { cn } from '../../../lib/utils';
import type { HostProps } from '../../../lib/types';

export function Label({ className, ...props }: HostProps<'label'>) @{
	<label
		data-slot="label"
		className={cn(
			'flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50 peer-data-disabled:opacity-50',
			className,
		)}
		{...props}
	/>
}
