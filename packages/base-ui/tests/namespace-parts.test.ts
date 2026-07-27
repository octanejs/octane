import { describe, expect, it } from 'vitest';
import { Dialog } from '@octanejs/base-ui/dialog';
import { AlertDialog } from '@octanejs/base-ui/alert-dialog';
import { Popover } from '@octanejs/base-ui/popover';
import { Menu } from '@octanejs/base-ui/menu';
import { Tooltip } from '@octanejs/base-ui/tooltip';
import { PreviewCard } from '@octanejs/base-ui/preview-card';

// Each namespace must expose everything Base UI lists in that component's anatomy. Parts are easy
// to add to one namespace and forget in another that re-uses them — `AlertDialog` re-exports
// Dialog's parts, so `Dialog.Viewport` landing without `AlertDialog.Viewport` left consumers
// following the upstream docs with an undefined component. These lists mirror upstream's
// `index.parts.ts` for each component.
const EXPECTED: Record<string, [Record<string, unknown>, string[]]> = {
	Dialog: [
		Dialog,
		[
			'Root',
			'Trigger',
			'Portal',
			'Backdrop',
			'Popup',
			'Viewport',
			'Title',
			'Description',
			'Close',
			'createHandle',
			'Handle',
		],
	],
	AlertDialog: [
		AlertDialog,
		[
			'Root',
			'Trigger',
			'Portal',
			'Backdrop',
			'Popup',
			'Viewport',
			'Title',
			'Description',
			'Close',
			'createHandle',
			'Handle',
		],
	],
	Popover: [
		Popover,
		[
			'Root',
			'Trigger',
			'Portal',
			'Positioner',
			'Popup',
			'Viewport',
			'Arrow',
			'Backdrop',
			'Title',
			'Description',
			'Close',
			'createHandle',
			'Handle',
		],
	],
	Tooltip: [
		Tooltip,
		[
			'Provider',
			'Root',
			'Trigger',
			'Portal',
			'Positioner',
			'Popup',
			'Arrow',
			'Viewport',
			'createHandle',
			'Handle',
		],
	],
	PreviewCard: [
		PreviewCard,
		[
			'Root',
			'Trigger',
			'Portal',
			'Positioner',
			'Popup',
			'Backdrop',
			'Arrow',
			'Viewport',
			'createHandle',
			'Handle',
		],
	],
	// Menu lands in stages (Phase 3f). This list is the STAGE 1 surface — the open/close +
	// roving-focus path. `Item`, `CheckboxItem`, `RadioGroup`/`RadioItem`, `Group`/`GroupLabel`,
	// `LinkItem`, `Separator`, `Arrow`, `Backdrop`, `Viewport`, `SubmenuRoot`/`SubmenuTrigger` get
	// appended here as their stages land; the list must reach upstream's full `index.parts.ts` by
	// the end of Phase 3f.
	Menu: [Menu, ['Root', 'Trigger', 'Portal', 'Positioner', 'Popup', 'createHandle', 'Handle']],
};

describe('@octanejs/base-ui — component namespaces expose every upstream part', () => {
	for (const [name, [namespace, parts]] of Object.entries(EXPECTED)) {
		it(`${name} exposes all ${parts.length} parts`, () => {
			const missing = parts.filter((part) => namespace[part] == null);
			expect(missing).toEqual([]);
		});
	}
});
