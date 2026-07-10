// Vendored from react-hook-form@7.81.0 src/utils/isKey.ts (octane port).
const IS_KEY_RE = /^\w*$/;

export default (value: string) => IS_KEY_RE.test(value);
