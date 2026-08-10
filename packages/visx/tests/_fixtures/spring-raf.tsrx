import { useSpring } from '../../src/internal/spring.tsrx';

export type SpringRafFixtureProps = {
	value: number;
};

export function SpringRafFixture(props: SpringRafFixtureProps) {
	const spring = useSpring({ x: props.value });
	return <output id="spring-value">
		{String(spring.x.get()) as string}
	</output>;
}
