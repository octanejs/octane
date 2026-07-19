// @floating-ui/react's useId, backed by octane's SSR-stable useId.
import { useId as octaneUseId } from 'octane';

export function useId(slot?: symbol | undefined): string {
	return octaneUseId(slot);
}
