// Server-render helper for the SSR tests — mirrors the hydration rig in
// octane's own repo (packages/octane/tests/_hydration-ssr.ts).
//
// Server components must be compiled by the octane compiler in SERVER mode —
// client-compiled output cannot be fed to renderToString. Vite's ssrLoadModule
// runs the real compiler (octane({ ssr: true })) against the same .tsrx
// fixture the client tests import, with `octane` aliased to the server runtime
// so plain-.ts bindings like index.ts resolve hooks server-side too.
import { resolve } from 'node:path'
import { octane } from 'octane/compiler/vite'
import { createServer, type ViteDevServer } from 'vite'

let projectRoot = resolve(import.meta.dirname, '..')
let serverRuntime = resolve(projectRoot, 'node_modules/octane/dist/server/index.js')

export async function withSsrServer<T>(
  run: (server: ViteDevServer) => Promise<T>
): Promise<T> {
  let server = await createServer({
    configFile: false,
    root: projectRoot,
    logLevel: 'silent',
    appType: 'custom',
    plugins: [octane({ ssr: true })],
    resolve: {
      alias: [
        { find: /^octane$/, replacement: serverRuntime },
        { find: /^octane\/server$/, replacement: serverRuntime }
      ]
    },
    server: { middlewareMode: true, hmr: false }
  })

  try {
    return await run(server)
  } finally {
    await server.close()
  }
}

/**
 * Render one fixture export through the server-mode compiler and return the
 * rendered HTML (with hydration markers) for a client hydrateRoot pass.
 */
export async function renderFixtureToString(
  fixture: string,
  exportName: string,
  props?: unknown
): Promise<string> {
  return withSsrServer(async server => {
    let [module, runtime] = await Promise.all([
      server.ssrLoadModule(fixture),
      server.ssrLoadModule(serverRuntime)
    ])
    let component = module[exportName]
    if (typeof component !== 'function') {
      throw new Error(`Missing server fixture export: ${fixture}#${exportName}`)
    }
    let result = await runtime.renderToString(component, props)
    return typeof result === 'string' ? result : result.html
  })
}
