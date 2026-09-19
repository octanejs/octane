import { act } from 'octane';
import { waitSingleFrame as waitForAnimationFrame } from '../upstream/test/wait';

export * from '../upstream/test/index';

// An awaited frame can update transition state. Commit that work before the
// adapted test observes focus or DOM, while retaining the upstream frame wait.
export function waitSingleFrame(): Promise<void> {
	return act(waitForAnimationFrame);
}
