import { useId } from 'octane';

// Octane always provides useId, so the React 17 random-UUID fallback is not
// needed. Generated IDs remain opaque and stable across SSR and hydration.
export const useFormId = useId;
