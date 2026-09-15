// Adapted from react-hook-form@7.88.0 src/utils/stringToPath.ts for Octane.
const FIELD_PATH_RE = /[.[\]'"]/;

export default (input: string): string[] => input.split(FIELD_PATH_RE).filter(Boolean);
