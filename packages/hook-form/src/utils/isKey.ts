// Adapted from react-hook-form@7.88.0 src/utils/isKey.ts for Octane.
const IS_KEY_RE = /^\w*$/;

export default (value: string) => IS_KEY_RE.test(value);
