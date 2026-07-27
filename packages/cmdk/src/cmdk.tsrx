// @octanejs/cmdk — the Command menu, ported from cmdk@1.1.1 (dip/cmdk,
// cmdk/src/index.tsx) onto the octane renderer.
//
// This module is the barrel: it assembles the `Command` namespace from the
// per-component modules under ./components and re-exports the public surface.
// The store/registration hooks live in ./hooks.tsrx, the contexts in
// ./context.tsrx, and the DOM constants/helpers in ./lib.
//
// octane adaptations (see docs/react-parity-migration-plan.md):
// - No forwardRef: every component takes `ref` as a normal prop; composeRefs
//   becomes octane's multi-ref `ref={[a, b]}`.
// - Input drives search from native `onInput`; the public `onValueChange` API
//   is unchanged (there is no synthetic `onChange`).
// - Radix `useId` becomes octane's `useId`; the store subscribes through
//   octane's `useSyncExternalStore`.
// - `useValue` derives an item's value from its provided `value` prop or the
//   rendered `textContent`; cmdk's string-child inspection is dropped because
//   octane's compiled children are opaque render bodies.
// - `sort()` reorders only the surviving (score > 0) items — moving a
//   to-be-unmounted node orphans it in an octane hydrated tree (see
//   ./components/command.tsrx).
// - `asChild` is NOT supported: cmdk's SlottableWithNestedChildren clones a child
//   element via React.cloneElement/isValidElement and re-parents the component's
//   own content into it. Octane's compiled children are opaque render bodies, so
//   that introspect-and-clone has no faithful equivalent — components always
//   render their own host element. `Command.Dialog` composes @octanejs/radix via
//   createElement descriptors instead.
import { CommandRoot } from './components/command.tsrx';
import { Item } from './components/item.tsrx';
import { Input } from './components/input.tsrx';
import { List } from './components/list.tsrx';
import { Group } from './components/group.tsrx';
import { Separator } from './components/separator.tsrx';
import { Empty } from './components/empty.tsrx';
import { Loading } from './components/loading.tsrx';
import { Dialog } from './components/dialog.tsrx';
import { useCmdk } from './hooks.tsrx';

const Command = Object.assign(CommandRoot, {
	List,
	Item,
	Input,
	Group,
	Separator,
	Dialog,
	Empty,
	Loading,
});

export { Command, CommandRoot, Item, Input, List, Group, Separator, Dialog, Empty, Loading };
export { useCmdk as useCommandState };
export { Item as CommandItem, Input as CommandInput, List as CommandList, Group as CommandGroup, Separator as CommandSeparator, Dialog as CommandDialog, Empty as CommandEmpty, Loading as CommandLoading };
