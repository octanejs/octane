import './instrument.server.mjs'

import { wrapFetchWithSentry } from '@sentry/tanstackstart-react'
import handler, { createServerEntry } from '@tanstack/react-start/server-entry'
import { runWithDatabaseContext } from '~/db/client'
import { runScheduledTasks } from '~/server/scheduled.server'
import {
  runWithHostRuntimeContext,
  runWithHostRuntimeEnv,
} from '~/server/runtime/host.server'
import {
  installProductionFetchProbe,
  installProductionProcessProbe,
  logRequestEnd,
  logRequestError,
  logRequestStart,
  runWithRequestDiagnostics,
} from '~/utils/prod-diagnostics.server'
import { docsContentNegotiationVaryHeader } from '~/utils/http'

const SECURITY_HEADERS = {
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
} as const

const GOOGLE_ANALYTICS_SCRIPT_URL =
  'https://www.googletagmanager.com/gtag/js?id=G-JMT1Z50SPS'
const GOOGLE_ANALYTICS_COLLECT_URL =
  'https://www.google-analytics.com/g/collect'

const STATIC_RESPONSE_LINK_HEADERS = {
  filter: ({ phase }: { phase: 'static' | 'dynamic' }) => phase === 'static',
}

type ScheduledController = {
  cron: string
  scheduledTime: number
}

type WorkerExecutionContext = {
  waitUntil(promise: Promise<unknown>): void
}

installProductionFetchProbe()
installProductionProcessProbe()

function isBrowserDocumentRequest(request: Request) {
  return (
    request.headers.get('Sec-Fetch-Dest') === 'document' ||
    request.headers.get('Sec-Fetch-Mode') === 'navigate'
  )
}

function shouldRewriteDocsRequestToMarkdown(request: Request, url: URL) {
  const acceptHeader = request.headers.get('Accept') || ''

  return (
    acceptHeader.includes('text/markdown') &&
    url.pathname.includes('/docs/') &&
    !url.pathname.endsWith('.md') &&
    !isBrowserDocumentRequest(request)
  )
}

function applyHostingHeaders(response: Response, url: URL) {
  const headers = new Headers(response.headers)

  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    headers.set(key, value)
  }

  if (url.pathname === '/stats/npm/embed') {
    headers.delete('X-Frame-Options')
  }

  if (url.pathname === '/builder' || url.pathname.startsWith('/builder/')) {
    headers.set('Cross-Origin-Opener-Policy', 'same-origin')
    headers.set('Cross-Origin-Embedder-Policy', 'require-corp')
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

function getAnalyticsProxyHeaders(request: Request) {
  const headers = new Headers()

  for (const headerName of ['accept', 'accept-language', 'user-agent']) {
    const value = request.headers.get(headerName)
    if (value) {
      headers.set(headerName, value)
    }
  }

  const contentType = request.headers.get('content-type')
  if (contentType) {
    headers.set('content-type', contentType)
  }

  return headers
}

async function proxyAnalyticsRequest(request: Request, url: URL) {
  const upstreamUrl =
    url.pathname === '/_a/gtag.js'
      ? new URL(GOOGLE_ANALYTICS_SCRIPT_URL)
      : url.pathname === '/_a/g/collect'
        ? new URL(GOOGLE_ANALYTICS_COLLECT_URL)
        : null

  if (!upstreamUrl) {
    return null
  }

  if (url.pathname === '/_a/g/collect') {
    upstreamUrl.search = url.search
  }

  const init: RequestInit = {
    method: request.method,
    headers: getAnalyticsProxyHeaders(request),
    redirect: 'follow',
  }

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    init.body = request.body
  }

  const response = await fetch(upstreamUrl, init)
  return applyHostingHeaders(response, url)
}

const server = createServerEntry(
  wrapFetchWithSentry({
    async fetch(request) {
      return runWithRequestDiagnostics(request, async (context) => {
        return runWithDatabaseContext(async () => {
          const url = new URL(request.url)
          logRequestStart(context)

          try {
            const analyticsResponse = await proxyAnalyticsRequest(request, url)
            if (analyticsResponse) {
              logRequestEnd(context, analyticsResponse.status, {
                analyticsProxy: true,
              })
              return analyticsResponse
            }

            if (shouldRewriteDocsRequestToMarkdown(request, url)) {
              const mdUrl = new URL(request.url)
              mdUrl.pathname = `${url.pathname}.md`
              const mdRequest = new Request(mdUrl, request)
              const mdResponse = await handler.fetch(mdRequest)
              const markdownHeaders = new Headers(mdResponse.headers)
              markdownHeaders.set('Vary', docsContentNegotiationVaryHeader)

              const markdownResponse = new Response(mdResponse.body, {
                status: mdResponse.status,
                statusText: mdResponse.statusText,
                headers: markdownHeaders,
              })

              logRequestEnd(context, mdResponse.status, {
                rewrittenToMarkdown: true,
              })
              return applyHostingHeaders(markdownResponse, url)
            }

            const response = await handler.fetch(request, {
              responseLinkHeader: STATIC_RESPONSE_LINK_HEADERS,
            })
            const hostedResponse = applyHostingHeaders(response, url)

            logRequestEnd(context, response.status)
            return hostedResponse
          } catch (error) {
            logRequestError(context, error)
            throw error
          }
        })
      })
    },
  }),
)

export default {
  fetch(request: Request, env: unknown, context: unknown) {
    return runWithHostRuntimeEnv(env, () =>
      runWithHostRuntimeContext(context, () => server.fetch(request)),
    )
  },
  scheduled(
    controller: ScheduledController,
    env: unknown,
    context: WorkerExecutionContext,
  ) {
    context.waitUntil(
      runWithHostRuntimeEnv(env, () =>
        runWithHostRuntimeContext(context, () =>
          runWithDatabaseContext(() =>
            runScheduledTasks(controller.cron, controller.scheduledTime),
          ),
        ),
      ),
    )
  },
}
