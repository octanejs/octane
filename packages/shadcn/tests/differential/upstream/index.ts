// Aggregates the vendored pinned upstream sources (the React reference side of
// the differential rig) into the module shape of '@octanejs/shadcn', so the
// compiled React fixtures can rewrite the bare specifier to this module. Only
// the differential subset is vendored: badge, button, tabs, dialog,
// dropdown-menu (+ lib/utils and the icon-placeholder shim).
export { cn } from "./utils"
export { Badge, badgeVariants } from "./badge"
export { Button, buttonVariants } from "./button"
export { Tabs, TabsList, TabsTrigger, TabsContent, tabsListVariants } from "./tabs"
export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
} from "./dialog"
export {
  DropdownMenu,
  DropdownMenuPortal,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from "./dropdown-menu"
