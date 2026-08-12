import {
	animated,
	Controller,
	SpringValue,
	type ControllerUpdate,
	useSpring,
	useSpringRef,
	useSpringValue,
	useSprings,
	useTrail,
	useTransition,
} from '@octanejs/spring';
import { Parallax, ParallaxLayer, type IParallax } from '@octanejs/spring/parallax';

declare function expectType<T>(value: T): void;

const value = new SpringValue(0);
expectType<number>(value.get());
expectType<Promise<unknown>>(value.start({ to: 1, config: { tension: 200 } }));

const update: ControllerUpdate<{ x: number; opacity: number }> = {
	from: { x: 0, opacity: 0 },
	to: { x: 100, opacity: 1 },
	immediate: (key) => key === 'opacity',
};
const controller = new Controller(update);
expectType<number>(controller.springs.x.get());

const [styles, api] = useSpring(() => update, []);
const objectStyles = useSpring(update);
objectStyles.x.get();
expectType<SpringValue<number>>(styles.x);
expectType<Controller<{ x: number; opacity: number }>>(api);
expectType<SpringValue<number>>(useSpringValue(0));
expectType<ReturnType<typeof useSpringRef<{ x: number }>>>(useSpringRef<{ x: number }>());

const [springs] = useSprings(2, [{ from: { x: 0 }, to: { x: 1 } }]);
expectType<SpringValue<number>>(springs[0]!.x);
const trail = useTrail(2, { from: { x: 0 }, to: { x: 1 } });
expectType<SpringValue<number>>(trail[0]!.x);
const [controlledTrail, trailApi] = useTrail(2, { from: { x: 0 }, to: { x: 1 } }, []);
expectType<SpringValue<number>>(controlledTrail[0]!.x);
expectType<ReturnType<typeof useSpringRef<{ x: number }>>>(trailApi);

const transitions = useTransition([{ id: 'a', label: 'A' }], {
	keys: (item) => item.id,
	from: { opacity: 0 },
	enter: { opacity: 1 },
	leave: { opacity: 0 },
});
transitions((transitionStyles, item, transition) => (
	<animated.div key={transition.key} style={transitionStyles} data-label={item.label} />
));

const parallax = { current: null as IParallax | null };
const scene = (
	<Parallax ref={parallax} pages={3} horizontal={false}>
		<ParallaxLayer offset={1} speed={0.5} sticky={{ start: 1, end: 2 }} />
	</Parallax>
);
expectType<unknown>(scene);

// @ts-expect-error spring values retain their initial value type
value.set('wrong');
