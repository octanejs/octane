import type * as MotionTypes from '@octanejs/motion';
import type {
	Assert as ContractAssert,
	Equal,
} from '../../../../scripts/react-port/type-assertions';
import {
	useAnimate,
	useMotionValue,
	useMotionValueEvent,
	useScroll,
	useSpring,
	useTransform,
} from '@octanejs/motion';

declare function expectType<T>(value: T): void;
type IsAny<T> = 0 extends 1 & T ? true : false;
type Assert<T extends true> = T;

const value = useMotionValue(0);
expectType<MotionTypes.MotionValue<number>>(value);
value.set(10);
// @ts-expect-error Numeric motion values reject strings.
value.set('ten');
const spring = useSpring(0);
spring.set(1);
// @ts-expect-error Numeric springs reject strings.
spring.set('one');
expectType<MotionTypes.MotionValue<number>>(useSpring(value));
expectType<MotionTypes.MotionValue<string>>(useSpring('10px'));
expectType<MotionTypes.MotionValue<number>>(useTransform(value, (latest) => latest * 2));
expectType<MotionTypes.MotionValue<string>>(useTransform(value, [0, 10], ['red', 'blue']));
expectType<MotionTypes.MotionValue<number>>(useTransform([value, spring], ([a, b]) => a + b));
expectType<MotionTypes.MotionValue<number>>(useTransform(() => value.get() * 2));
// @ts-expect-error The mapping callback receives a number.
useTransform(value, (latest: string) => latest.length);
const scroll = useScroll({ container: document.createElement('div') });
expectType<MotionTypes.MotionValue<number>>(scroll.scrollYProgress);
const [scope, animate] = useAnimate<HTMLDivElement>();
expectType<MotionTypes.AnimationScope<HTMLDivElement>>(scope);
if (scope.current) animate(scope.current, { opacity: 0 }, { duration: 0 });
// @ts-expect-error Only element scopes can be used as host refs.
useAnimate<number>();
useMotionValueEvent(value, 'change', (latest) => expectType<number>(latest));
// @ts-expect-error Change callbacks must accept the motion value's number type.
useMotionValueEvent(value, 'change', (latest: string) => latest);
// @ts-expect-error Unknown motion value events are rejected.
useMotionValueEvent(value, 'click', () => {});
const config: MotionTypes.MotionConfigProps = {
	isValidProp: (key) => key !== 'private',
	transition: { duration: 0.2 },
};
// @ts-expect-error Prop validators must return a boolean.
const invalidConfig: MotionTypes.MotionConfigProps = { isValidProp: (key) => key };
export type NumericValueIsPrecise = Assert<
	IsAny<ReturnType<typeof value.get>> extends false ? true : false
>;
export type ScopeIsPrecise = Assert<IsAny<typeof scope.current> extends false ? true : false>;
export { config, invalidConfig };

export type ConfigPredicate = ContractAssert<
	Equal<MotionTypes.MotionConfigProps['isValidProp'], ((key: string) => boolean) | undefined>
>;

const mapped = useTransform(value, (current) => current * 2);
export type TransformedValue = ContractAssert<
	Equal<typeof mapped, MotionTypes.MotionValue<number>>
>;

export type TransformCallArity = ContractAssert<
	Equal<Parameters<typeof useTransform>['length'], 2>
>;
