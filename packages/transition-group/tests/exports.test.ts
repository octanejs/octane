import { describe, expect, it } from 'vitest';
import * as binding from '../src/index.ts';

describe('@octanejs/transition-group exports', () => {
	it('matches the pinned upstream root entry', () => {
		expect(Object.keys(binding).sort()).toEqual([
			'CSSTransition',
			'ReplaceTransition',
			'SwitchTransition',
			'Transition',
			'TransitionGroup',
			'config',
		]);
	});
});
