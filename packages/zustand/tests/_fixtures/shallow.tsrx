import { create } from '@octanejs/zustand';
import { useShallow } from '@octanejs/zustand/shallow';

export const useObj = create(
	(set) => ({
		a: 0,
		b: 0,
		bumpA: () => set((s) => ({ a: s.a + 1 })),
		bumpB: () => set((s) => ({ b: s.b + 1 })),
	}),
);

// Object-slice selector WITHOUT useShallow: returns a fresh object every call, so
// the snapshot is never Object.is-equal → re-renders on EVERY store change (and
// is the classic unstable-selector footgun).
export function RawObject(props: { onRender: () => void }) @{
	const slice = useObj((s) => ({ a: s.a }));
	props.onRender();
	<span id="a">
		{slice.a as string}
	</span>
}

// Same selection WITH useShallow: the slice is memoized by shallow equality, so it
// only re-renders when `a` actually changes.
export function ShallowObject(props: { onRender: () => void }) @{
	const slice = useObj(useShallow((s) => ({ a: s.a })));
	props.onRender();
	<span id="a">
		{slice.a as string}
	</span>
}
