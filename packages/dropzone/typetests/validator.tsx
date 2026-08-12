import type { DropzoneOptions, FileError, ValidatorResult } from '../src/index.tsrx';

// Adapted from upstream type-tests/validator.tsx: sync, async, and wrapped validators compile.
const syncValidator: NonNullable<DropzoneOptions['validator']> = (file) =>
	file.name.endsWith('.csv') ? null : { code: 'nope', message: 'not a csv' };
const asyncValidator: NonNullable<DropzoneOptions['validator']> = async (file) => {
	const errors: FileError[] = [];
	if (file.size === 0) errors.push({ code: 'empty', message: 'empty file' });
	return errors.length > 0 ? errors : null;
};
const wrapped = (fn: (file: File) => ValidatorResult | Promise<ValidatorResult>) => fn;
const wrappedValidator = wrapped(async () => null);
export { asyncValidator, syncValidator, wrappedValidator };
