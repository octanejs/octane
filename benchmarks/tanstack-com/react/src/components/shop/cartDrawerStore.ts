import { create } from 'zustand';

/**
 * Tiny store that controls the global cart drawer's open state. Kept in a
 * module rather than React context so any component — the navbar button,
 * the "Add to cart" button on the PDP, etc. — can trigger it without
 * threading props.
 */
export const useCartDrawerStore = create<{
	open: boolean;
	setOpen: (open: boolean) => void;
	openDrawer: () => void;
	closeDrawer: () => void;
}>((set) => ({
	open: false,
	setOpen: (open) => set({ open }),
	openDrawer: () => set({ open: true }),
	closeDrawer: () => set({ open: false }),
}));
