import { renderToReadableStream } from 'octane/server'
import { prerender } from 'octane/static'
import { isbot } from 'isbot'
import { createSsrStreamResponse } from '@tanstack/router-core/ssr/server'
import { finalizeBufferedHtml } from './renderRouterToString'
import type { ComponentBody } from 'octane'
import type { StreamInjectionSource } from 'octane/server'
import type { AnyRouter } from '@tanstack/router-core'

type RouterApp = ComponentBody<{ router: AnyRouter }>
type ServerComponent = Parameters<typeof renderToReadableStream>[0]

// OCTANE PATCH (diverges from the upstream PR-branch file): the router's data
// stream is merged through octane's native `StreamOptions.injection` instead
// of router-core's `transformStreamWithRouter` text transform. Octane emits
// tag-complete chunks and owns the document tail, so the byte-level re-parse
// (closing-tag scans, leftover buffers, the held-`</body>` tail that also
// buffered every post-shell suspense segment until stream end) is unnecessary
// — boundary segments now stream out of order again for document renders.
// Octane's document mode also emits `<!DOCTYPE html>` and folds the leading
// renderer-owned styles into `<head>`, replacing the `prependDoctype` and
// `relocateLeadingOctaneStylesToHead` transforms this file previously piped
// the stream through.
//
// Upstream's serialization timeout is preserved: it arms when octane reports
// the render finished and fails the stream if serialization never completes.
// The script barrier lifts when octane subscribes — octane only subscribes
// after the shell (which carries the barrier anchor) is on the wire, matching
// the transform's lift-after-marker-flush. (`setRenderFinished` lifts it as a
// backstop regardless, exactly as upstream.)

const SERIALIZATION_TIMEOUT_MS = 60_000

export async function renderRouterToStream({
  request,
  router,
  responseHeaders,
  App,
}: {
  request: Request
  router: AnyRouter
  responseHeaders: Headers
  App: RouterApp
}) {
  if (isbot(request.headers.get('User-Agent'))) {
    return renderRouterForBot({ request, router, responseHeaders, App })
  }

  const serverSsr = router.serverSsr
  if (!serverSsr) {
    throw new Error('Invariant failed: router.serverSsr is required')
  }

  const renderController = new AbortController()
  const onRequestAbort = () => renderController.abort(request.signal.reason)
  if (request.signal.aborted) {
    onRequestAbort()
  } else {
    request.signal.addEventListener('abort', onRequestAbort, { once: true })
    serverSsr.onCleanup(() => {
      request.signal.removeEventListener('abort', onRequestAbort)
    })
  }

  let serializationTimeout: ReturnType<typeof setTimeout> | undefined
  let stopSerializationListener: (() => void) | undefined
  let settleDone!: () => void
  let failDone!: (reason: unknown) => void
  const done = new Promise<void>((resolve, reject) => {
    settleDone = resolve
    failDone = reject
  })
  if (serverSsr.isSerializationFinished()) {
    settleDone()
  } else {
    stopSerializationListener = serverSsr.onSerializationFinished(() =>
      settleDone(),
    )
  }
  const releaseInjection = () => {
    if (serializationTimeout !== undefined) {
      clearTimeout(serializationTimeout)
      serializationTimeout = undefined
    }
    stopSerializationListener?.()
    stopSerializationListener = undefined
  }

  const injection: StreamInjectionSource = {
    take: () => serverSsr.takeBufferedHtml() ?? '',
    subscribe(notify) {
      serverSsr.liftScriptBarrier()
      return serverSsr.onInjectedHtml(notify)
    },
    done,
    renderComplete() {
      serverSsr.setRenderFinished()
      if (
        !serverSsr.isSerializationFinished() &&
        serializationTimeout === undefined
      ) {
        serializationTimeout = setTimeout(() => {
          failDone(new Error('Serialization timeout after app render finished'))
        }, SERIALIZATION_TIMEOUT_MS)
      }
    },
  }

  try {
    const stream = await renderToReadableStream(
      App as unknown as ServerComponent,
      { router },
      {
        signal: renderController.signal,
        nonce: router.options.ssr?.nonce,
        injection,
        onError(error) {
          if (!isAbortError(request, error)) {
            console.error('Error in renderToReadableStream:', error)
          }
        },
      },
    )

    // The renderer's stream is the response body verbatim. `allReady` settles
    // in every terminal state (close, abort, fatal, consumer cancel) — the
    // single place to release the injection wiring and the router's SSR state.
    stream.allReady.then(
      () => {
        releaseInjection()
        serverSsr.cleanup()
      },
      () => {
        releaseInjection()
        serverSsr.cleanup()
      },
    )

    return createSsrStreamResponse(
      router,
      new Response(stream as unknown as BodyInit, {
        status: router.stores.statusCode.get(),
        headers: responseHeaders,
      }),
    )
  } catch (error) {
    renderController.abort(error)
    releaseInjection()
    router.serverSsr?.cleanup()
    throw error
  }
}

async function renderRouterForBot({
  request,
  router,
  responseHeaders,
  App,
}: {
  request: Request
  router: AnyRouter
  responseHeaders: Headers
  App: RouterApp
}) {
  try {
    const result = await prerender(
      App as unknown as Parameters<typeof prerender>[0],
      { router },
      {
        signal: request.signal,
        nonce: router.options.ssr?.nonce,
        onError(error) {
          if (!isAbortError(request, error)) {
            console.error('Error in prerender:', error)
          }
        },
      },
    )
    router.serverSsr!.setRenderFinished()

    return new Response(
      finalizeBufferedHtml(
        result.html,
        result.css,
        router.serverSsr!.takeBufferedHtml(),
      ),
      {
        status: router.stores.statusCode.get(),
        headers: responseHeaders,
      },
    )
  } finally {
    router.serverSsr?.cleanup()
  }
}

function isAbortError(request: Request, error: unknown) {
  return (
    (request.signal.aborted && error === request.signal.reason) ||
    (error instanceof Error && error.name === 'AbortError')
  )
}
