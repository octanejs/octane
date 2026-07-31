import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const PKG_ROOT = join(__dirname, '..');
const baseDir = (base: string) => join(PKG_ROOT, 'src', 'bases', base, 'ui');

const families = (base: string) => {
	const dir = baseDir(base);
	return existsSync(dir)
		? readdirSync(dir)
				.filter((f) => f.endsWith('.tsrx'))
				.sort()
		: [];
};

const read = (base: string, file: string) => readFileSync(join(baseDir(base), file), 'utf8');

const dataSlots = (source: string): Set<string> =>
	new Set([...source.matchAll(/data-slot="([^"]+)"/g)].map((m) => m[1]));

const exportedNames = (source: string): Set<string> =>
	new Set([...source.matchAll(/^export\s+(?:function|const)\s+([A-Za-z_]\w*)/gm)].map((m) => m[1]));

// What is and is not shared across primitive bases.
//
// SHARED — the structural contract a consumer styles and queries against:
// `data-slot` names and the component names each family exports. Switching base
// must not rename a part or drop a component.
//
// NOT SHARED — class strings. Upstream's own bases diverge wherever a selector
// keys off an attribute the primitive emits: the Radix separator styles
// `data-horizontal:h-px` while the React Aria one styles
// `aria-[orientation=horizontal]:h-px`, because Radix sets `data-orientation`
// and RAC sets `aria-orientation`. Asserting class equality here would be
// asserting something upstream does not do, and would block correct ports.
// Parts and exports a base legitimately does NOT have, because upstream's own
// source for that base does not have them. Recording them keeps the checks
// below meaningful: an accidental omission still fails, while a real
// primitive-level difference is stated once, with its reason.
const KNOWN_DIVERGENCES: Record<string, { slots?: string[]; exports?: string[]; why: string }> = {
	// Upstream keeps its cva variant maps PRIVATE in the aria base, where the
	// Radix base publishes them. Nothing structural differs — the parts and their
	// classes are all still there.
	'react-aria/alert.tsrx': {
		exports: ['alertVariants'],
		why: 'variant map stays private upstream',
	},
	'react-aria/empty.tsrx': {
		exports: ['emptyMediaVariants'],
		why: 'variant map stays private upstream',
	},
	'react-aria/field.tsrx': {
		exports: ['fieldVariants'],
		why: 'variant map stays private upstream',
	},
	'react-aria/item.tsrx': {
		exports: ['itemMediaVariants', 'itemVariants'],
		why: 'variant maps stay private upstream',
	},

	'react-aria/alert-dialog.tsrx': {
		slots: ['alert-dialog-portal'],
		exports: ['AlertDialogPortal'],
		why: 'RAC has no Portal part — Modal/ModalOverlay own the overlay layer',
	},
	'react-aria/sheet.tsrx': {
		slots: ['sheet-portal'],
		exports: ['SheetPortal', 'SheetOverlay'],
		why: 'RAC has no Portal part, and upstream folds the overlay into Sheet itself',
	},
	'react-aria/breadcrumb.tsrx': {
		exports: ['BreadcrumbSeparator'],
		why: 'RAC Breadcrumbs draws its own separators, so upstream defines no separator part',
	},

	// Genuine primitive-level differences: RAC composes these trees out of
	// different parts than Radix does, so the missing slots/exports have no
	// counterpart to port.
	'react-aria/dialog.tsrx': {
		slots: ['dialog-portal'],
		exports: ['DialogPortal', 'DialogContent'],
		why: 'RAC has no Portal part — Modal/ModalOverlay own the overlay layer — and upstream folds the content wrapper into Dialog itself',
	},
	'react-aria/popover.tsrx': {
		slots: ['popover', 'popover-anchor'],
		exports: ['PopoverAnchor', 'PopoverContent'],
		why: 'RAC positions against its trigger, so there is no separate root or anchor part',
	},
	'react-aria/scroll-area.tsrx': {
		slots: ['scroll-area-viewport', 'scroll-area-scrollbar', 'scroll-area-thumb'],
		exports: ['ScrollBar'],
		why: 'upstream aria scroll-area is one native-overflow element with a single slot',
	},
};

describe('@octanejs/shadcn — cross-base structural contract', () => {
	const ALTERNATES = ['react-aria', 'base-ui'] as const;

	for (const base of ALTERNATES) {
		const shared = families(base).filter((f) => existsSync(join(baseDir('radix'), f)));
		if (shared.length === 0) continue;

		it(`${base} keeps every data-slot name the Radix base defines`, () => {
			for (const file of shared) {
				const own = dataSlots(read(base, file));
				const allowed = new Set(KNOWN_DIVERGENCES[`${base}/${file}`]?.slots ?? []);
				for (const slot of dataSlots(read('radix', file))) {
					if (allowed.has(slot)) continue;
					expect(own.has(slot), `${base}/${file} is missing data-slot="${slot}"`).toBe(true);
				}
			}
		});

		it(`${base} exports every component the Radix base exports`, () => {
			for (const file of shared) {
				// A superset is allowed: upstream's aria base adds LinkButton, which
				// the Radix base has no equivalent for.
				const own = exportedNames(read(base, file));
				const allowed = new Set(KNOWN_DIVERGENCES[`${base}/${file}`]?.exports ?? []);
				for (const name of exportedNames(read('radix', file))) {
					if (allowed.has(name)) continue;
					expect(own.has(name), `${base}/${file} does not export ${name}`).toBe(true);
				}
			}
		});
	}
});
