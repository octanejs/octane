import { useIsHydrating } from '../../src/utils/useIsHydrating';

export function HydrationStateFixture() @{
	const isHydrating = useIsHydrating();
	<span data-testid="value">{String(isHydrating)}</span>
}
