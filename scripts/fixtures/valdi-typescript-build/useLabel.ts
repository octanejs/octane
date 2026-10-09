import { useState } from 'octane';

export function useLabel(initial: string) {
	return useState<string>(initial);
}
