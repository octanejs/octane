/**
 * Astro documents kebab/snake named slots as camelCase props for React-shaped
 * frameworks. Shared by SSR and the client hydrator so `client:only` template
 * keys match the prop names emitted during SSR.
 *
 * @param {string} str
 * @returns {string}
 */
export const slotName = (str) => str.trim().replace(/[-_]([a-z])/g, (_, w) => w.toUpperCase());
