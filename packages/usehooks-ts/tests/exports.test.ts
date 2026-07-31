import { describe, expect, it } from 'vitest';
import * as hooks from '@octanejs/usehooks-ts';

const supported = [
	'useBoolean',
	'useCounter',
	'useDebounceCallback',
	'useDebounceValue',
	'useInterval',
	'useIsMounted',
	'useMap',
	'useStep',
	'useTimeout',
	'useToggle',
	'useUnmount',
];

describe('@octanejs/usehooks-ts exports', () => {
	it('exports exactly the verified 3.1.1 cohort', () => {
		expect(Object.keys(hooks).sort()).toEqual(supported);
	});

	it('does not silently expose deferred host hooks', () => {
		expect('useMediaQuery' in hooks).toBe(false);
		expect('useLocalStorage' in hooks).toBe(false);
		expect('useIntersectionObserver' in hooks).toBe(false);
	});
});
