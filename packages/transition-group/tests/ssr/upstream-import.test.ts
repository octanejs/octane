import { describe, expect, it } from 'vitest';
import * as binding from '../../src/index.ts';

describe('react-transition-group v4.4.5 server rendering', () => {
	// Per path: packages/transition-group/upstream/test/SSR-test.js:9-49
	it('should import react-transition-group in node env', function importInNode() {
		expect(binding.Transition).toBeTypeOf('function');
		expect(binding.CSSTransition).toBeTypeOf('function');
		expect(binding.TransitionGroup).toBeTypeOf('function');
	});
});
