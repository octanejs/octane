// Vercel Node function wrapping the production SSR handler.
//
// `pnpm build` (vite build + @octanejs/vite-plugin) produces the
// self-contained server bundle at dist/server/entry.js; its `nodeHandler`
// export speaks Vercel's Node (req, res) signature directly. vercel.json
// rewrites all non-asset traffic here (static files in dist/client win first)
// and `includeFiles` ships dist/server/** (entry.js reads its sibling
// index.html template at boot).
export { nodeHandler as default } from '../dist/server/entry.js';
