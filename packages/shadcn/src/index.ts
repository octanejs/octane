// @octanejs/shadcn — shadcn/ui (Radix base) for the octane renderer.
//
// Upstream pin: shadcn-ui/ui@4baadbc6517070ae8f8feb2c97037adc2b305544 (main,
// 2026-07-24) + CLI shadcn@4.14.1. Components are authored in `.tsrx` so the
// octane compiler owns templates and hook slots; the cva variant maps, class
// strings, and data-slot attributes are preserved byte-for-byte from the
// pinned upstream sources (the public styling contract). See
// docs/shadcn-port-plan.md.
export { cn } from './lib/utils';

export { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from './ui/accordion.tsrx';
export { Alert, AlertTitle, AlertDescription, AlertAction, alertVariants } from './ui/alert.tsrx';
export {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogMedia,
	AlertDialogOverlay,
	AlertDialogPortal,
	AlertDialogTitle,
	AlertDialogTrigger,
} from './ui/alert-dialog.tsrx';
export { AspectRatio } from './ui/aspect-ratio.tsrx';
export {
	Avatar,
	AvatarImage,
	AvatarFallback,
	AvatarBadge,
	AvatarGroup,
	AvatarGroupCount,
} from './ui/avatar.tsrx';
export { Badge, badgeVariants, type BadgeProps } from './ui/badge.tsrx';
export {
	Breadcrumb,
	BreadcrumbList,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbPage,
	BreadcrumbSeparator,
	BreadcrumbEllipsis,
} from './ui/breadcrumb.tsrx';
export { Button, buttonVariants, type ButtonProps } from './ui/button.tsrx';
export { Checkbox } from './ui/checkbox.tsrx';
export { Collapsible, CollapsibleTrigger, CollapsibleContent } from './ui/collapsible.tsrx';
export {
	ContextMenu,
	ContextMenuTrigger,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuCheckboxItem,
	ContextMenuRadioItem,
	ContextMenuLabel,
	ContextMenuSeparator,
	ContextMenuShortcut,
	ContextMenuGroup,
	ContextMenuPortal,
	ContextMenuSub,
	ContextMenuSubContent,
	ContextMenuSubTrigger,
	ContextMenuRadioGroup,
} from './ui/context-menu.tsrx';
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
} from './ui/dialog.tsrx';
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
} from './ui/dropdown-menu.tsrx';
export {
	Card,
	CardHeader,
	CardFooter,
	CardTitle,
	CardAction,
	CardDescription,
	CardContent,
} from './ui/card.tsrx';
export {
	Empty,
	EmptyHeader,
	EmptyTitle,
	EmptyDescription,
	EmptyContent,
	EmptyMedia,
	emptyMediaVariants,
} from './ui/empty.tsrx';
export {
	Field,
	FieldContent,
	FieldDescription,
	FieldError,
	FieldGroup,
	FieldLabel,
	FieldLegend,
	FieldSeparator,
	FieldSet,
	FieldTitle,
} from './ui/field.tsrx';
export { HoverCard, HoverCardTrigger, HoverCardContent } from './ui/hover-card.tsrx';
export { useIsMobile } from './hooks/use-mobile';
export { Input, type InputProps } from './ui/input.tsrx';
export {
	Item,
	ItemMedia,
	ItemContent,
	ItemActions,
	ItemGroup,
	ItemSeparator,
	ItemTitle,
	ItemDescription,
	ItemHeader,
	ItemFooter,
	itemVariants,
	itemMediaVariants,
} from './ui/item.tsrx';
export { Kbd, KbdGroup } from './ui/kbd.tsrx';
export { Label } from './ui/label.tsrx';
export {
	Menubar,
	MenubarPortal,
	MenubarMenu,
	MenubarTrigger,
	MenubarContent,
	MenubarGroup,
	MenubarSeparator,
	MenubarLabel,
	MenubarItem,
	MenubarShortcut,
	MenubarCheckboxItem,
	MenubarRadioGroup,
	MenubarRadioItem,
	MenubarSub,
	MenubarSubTrigger,
	MenubarSubContent,
} from './ui/menubar.tsrx';
export { NativeSelect, NativeSelectOption, NativeSelectOptGroup } from './ui/native-select.tsrx';
export {
	NavigationMenu,
	NavigationMenuList,
	NavigationMenuItem,
	NavigationMenuContent,
	NavigationMenuTrigger,
	NavigationMenuLink,
	NavigationMenuIndicator,
	NavigationMenuViewport,
	navigationMenuTriggerStyle,
} from './ui/navigation-menu.tsrx';
export {
	Pagination,
	PaginationContent,
	PaginationEllipsis,
	PaginationItem,
	PaginationLink,
	PaginationNext,
	PaginationPrevious,
} from './ui/pagination.tsrx';
export {
	Popover,
	PopoverAnchor,
	PopoverContent,
	PopoverDescription,
	PopoverHeader,
	PopoverTitle,
	PopoverTrigger,
} from './ui/popover.tsrx';
export { Progress } from './ui/progress.tsrx';
export { RadioGroup, RadioGroupItem } from './ui/radio-group.tsrx';
export { ScrollArea, ScrollBar } from './ui/scroll-area.tsrx';
export {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectLabel,
	SelectScrollDownButton,
	SelectScrollUpButton,
	SelectSeparator,
	SelectTrigger,
	SelectValue,
} from './ui/select.tsrx';
export { Separator } from './ui/separator.tsrx';
export {
	Sheet,
	SheetTrigger,
	SheetClose,
	SheetContent,
	SheetHeader,
	SheetFooter,
	SheetTitle,
	SheetDescription,
} from './ui/sheet.tsrx';
export {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarGroup,
	SidebarGroupAction,
	SidebarGroupContent,
	SidebarGroupLabel,
	SidebarHeader,
	SidebarInput,
	SidebarInset,
	SidebarMenu,
	SidebarMenuAction,
	SidebarMenuBadge,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarMenuSkeleton,
	SidebarMenuSub,
	SidebarMenuSubButton,
	SidebarMenuSubItem,
	SidebarProvider,
	SidebarRail,
	SidebarSeparator,
	SidebarTrigger,
	useSidebar,
} from './ui/sidebar.tsrx';
export { Slider } from './ui/slider.tsrx';
export { Skeleton } from './ui/skeleton.tsrx';
export { Toaster } from './ui/sonner.tsrx';
export { Spinner } from './ui/spinner.tsrx';
export { Switch } from './ui/switch.tsrx';
export {
	Table,
	TableHeader,
	TableBody,
	TableFooter,
	TableHead,
	TableRow,
	TableCell,
	TableCaption,
} from './ui/table.tsrx';
export { Tabs, TabsList, TabsTrigger, TabsContent, tabsListVariants } from './ui/tabs.tsrx';
export { Textarea } from './ui/textarea.tsrx';
export { Toggle, toggleVariants } from './ui/toggle.tsrx';
export { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip.tsrx';
export { ToggleGroup, ToggleGroupItem } from './ui/toggle-group.tsrx';
