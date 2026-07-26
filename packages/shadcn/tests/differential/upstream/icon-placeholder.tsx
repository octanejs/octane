// React-side shim for upstream's `@/app/(create)/components/icon-placeholder`.
// It mirrors what the shadcn CLI does for `iconLibrary: "lucide"`: the
// `lucide` prop names the icon, the other libraries' name props are dropped,
// and the remaining props (className, etc.) are forwarded to the lucide-react
// icon component. Used ONLY by the vendored upstream sources on the React side
// of the differential rig.
import * as React from "react"
import * as icons from "lucide-react"

type IconPlaceholderProps = React.ComponentProps<"svg"> & {
  lucide: string
  tabler?: string
  hugeicons?: string
  phosphor?: string
  remixicon?: string
}

function IconPlaceholder({
  lucide,
  tabler: _tabler,
  hugeicons: _hugeicons,
  phosphor: _phosphor,
  remixicon: _remixicon,
  ...props
}: IconPlaceholderProps) {
  const Icon = (icons as Record<string, unknown>)[
    lucide
  ] as React.ComponentType<React.ComponentProps<"svg">>
  if (!Icon) throw new Error(`icon-placeholder: unknown lucide icon "${lucide}"`)
  return <Icon {...props} />
}

export { IconPlaceholder }
