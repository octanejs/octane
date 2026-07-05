// Ported verbatim from .base-ui/packages/react/src/internals/serializeValue.ts. Coerces a
// control value to the string a hidden `<input value>` needs.
export function serializeValue(value: unknown): string {
	if (value == null) {
		return '';
	}
	if (typeof value === 'string') {
		return value;
	}
	try {
		return JSON.stringify(value);
	} catch {
		return String(value);
	}
}
