/** @jsxImportSource @octanejs/three/intrinsics */
import { create } from '@octanejs/zustand/universal';
import { DefaultLoadingManager } from 'three';
import { resolveRenderChildren, type RenderChildren } from './octane-children.js';

interface Data {
	errors: string[];
	active: boolean;
	progress: number;
	item: string;
	loaded: number;
	total: number;
}

let saveLastTotalLoaded = 0;

export const useProgress = /* @__PURE__ */ create<Data>((set) => {
	DefaultLoadingManager.onStart = (item, loaded, total) => {
		set({
			active: true,
			item,
			loaded,
			total,
			progress: ((loaded - saveLastTotalLoaded) / (total - saveLastTotalLoaded)) * 100,
		});
	};
	DefaultLoadingManager.onLoad = () => set({ active: false });
	DefaultLoadingManager.onError = (item) => set((state) => ({ errors: [...state.errors, item] }));
	DefaultLoadingManager.onProgress = (item, loaded, total) => {
		if (loaded === total) saveLastTotalLoaded = total;
		set({
			active: true,
			item,
			loaded,
			total,
			progress: ((loaded - saveLastTotalLoaded) / (total - saveLastTotalLoaded)) * 100 || 100,
		});
	};
	return { errors: [], active: false, progress: 0, item: '', loaded: 0, total: 0 };
});

export function Progress({ children }: { children?: RenderChildren<Data> }) @{
	const result = useProgress();
	<>
		{resolveRenderChildren(children, result)}
	</>
}
