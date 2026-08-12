// Shared port-authored type probes. The only permitted difference versus the
// sibling file is the import root (`motion/react` vs `@octanejs/motion`); see
// ../assertions.md.
import {
	AnimatePresence,
	MotionConfig,
	motion,
	useAnimate,
	useMotionValue,
	useSpring,
	useTransform,
} from 'motion/react';

declare function expectType<T>(value: T): void;

function consumerTypeFixtures() {
	// 1. motion.div host factory is accepted.
	expectType<typeof motion.div>(motion.div);
	// 2. AnimatePresence is accepted.
	expectType<typeof AnimatePresence>(AnimatePresence);
	// 3. MotionConfig is accepted.
	expectType<typeof MotionConfig>(MotionConfig);

	const x = useMotionValue(0);
	// 4. useMotionValue returns a readable MotionValue.
	expectType<number>(x.get());
	// 5. useTransform mapping form is accepted.
	expectType<number>(
		useTransform(x, function map(value: number) {
			return value * 2;
		}).get(),
	);
	// 6. useSpring is accepted.
	expectType<number>(useSpring(x).get());
	// 7. useAnimate is accepted.
	expectType<typeof useAnimate>(useAnimate);

	// 8. Rejected assertion: number is not a string.
	// @ts-expect-error fixture negative control: number is not assignable to string.
	const rejectedNumberAsString: string = 0;
	// 9. Rejected assertion: string is not a number.
	// @ts-expect-error fixture negative control: string is not assignable to number.
	const rejectedStringAsNumber: number = 'nope';

	void rejectedNumberAsString;
	void rejectedStringAsNumber;
}

void consumerTypeFixtures;
void motion;
void AnimatePresence;
void MotionConfig;
void useAnimate;
