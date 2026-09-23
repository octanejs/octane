import { lazy } from 'octane';

const Heavy = lazy(() => import('./heavy-client'));

export function sextuple(value: number): number {
	return value * 6;
}
