// Internal act()-environment bookkeeping — NOT re-exported from the package.
//
// Octane keeps its IS_OCTANE_ACT_ENVIRONMENT flag module-private behind a
// write-only setter (`setIsOctaneActEnvironment`), so the current value is
// mirrored here for the save/disable/restore dance `waitFor` needs (RTL's
// act-compat mirrors React's IS_REACT_ACT_ENVIRONMENT global the same way).
// The mirror is exact as long as the flag is toggled through THIS module —
// which the auto-registering `index.ts` entry and the `pure.ts` asyncWrapper
// both do, matching RTL's assumption about its own global.
import { setIsOctaneActEnvironment } from 'octane';

let isActEnvironment = false;

export function getIsOctaneActEnvironment(): boolean {
	return isActEnvironment;
}

export function setOctaneActEnvironment(value: boolean): void {
	isActEnvironment = value;
	setIsOctaneActEnvironment(value);
}
