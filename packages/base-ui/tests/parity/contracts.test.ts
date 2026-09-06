import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as BaseUI from '@octanejs/base-ui';
import * as ReactBaseUI from '@base-ui/react';

describe('@octanejs/base-ui parity audit contracts', () => {
	it('accounts for every pinned export and adapted test artifact', async () => {
		await import('../../scripts/check-upstream-crosswalk.mjs');
	});

	it('preserves the upstream runtime export names and component parts', () => {
		expect(typeof BaseUI.useMediaQuery).toBe('function');
		// The Octane binding retains these previously published runtime names in
		// addition to the exact pinned upstream surface.
		const compatibilityExports = {
			AccordionRoot: BaseUI.Accordion.Root,
			AccordionItem: BaseUI.Accordion.Item,
			AccordionHeader: BaseUI.Accordion.Header,
			AccordionTrigger: BaseUI.Accordion.Trigger,
			AccordionPanel: BaseUI.Accordion.Panel,
			CollapsibleRoot: BaseUI.Collapsible.Root,
			CollapsibleTrigger: BaseUI.Collapsible.Trigger,
			CollapsiblePanel: BaseUI.Collapsible.Panel,
			TabsRoot: BaseUI.Tabs.Root,
			TabsList: BaseUI.Tabs.List,
			TabsTab: BaseUI.Tabs.Tab,
			TabsPanel: BaseUI.Tabs.Panel,
			AlertDialogHandle: BaseUI.AlertDialog.Handle,
			createAlertDialogHandle: BaseUI.AlertDialog.createHandle,
			DialogHandle: BaseUI.Dialog.Handle,
			createDialogHandle: BaseUI.Dialog.createHandle,
			MenuHandle: BaseUI.Menu.Handle,
			createMenuHandle: BaseUI.Menu.createHandle,
			PopoverHandle: BaseUI.Popover.Handle,
			createPopoverHandle: BaseUI.Popover.createHandle,
			PreviewCardHandle: BaseUI.PreviewCard.Handle,
			createPreviewCardHandle: BaseUI.PreviewCard.createHandle,
			TooltipHandle: BaseUI.Tooltip.Handle,
			createTooltipHandle: BaseUI.Tooltip.createHandle,
			useToastManager: BaseUI.Toast.useToastManager,
			createToastManager: BaseUI.Toast.createToastManager,
			useMediaQuery: BaseUI.useMediaQuery,
		};
		for (const [name, value] of Object.entries(compatibilityExports)) {
			expect(value, name).toBeDefined();
			expect(BaseUI[name as keyof typeof BaseUI], name).toBe(value);
		}
		expect(Object.keys(BaseUI).sort()).toEqual(
			[...new Set([...Object.keys(ReactBaseUI), ...Object.keys(compatibilityExports)])].sort(),
		);
		const source = readFileSync(
			resolve(import.meta.dirname, '../../upstream/src/index.ts'),
			'utf8',
		);
		const namespaces = [...source.matchAll(/export \* from '\.\/([^']+)'/g)].flatMap(
			([, entry]) => {
				const source = readFileSync(
					resolve(import.meta.dirname, '../../upstream/src', entry, 'index.ts'),
					'utf8',
				);
				return [...source.matchAll(/export \* as (\w+) from/g)].map(([, name]) => name);
			},
		);
		expect(namespaces).toContain('Select');
		expect(namespaces).toContain('Combobox');
		// Compare component namespaces. A standalone React forwardRef object
		// has renderer metadata instead of public component parts.
		for (const name of namespaces) {
			const native = BaseUI[name as keyof typeof BaseUI];
			const upstream = ReactBaseUI[name as keyof typeof ReactBaseUI];
			expect(Object.keys(native).sort(), name).toEqual(Object.keys(upstream).sort());
		}
	});
});
