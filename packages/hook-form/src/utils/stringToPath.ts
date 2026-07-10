// Vendored from react-hook-form@7.81.0 src/utils/stringToPath.ts (octane port).
const FIELD_PATH_RE = /[.[\]'"]/;

export default (input: string): string[] => input.split(FIELD_PATH_RE).filter(Boolean);
