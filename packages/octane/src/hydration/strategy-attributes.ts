/**
 * Serialized built-in strategy parameters. An independent island reads these
 * because its lexical parent (which evaluated `when`) never runs on the client.
 *
 * They stay out of `hydration-markers.js`: the client reads them only from the
 * on-demand strategies chunk, and a module that chunk shared with the islands
 * bootstrap would split into a separate chunk that every islands page loads.
 */
export const HYDRATE_IDLE_TIMEOUT_ATTR = 'data-octane-hydrate-timeout';
export const HYDRATE_VISIBLE_MARGIN_ATTR = 'data-octane-hydrate-root-margin';
export const HYDRATE_VISIBLE_THRESHOLD_ATTR = 'data-octane-hydrate-threshold';
export const HYDRATE_MEDIA_ATTR = 'data-octane-hydrate-media';
