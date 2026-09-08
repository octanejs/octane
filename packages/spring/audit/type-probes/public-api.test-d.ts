import { Controller, SpringValue, type ControllerUpdate } from '@react-spring/web';

declare function expectType<T>(value: T): void;

const value = new SpringValue(0);
expectType<number>(value.get());
expectType<Promise<unknown>>(value.start({ to: 1, config: { tension: 200 } }));

const update: ControllerUpdate<{ x: number; opacity: number }> = {
	from: { x: 0, opacity: 0 },
	to: { x: 100, opacity: 1 },
};
const controller = new Controller(update);
expectType<number>(controller.springs.x.get());

// @ts-expect-error spring values retain their initial value type
value.set('wrong');
