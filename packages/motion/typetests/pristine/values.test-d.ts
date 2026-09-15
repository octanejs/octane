import type { Assert, Equal } from '../../../../scripts/react-port/type-assertions';
import {
	useMotionValue,
	useMotionValueEvent,
	useTransform,
	useSpring,
	MotionConfig,
} from 'framer-motion';
const x = useMotionValue(0);
type Value = Assert<Equal<ReturnType<typeof x.get>, number>>;
const y = useTransform(x, (current) => current * 2);
type Derived = Assert<Equal<ReturnType<typeof y.get>, number>>;
const spring = useSpring(x);
type Spring = Assert<Equal<ReturnType<typeof spring.get>, number>>;
useMotionValueEvent(x, 'change', (value) => {
	const current: number = value;
	void current;
});
// @ts-expect-error Numeric motion values reject strings.
x.set('bad');
// @ts-expect-error Prop filters must return boolean.
const config: Parameters<typeof MotionConfig>[0] = { isValidProp: () => 'yes' };
