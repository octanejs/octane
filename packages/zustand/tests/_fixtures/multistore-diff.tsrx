import { create } from '@octane-ts/zustand';

// Two independent stores in one component — proves the per-call-site slot keeps
// distinct stores (and the same hook used twice) independent, byte-for-byte with
// real zustand on React.
const useBears = create(
	(set) => ({
		bears: 0,
		add: () => set((s) => ({ bears: s.bears + 1 })),
	}),
);
const useFish = create(
	(set) => ({
		fish: 50,
		add: () => set((s) => ({ fish: s.fish + 1 })),
	}),
);

export function Zoo() @{
	const bears = useBears((s) => s.bears);
	const fish = useFish((s) => s.fish);
	const addBear = useBears((s) => s.add);
	const addFish = useFish((s) => s.add);
	<div>
		<span id="bears">
			{bears as string}
		</span>
		<span id="fish">
			{fish as string}
		</span>
		<button id="addBear" onClick={addBear}>addBear</button>
		<button id="addFish" onClick={addFish}>addFish</button>
	</div>
}
