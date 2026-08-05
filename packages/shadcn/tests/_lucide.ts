// Shadcn behavior tests need the icon implementations used by its components,
// not Lucide's ~2k-module root export inventory. The Lucide package owns that
// separate surface check; this facade preserves the exact component identities
// while keeping Shadcn's unbundled test graph proportional to what it renders.
export { default as CheckIcon } from '../../lucide/src/icons/check.js';
export { default as ChevronDownIcon } from '../../lucide/src/icons/chevron-down.js';
export { default as ChevronLeftIcon } from '../../lucide/src/icons/chevron-left.js';
export { default as ChevronRightIcon } from '../../lucide/src/icons/chevron-right.js';
export { default as ChevronUpIcon } from '../../lucide/src/icons/chevron-up.js';
export { default as CircleCheckIcon } from '../../lucide/src/icons/circle-check.js';
export { default as CircleIcon } from '../../lucide/src/icons/circle.js';
export { default as InfoIcon } from '../../lucide/src/icons/info.js';
export { default as Loader2Icon } from '../../lucide/src/icons/loader-circle.js';
export { default as MoreHorizontalIcon } from '../../lucide/src/icons/ellipsis.js';
export { default as OctagonXIcon } from '../../lucide/src/icons/octagon-x.js';
export { default as PanelLeftIcon } from '../../lucide/src/icons/panel-left.js';
export { default as TriangleAlertIcon } from '../../lucide/src/icons/triangle-alert.js';
export { default as XIcon } from '../../lucide/src/icons/x.js';
