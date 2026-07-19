import catalogJson from '../../../packages/octane/error-codes/codes.json';

export interface ErrorCodeEntry {
	code: string;
	message: string;
	argumentCount: number;
	status: 'active' | 'retired';
}

interface ErrorCodeCatalog {
	schemaVersion: 1;
	codes: Record<
		string,
		{
			message: string;
			argumentCount: number;
			status: 'active' | 'retired';
		}
	>;
}

const catalog = catalogJson as ErrorCodeCatalog;

export const errorCodes: readonly ErrorCodeEntry[] = Object.entries(catalog.codes)
	.map(([code, entry]) => ({ code, ...entry }))
	.sort((left, right) => Number(left.code) - Number(right.code));

export function findErrorCode(code: string): ErrorCodeEntry | undefined {
	return errorCodes.find((entry) => entry.code === code);
}

export function errorArguments(search: Record<string, unknown>): string[] {
	const value = search['args[]'];
	if (Array.isArray(value)) return value.map(String);
	return typeof value === 'string' ? [value] : [];
}

// Leave unfilled placeholders visible and ignore surplus values. This mirrors
// what the decoder can truthfully reconstruct without inventing information.
// The caller renders this return value through a text hole, never as HTML.
export function decodeErrorMessage(message: string, args: readonly string[]): string {
	let argumentIndex = 0;
	return message.replace(/%s/g, () => {
		if (argumentIndex >= args.length) return '%s';
		return args[argumentIndex++]!;
	});
}
