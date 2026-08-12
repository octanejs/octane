import type { OctaneNode } from 'octane';
import { Progress, useProgress } from '../src/index.js';

const state = useProgress.getState();
const active: boolean = state.active;
const errors: string[] = state.errors;
const progress: number = state.progress;
useProgress.setState({ active: true });

const props: Parameters<typeof Progress>[0] = {
	children(result) {
		const item: string = result.item;
		const loaded: number = result.loaded;
		const total: number = result.total;
		void [item, loaded, total];
		return null as OctaneNode;
	},
};

void [active, errors, progress, props];

// @ts-expect-error Progress render props receive structured loading state.
const invalid: Parameters<typeof Progress>[0] = { children: (value: string) => value };
void invalid;
