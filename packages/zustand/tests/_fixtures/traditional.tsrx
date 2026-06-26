import { createWithEqualityFn } from '@octanejs/zustand/traditional';
import { shallow } from '@octanejs/zustand/shallow';

// createWithEqualityFn with `shallow` as the DEFAULT equality function.
export const useEq = createWithEqualityFn(
	(set) => ({
		a: 0,
		b: 0,
		bumpA: () => set((s) => ({ a: s.a + 1 })),
		bumpB: () => set((s) => ({ b: s.b + 1 })),
	}),
	shallow,
);

// Object slice relying on the store's DEFAULT shallow equality.
export function EqDefault(props: { onRender: () => void }) @{
	const slice = useEq((s) => ({ a: s.a }));
	props.onRender();
	<span id="a">
		{slice.a as string}
	</span>
}

// Object slice with a PER-CALL equality function override.
export function EqPerCall(props: { onRender: () => void }) @{
	const slice = useEq((s) => ({ a: s.a }), shallow);
	props.onRender();
	<span id="a">
		{slice.a as string}
	</span>
}
