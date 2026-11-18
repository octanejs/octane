import type { CSSProperties } from 'octane';

export function parseNumericStyleValue(value: CSSProperties['height']): number | undefined {
	if (value !== undefined) {
		switch (typeof value) {
			case 'number': {
				return value;
			}
			case 'string': {
				if (value.endsWith('px')) {
					return parseFloat(value);
				}
				break;
			}
		}
	}
}
