// From alien-signals (https://github.com/stackblitz/alien-signals), benchs/propagate.mjs at
// 113f581425, under the MIT license in ../LICENSE. One change: each effect body is
// `void last()`, because the original returns the value read and alien-signals 3.2.1
// calls an effect's return value as its cleanup, which throws on the first update.
import { bench, boxplot, run } from 'mitata';
import { computed, effect, signal } from '../esm/index.mjs';

boxplot(() => {
	bench('propagate: $w * $h', function* (state) {
		const w = state.get('w');
		const h = state.get('h');
		const src = signal(1);
		for (let i = 0; i < w; i++) {
			let last = src;
			for (let j = 0; j < h; j++) {
				const prev = last;
				last = computed(() => prev() + 1);
			}
			effect(() => void last());
		}
		yield () => src(src() + 1);
	})
		.args('h', [1, 10, 100])
		.args('w', [1, 10, 100]);
});

run({ format: 'markdown' });
