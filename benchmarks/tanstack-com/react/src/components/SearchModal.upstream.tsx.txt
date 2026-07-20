import * as React from 'react'
import { createPortal } from 'react-dom'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { Command } from 'cmdk'
import { twMerge } from 'tailwind-merge'
import {
  Dropdown,
  DropdownTrigger,
  DropdownContent,
  DropdownItem,
} from './Dropdown'
import {
  InstantSearch,
  Snippet,
  Configure,
  useInstantSearch,
  useInfiniteHits,
  useSearchBox,
} from 'react-instantsearch'
import { liteClient } from 'algoliasearch/lite'
import {
  X,
  Search,
  SearchSlash,
  ChevronDown,
  CornerDownLeft,
  ArrowUp,
  Check,
  Copy,
  ExternalLink,
  History,
  MessageSquarePlus,
  ThumbsDown,
  ThumbsUp,
  Maximize2,
  Minimize2,
} from 'lucide-react'
import {
  DefaultKapaApiService,
  KapaProvider,
  processStream,
  useChat,
  type StreamSource,
} from '@kapaai/react-sdk'
import { Streamdown } from 'streamdown'
import { Link, useRouterState } from '@tanstack/react-router'
import { useSearchContext } from '~/contexts/SearchContext'
import { publicLibraries, type Framework } from '~/libraries'
import { frameworkOptions } from '~/libraries/frameworks'
import { capitalize } from '~/utils/utils'
import { usePersistFrameworkPreference } from './FrameworkSelect'
import { shouldPersistFrameworkForHit } from '~/utils/searchRecords'
import { CodeBlock } from '~/components/markdown/CodeBlock'
import { InlineCode } from '~/ui/InlineCode'
import { env } from '~/utils/env'
import { getRoutableInternalLinkTarget, isSafeHref } from '~/utils/url-boundary'

/**
 * Safely decode HTML entities without using innerHTML.
 * Only decodes common entities that appear in Algolia search results.
 */
function decodeHtmlEntities(str: string): string {
  const entities: Record<string, string> = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
    '&apos;': "'",
    '&#x27;': "'",
    '&#x2F;': '/',
    '&#47;': '/',
    '&nbsp;': ' ',
    '&#160;': ' ',
    '&ndash;': '–',
    '&mdash;': '—',
    '&hellip;': '…',
    '&copy;': '©',
    '&reg;': '®',
    '&trade;': '™',
  }

  return str.replace(
    /&(?:#(?:x[0-9a-fA-F]+|[0-9]+)|[a-zA-Z]+);/g,
    (match) => entities[match] ?? match,
  )
}

// Algolia hit types - our docs-specific shape
interface AlgoliaHierarchy {
  lvl0?: string
  lvl1?: string
  lvl2?: string
  lvl3?: string
  lvl4?: string
  lvl5?: string
  lvl6?: string
  [key: string]: string | undefined
}

interface AlgoliaHighlightResult {
  value?: string
  matchLevel?: string
  matchedWords?: string[]
}

// Docs-specific hit shape from Algolia
// Using Record for flexibility with the Algolia SDK types
interface AlgoliaHit extends Record<string, unknown> {
  objectID: string
  url: string
  url_without_anchor?: string
  urlWithAnchor?: string
  library?: string
  framework?: string
  routeStyle?: string
  hierarchy: AlgoliaHierarchy
  content?: string
  type?: string
  __position: number
  __queryID?: string
  _highlightResult?: Record<string, unknown>
  _snippetResult?: Record<string, unknown>
}

type SearchHitPageFields = {
  url: string
  url_without_anchor?: string
  urlWithAnchor?: string
}

function getSearchHitPageKey(hit: SearchHitPageFields) {
  const hitUrl = hit.url_without_anchor ?? hit.urlWithAnchor ?? hit.url

  try {
    const url = new URL(hitUrl, 'https://tanstack.com')
    return `${url.origin}${decodeURIComponent(url.pathname)}${url.search}`
  } catch {
    return hitUrl.split('#')[0].replace(/%40/gi, '@')
  }
}

function dedupeSearchHitsByPage<THit extends SearchHitPageFields>(
  hits: THit[],
) {
  const seenPageKeys = new Set<string>()

  return hits.filter((hit) => {
    const pageKey = getSearchHitPageKey(hit)

    if (seenPageKeys.has(pageKey)) {
      return false
    }

    seenPageKeys.add(pageKey)
    return true
  })
}

// Custom Highlight component that decodes HTML entities
function DecodedHighlight({
  attribute,
  hit,
}: {
  attribute: string
  hit: AlgoliaHit
}) {
  // Navigate nested paths for both raw value and highlight result
  const getNestedValue = (
    obj: Record<string, unknown> | undefined,
    path: string,
  ): unknown => {
    let current: unknown = obj
    for (const key of path.split('.')) {
      if (current == null || typeof current !== 'object') return undefined
      current = (current as Record<string, unknown>)[key]
    }
    return current
  }

  const highlighted = (
    getNestedValue(
      hit._highlightResult as Record<string, unknown>,
      attribute,
    ) as AlgoliaHighlightResult | undefined
  )?.value
  const raw = getNestedValue(
    hit as unknown as Record<string, unknown>,
    attribute,
  ) as string | undefined

  if (!highlighted) {
    return <>{decodeHtmlEntities(raw || '')}</>
  }

  // Parse the highlighted string and decode entities while preserving <mark> tags
  // First, preserve mark tags with placeholders
  const withPlaceholders = highlighted
    .replace(/<mark>/g, '###MARK###')
    .replace(/<\/mark>/g, '###/MARK###')

  // Decode HTML entities
  const decoded = decodeHtmlEntities(withPlaceholders)

  // Strip any other HTML tags for security (only allow mark tags)
  const sanitized = decoded.replace(/<[^>]*>/g, '')

  // Restore mark tags
  const final = sanitized
    .replace(/###MARK###/g, '<mark>')
    .replace(/###\/MARK###/g, '</mark>')

  return <span dangerouslySetInnerHTML={{ __html: final }} />
}

const searchClient = liteClient(
  'FQ0DQ6MA3C',
  '10c34d6a5c89f6048cf644d601e65172',
)
const searchIndexName = 'tanstack-test'
const AI_DOCK_WIDTH_STORAGE_KEY = 'tanstack-ai-dock-width'
const AI_DOCK_MIN_WIDTH = 320
const AI_DOCK_DEFAULT_WIDTH = 360
const AI_DOCK_MAX_WIDTH_RATIO = 0.5
const AI_DOCK_MAXIMIZED_WIDTH = 1200
const DEFAULT_SEARCH_FRAMEWORK: Framework = 'react'
const KAPA_RECAPTCHA_READY_TIMEOUT_MS = 8_000
const KAPA_INTEGRATION_ID = '86e864f7-401e-48c8-ac6f-5fcbc86c5668'

type SearchSurface = 'modal' | 'dock'
type AiDockStyle = React.CSSProperties & {
  '--ai-dock-width': string
  '--ai-dock-max-width': string
}

function getAiDockMaxWidth(viewportWidth: number) {
  return Math.max(
    AI_DOCK_MIN_WIDTH,
    Math.floor(viewportWidth * AI_DOCK_MAX_WIDTH_RATIO),
  )
}

function clampAiDockWidth(width: number, viewportWidth: number) {
  return Math.min(
    Math.max(Math.round(width), AI_DOCK_MIN_WIDTH),
    getAiDockMaxWidth(viewportWidth),
  )
}

function readAiDockWidth() {
  if (typeof window === 'undefined') {
    return AI_DOCK_DEFAULT_WIDTH
  }

  const storedWidth = Number(localStorage.getItem(AI_DOCK_WIDTH_STORAGE_KEY))

  if (!Number.isFinite(storedWidth)) {
    return clampAiDockWidth(AI_DOCK_DEFAULT_WIDTH, window.innerWidth)
  }

  return clampAiDockWidth(storedWidth, window.innerWidth)
}

function writeAiDockWidth(width: number) {
  if (typeof window === 'undefined') {
    return
  }

  localStorage.setItem(AI_DOCK_WIDTH_STORAGE_KEY, String(Math.round(width)))
}

function waitForKapaRecaptchaReady() {
  if (typeof window === 'undefined') {
    return Promise.resolve()
  }

  return new Promise<void>((resolve) => {
    let timeoutId: number | null = null
    let intervalId: number | null = null
    let isSettled = false
    let hasRegisteredReadyCallback = false

    const cleanup = () => {
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId)
        timeoutId = null
      }

      if (intervalId !== null) {
        window.clearInterval(intervalId)
        intervalId = null
      }
    }

    const finish = () => {
      if (isSettled) {
        return
      }

      isSettled = true
      cleanup()
      window.setTimeout(resolve, 0)
    }

    const checkReady = () => {
      if (hasRegisteredReadyCallback) {
        return true
      }

      const enterprise = window.grecaptcha?.enterprise

      if (!enterprise) {
        return false
      }

      hasRegisteredReadyCallback = true

      if (intervalId !== null) {
        window.clearInterval(intervalId)
        intervalId = null
      }

      enterprise.ready(finish)
      return true
    }

    timeoutId = window.setTimeout(finish, KAPA_RECAPTCHA_READY_TIMEOUT_MS)

    if (checkReady()) {
      return
    }

    intervalId = window.setInterval(checkReady, 50)
  })
}

function buildSearchFilters({
  selectedLibrary,
  selectedFramework,
}: {
  selectedLibrary: string
  selectedFramework: string
}) {
  const filterParts: string[] = ['(version:latest OR version:all)']

  if (selectedLibrary) {
    filterParts.push(`library:${selectedLibrary}`)
  }

  if (selectedFramework) {
    filterParts.push(`(framework:${selectedFramework} OR framework:all)`)
  }

  return filterParts.join(' AND ')
}

function getSearchableLibraries() {
  return publicLibraries.filter((library) => library.latestVersion)
}

function isFramework(value: string): value is Framework {
  return frameworkOptions.some((framework) => framework.value === value)
}

function getRouteFramework(pathname: string) {
  const pathParts = pathname.split('/').filter(Boolean)
  const frameworkIndex = pathParts.findIndex((part) => part === 'framework')

  if (frameworkIndex === -1) {
    return ''
  }

  const routeFramework = pathParts[frameworkIndex + 1]

  return routeFramework && isFramework(routeFramework) ? routeFramework : ''
}

function getSearchFilterDefaults(pathname: string) {
  const searchableLibraries = getSearchableLibraries()
  const [firstPathPart] = pathname.split('/').filter(Boolean)
  const routeLibrary = searchableLibraries.find(
    (library) => library.id === firstPathPart,
  )
  const availableFrameworks = routeLibrary
    ? routeLibrary.frameworks
    : Array.from(
        new Set(searchableLibraries.flatMap((library) => library.frameworks)),
      )
  const routeFramework = getRouteFramework(pathname)
  const selectedFramework =
    routeFramework && availableFrameworks.includes(routeFramework)
      ? routeFramework
      : availableFrameworks.includes(DEFAULT_SEARCH_FRAMEWORK)
        ? DEFAULT_SEARCH_FRAMEWORK
        : ''

  return {
    selectedLibrary: routeLibrary?.id ?? '',
    selectedFramework,
  }
}

// Context to share filter state between components
const SearchFiltersContext = React.createContext<{
  selectedLibrary: string
  selectedFramework: string
  setSelectedLibrary: (value: string) => void
  setSelectedFramework: (value: string) => void
  refineLibrary: (value: string) => void
  refineFramework: (value: string) => void
  libraryItems: Array<{
    value: string
    label: string
    isRefined: boolean
  }>
  frameworkItems: Array<{
    value: string
    label: string
    isRefined: boolean
  }>
  searchQuery: string
  setSearchQuery: (value: string) => void
  showSearchResults: boolean
  toggleShowSearchResults: () => void
  hideSearchResults: () => void
} | null>(null)

function useSearchFilters() {
  const context = React.useContext(SearchFiltersContext)
  if (!context) {
    throw new Error(
      'useSearchFilters must be used within SearchFiltersProvider',
    )
  }
  return context
}

function SearchFiltersProvider({
  children,
  resetFiltersOnOpen = false,
}: {
  children: React.ReactNode
  resetFiltersOnOpen?: boolean
}) {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })
  const defaultFilters = React.useMemo(
    () => getSearchFilterDefaults(pathname),
    [pathname],
  )
  const [selectedLibrary, setSelectedLibrary] = React.useState(
    defaultFilters.selectedLibrary,
  )
  const [searchQuery, setSearchQuery] = React.useState('')
  const [showSearchResults, setShowSearchResults] = React.useState(() => {
    if (typeof window === 'undefined') return true
    return localStorage.getItem('search-show-results') !== 'false'
  })
  const [selectedFramework, setSelectedFramework] = React.useState(
    defaultFilters.selectedFramework,
  )

  React.useEffect(() => {
    if (!resetFiltersOnOpen) {
      return
    }

    setSelectedLibrary(defaultFilters.selectedLibrary)
    setSelectedFramework(defaultFilters.selectedFramework)
  }, [
    defaultFilters.selectedFramework,
    defaultFilters.selectedLibrary,
    resetFiltersOnOpen,
  ])

  const searchableLibraries = React.useMemo(() => getSearchableLibraries(), [])

  const selectedLibraryInfo = React.useMemo(
    () => searchableLibraries.find((library) => library.id === selectedLibrary),
    [searchableLibraries, selectedLibrary],
  )

  const availableFrameworkValues = React.useMemo(() => {
    if (selectedLibraryInfo) {
      return selectedLibraryInfo.frameworks
    }

    return Array.from(
      new Set(searchableLibraries.flatMap((library) => library.frameworks)),
    )
  }, [searchableLibraries, selectedLibraryInfo])

  React.useEffect(() => {
    if (!selectedLibraryInfo || !selectedFramework) {
      return
    }

    if (
      !selectedLibraryInfo.frameworks.some(
        (framework) => framework === selectedFramework,
      )
    ) {
      setSelectedFramework('')
    }
  }, [selectedFramework, selectedLibraryInfo])

  const libraryItems = searchableLibraries.map((library) => ({
    value: library.id,
    label: library.id,
    isRefined: library.id === selectedLibrary,
  }))

  const frameworkItems = frameworkOptions
    .filter((framework) => availableFrameworkValues.includes(framework.value))
    .map((framework) => ({
      value: framework.value,
      label: framework.label,
      isRefined: framework.value === selectedFramework,
    }))

  // Wrapper functions that just update state (no Algolia refine)
  const selectLibrary = React.useCallback((value: string) => {
    setSelectedLibrary(value)
  }, [])

  const selectFramework = React.useCallback((value: string) => {
    setSelectedFramework(value)
  }, [])

  const toggleShowSearchResults = React.useCallback(() => {
    setShowSearchResults((current) => {
      const next = !current
      localStorage.setItem('search-show-results', String(next))
      return next
    })
  }, [])

  const hideSearchResults = React.useCallback(() => {
    setShowSearchResults(false)
    localStorage.setItem('search-show-results', 'false')
  }, [])

  return (
    <SearchFiltersContext.Provider
      value={{
        selectedLibrary,
        selectedFramework,
        setSelectedLibrary,
        setSelectedFramework,
        refineLibrary: selectLibrary,
        refineFramework: selectFramework,
        libraryItems,
        frameworkItems,
        searchQuery,
        setSearchQuery,
        showSearchResults,
        toggleShowSearchResults,
        hideSearchResults,
      }}
    >
      {children}
    </SearchFiltersContext.Provider>
  )
}

// Component that builds dynamic filter strings for the selected search scope.
function DynamicFilters() {
  const { selectedLibrary, selectedFramework } = useSearchFilters()

  return (
    <Configure
      attributesToRetrieve={[
        'hierarchy.lvl1',
        'hierarchy.lvl2',
        'hierarchy.lvl3',
        'hierarchy.lvl4',
        'hierarchy.lvl5',
        'hierarchy.lvl6',
        'url',
        'url_without_anchor',
        'anchor',
        'urlWithAnchor',
        'content',
        'library',
        'framework',
        'version',
        'routeStyle',
      ]}
      attributesToHighlight={[
        'hierarchy.lvl1',
        'hierarchy.lvl2',
        'hierarchy.lvl3',
        'hierarchy.lvl4',
        'hierarchy.lvl5',
        'hierarchy.lvl6',
        'content',
      ]}
      attributesToSnippet={['content:50']}
      distinct={1}
      filters={buildSearchFilters({ selectedLibrary, selectedFramework })}
    />
  )
}

function getInternalLinkTarget(hrefValue: string) {
  return getRoutableInternalLinkTarget(hrefValue)
}

const SafeLink = React.forwardRef(
  (
    {
      href,
      children,
      className,
      onKeyDown,
      role,
      'aria-selected': ariaSelected,
      tabIndex,
      ...props
    }: React.AnchorHTMLAttributes<HTMLAnchorElement>,
    ref: React.Ref<HTMLAnchorElement>,
  ) => {
    const hrefValue = href ?? ''
    const internalTarget = getInternalLinkTarget(hrefValue)

    if (!internalTarget) {
      return (
        <a
          href={isSafeHref(hrefValue) ? href : undefined}
          className={className}
          onKeyDown={onKeyDown}
          role={role}
          aria-selected={ariaSelected}
          tabIndex={tabIndex}
          ref={ref}
          {...props}
        >
          {children}
        </a>
      )
    }

    return (
      <Link
        to={internalTarget.path}
        hash={internalTarget.hash}
        className={className}
        onKeyDown={onKeyDown}
        role={role}
        aria-selected={ariaSelected}
        tabIndex={tabIndex}
        preloadDelay={500}
        ref={ref}
        {...props}
      >
        {children}
      </Link>
    )
  },
)

function KapaMarkdownLink({
  href,
  children,
  ...props
}: React.AnchorHTMLAttributes<HTMLAnchorElement>) {
  return (
    <SafeLink
      href={href}
      className="font-medium text-gray-900 dark:text-gray-100 border-b border-gray-400/60 dark:border-gray-500/60 hover:border-gray-900 dark:hover:border-gray-100 transition-colors pb-px"
      {...props}
    >
      {children}
    </SafeLink>
  )
}

function KapaMarkdownTable({
  children,
  className,
  ...props
}: React.TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div className="my-3 max-w-full overflow-x-auto rounded-xl border border-gray-200 bg-white dark:border-white/[0.12] dark:bg-black/20">
      <table
        className={twMerge(
          className,
          'w-full min-w-[34rem] border-collapse text-left',
        )}
        {...props}
      >
        {children}
      </table>
    </div>
  )
}

function KapaMarkdownTableHead({
  children,
  className,
  ...props
}: React.HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead
      className={twMerge(
        className,
        'border-b border-gray-200 bg-gray-50/80 dark:border-white/[0.12] dark:bg-white/[0.04]',
      )}
      {...props}
    >
      {children}
    </thead>
  )
}

function KapaMarkdownTableBody({
  children,
  className,
  ...props
}: React.HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <tbody
      className={twMerge(
        className,
        '[&_tr:last-child_td]:border-b-0 [&_tr:last-child_th]:border-b-0',
      )}
      {...props}
    >
      {children}
    </tbody>
  )
}

function KapaMarkdownTableCell({
  children,
  className,
  ...props
}: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td
      className={twMerge(
        className,
        'border-b border-l border-gray-200/80 px-3 py-2 align-top first:border-l-0 dark:border-white/[0.08]',
      )}
      {...props}
    >
      {children}
    </td>
  )
}

function KapaMarkdownTableHeaderCell({
  children,
  className,
  ...props
}: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={twMerge(
        className,
        'border-b border-l border-gray-200 px-3 py-2 font-semibold align-top first:border-l-0 dark:border-white/[0.1]',
      )}
      {...props}
    >
      {children}
    </th>
  )
}

const streamdownComponents = {
  pre: CodeBlock,
  code: InlineCode,
  a: KapaMarkdownLink,
  table: KapaMarkdownTable,
  thead: KapaMarkdownTableHead,
  tbody: KapaMarkdownTableBody,
  td: KapaMarkdownTableCell,
  th: KapaMarkdownTableHeaderCell,
  ul: ({ children }: { children?: React.ReactNode }) => (
    <ul className="list-disc list-outside pl-5 space-y-1 my-2">{children}</ul>
  ),
  ol: ({ children }: { children?: React.ReactNode }) => (
    <ol className="list-decimal list-outside pl-5 space-y-1 my-2">
      {children}
    </ol>
  ),
  li: ({ children }: { children?: React.ReactNode }) => (
    <li className="leading-relaxed">{children}</li>
  ),
}

function parseSourceGroupIDs(value: string | undefined) {
  if (!value) {
    return undefined
  }

  const ids = value
    .split(',')
    .map((id) => id.trim())
    .filter((id) => id.length > 0)

  return ids.length > 0 ? ids : undefined
}

type KapaReaction = 'upvote' | 'downvote'

type KapaDisplayQA = {
  id: string | null
  question: string
  answer: string
  sources: Array<StreamSource>
  isGenerationAborted: boolean
  isFeedbackSubmissionEnabled?: boolean
  reaction: KapaReaction | null
}

type KapaHistoryItem = {
  threadId: string
  title: string
  createdAt: number
  updatedAt: number
  conversation: Array<KapaDisplayQA>
}

type KapaSubmitQueryArgs = Parameters<DefaultKapaApiService['submitQuery']>[0]
type KapaChatStreamCallbacks = Parameters<
  DefaultKapaApiService['submitQuery']
>[1]
type KapaSubmitFeedbackArgs = Parameters<
  DefaultKapaApiService['addFeedback']
>[0]

const KAPA_HISTORY_STORAGE_KEY = 'tanstack-kapa-chat-history'
const KAPA_HISTORY_LIMIT = 5

class KapaThreadOverrideApiService {
  private service = new DefaultKapaApiService(processStream)

  constructor(
    private threadIdOverrideRef: React.MutableRefObject<string | null>,
  ) {}

  submitQuery(
    args: KapaSubmitQueryArgs,
    callbacks: KapaChatStreamCallbacks,
  ): Promise<void> {
    return this.service.submitQuery(
      { ...args, threadId: this.threadIdOverrideRef.current },
      callbacks,
    )
  }

  addFeedback(args: KapaSubmitFeedbackArgs): Promise<void> {
    return this.service.addFeedback(args)
  }

  abortCurrent(): void {
    this.service.abortCurrent()
  }
}

function isUnknownRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isDefined<T>(value: T | null): value is T {
  return value !== null
}

function readString(value: unknown) {
  return typeof value === 'string' ? value : ''
}

function readNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function parseKapaReaction(value: unknown): KapaReaction | null {
  if (value === 'upvote' || value === 'downvote') {
    return value
  }

  return null
}

function parseKapaSource(value: unknown): StreamSource | null {
  if (!isUnknownRecord(value)) {
    return null
  }

  const title = readString(value.title)
  const sourceUrl = readString(value.source_url)

  if (
    !title ||
    title.length > 160 ||
    !sourceUrl ||
    sourceUrl.length > 2048 ||
    !isSafeHref(sourceUrl)
  ) {
    return null
  }

  return {
    title,
    subtitle: readString(value.subtitle),
    source_url: sourceUrl,
    source_type: readString(value.source_type),
  }
}

function parseKapaHistoryQA(value: unknown): KapaDisplayQA | null {
  if (!isUnknownRecord(value)) {
    return null
  }

  const question = readString(value.question).trim()

  if (!question) {
    return null
  }

  const sourceValues = Array.isArray(value.sources) ? value.sources : []

  return {
    id: typeof value.id === 'string' ? value.id : null,
    question,
    answer: readString(value.answer),
    sources: sourceValues.map(parseKapaSource).filter(isDefined),
    isGenerationAborted: value.isGenerationAborted === true,
    isFeedbackSubmissionEnabled: value.isFeedbackSubmissionEnabled === true,
    reaction: parseKapaReaction(value.reaction),
  }
}

function parseKapaHistoryItem(value: unknown): KapaHistoryItem | null {
  if (!isUnknownRecord(value)) {
    return null
  }

  const threadId = readString(value.threadId)
  const conversationValues = Array.isArray(value.conversation)
    ? value.conversation
    : []
  const conversation = conversationValues
    .map(parseKapaHistoryQA)
    .filter(isDefined)

  if (!threadId || conversation.length === 0) {
    return null
  }

  const updatedAt = readNumber(value.updatedAt) || Date.now()

  return {
    threadId,
    title: readString(value.title) || buildKapaHistoryTitle(conversation),
    createdAt: readNumber(value.createdAt) || updatedAt,
    updatedAt,
    conversation,
  }
}

function readKapaHistory() {
  if (typeof window === 'undefined') {
    return []
  }

  try {
    const raw = localStorage.getItem(KAPA_HISTORY_STORAGE_KEY)
    if (!raw) {
      return []
    }

    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) {
      return []
    }

    return parsed
      .map(parseKapaHistoryItem)
      .filter(isDefined)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, KAPA_HISTORY_LIMIT)
  } catch {
    return []
  }
}

function writeKapaHistory(items: Array<KapaHistoryItem>) {
  if (typeof window === 'undefined') {
    return
  }

  try {
    localStorage.setItem(
      KAPA_HISTORY_STORAGE_KEY,
      JSON.stringify(items.slice(0, KAPA_HISTORY_LIMIT)),
    )
  } catch {
    // Ignore storage failures so chat keeps working.
  }
}

function buildKapaHistoryTitle(conversation: Array<KapaDisplayQA>) {
  const firstQuestion =
    conversation
      .find((qa) => qa.question.trim().length > 0)
      ?.question.trim()
      .replace(/\s+/g, ' ') || 'Untitled chat'

  return firstQuestion.length > 64
    ? `${firstQuestion.slice(0, 61)}...`
    : firstQuestion
}

function toStoredKapaQA(qa: KapaDisplayQA): KapaDisplayQA {
  return {
    id: qa.id,
    question: qa.question,
    answer: qa.answer,
    sources: qa.sources.map((source) => ({
      title: source.title,
      subtitle: source.subtitle,
      source_url: source.source_url,
      source_type: source.source_type,
    })),
    isGenerationAborted: qa.isGenerationAborted,
    isFeedbackSubmissionEnabled: qa.isFeedbackSubmissionEnabled,
    reaction: qa.reaction,
  }
}

function upsertKapaHistoryItem(
  threadId: string,
  conversation: Array<KapaDisplayQA>,
) {
  const current = readKapaHistory()
  const existing = current.find((item) => item.threadId === threadId)
  const now = Date.now()
  const nextItem: KapaHistoryItem = {
    threadId,
    title: buildKapaHistoryTitle(conversation),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    conversation: conversation.map(toStoredKapaQA),
  }
  const next = [
    nextItem,
    ...current.filter((item) => item.threadId !== threadId),
  ].slice(0, KAPA_HISTORY_LIMIT)

  writeKapaHistory(next)
  return next
}

function formatKapaHistoryTime(updatedAt: number) {
  const elapsed = Date.now() - updatedAt

  if (elapsed < 60_000) {
    return 'now'
  }

  if (elapsed < 3_600_000) {
    return `${Math.floor(elapsed / 60_000)}m ago`
  }

  if (elapsed < 86_400_000) {
    return `${Math.floor(elapsed / 3_600_000)}h ago`
  }

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
  }).format(new Date(updatedAt))
}

function useKapaChatHistory() {
  const [items, setItems] =
    React.useState<Array<KapaHistoryItem>>(readKapaHistory)

  const save = React.useCallback(
    (threadId: string, conversation: Array<KapaDisplayQA>) => {
      if (conversation.length === 0) {
        return
      }

      setItems(upsertKapaHistoryItem(threadId, conversation))
    },
    [],
  )

  return { items, save }
}

function getSourceScope(sourceUrl: string) {
  let pathname = sourceUrl

  try {
    pathname = new URL(sourceUrl).pathname
  } catch {
    pathname = sourceUrl
  }

  const pathParts = pathname.split('/').filter(Boolean)
  const libraryId = pathParts[0]
  const library = publicLibraries.find((item) => item.id === libraryId)
  const frameworkIndex = pathParts.indexOf('framework')
  const frameworkValue =
    frameworkIndex >= 0 ? pathParts[frameworkIndex + 1] : undefined
  const framework = frameworkValue
    ? frameworkOptions.find((item) => item.value === frameworkValue)
    : undefined

  return { library, framework }
}

function SourceScopeBadges({
  library,
  framework,
}: ReturnType<typeof getSourceScope>) {
  if (!library && !framework) {
    return null
  }

  return (
    <span className="inline-flex items-center gap-1 shrink-0">
      {library ? (
        <span
          className={twMerge(
            'text-[10px] font-black uppercase leading-none',
            library.textStyle || 'text-gray-500 dark:text-gray-400',
          )}
        >
          {library.id}
        </span>
      ) : null}
      {framework ? (
        <span
          className={twMerge(
            'inline-flex items-center gap-0.5 text-[10px] font-semibold leading-none',
            framework.fontColor,
          )}
        >
          <img
            src={framework.logo}
            alt=""
            aria-hidden="true"
            className="w-2.5 h-2.5"
          />
          {capitalize(framework.label)}
        </span>
      ) : null}
    </span>
  )
}

function ChatControlTooltip({ children }: { children: React.ReactNode }) {
  return (
    <span
      aria-hidden="true"
      data-chat-control-tooltip
      className="pointer-events-none absolute right-0 top-full z-30 mt-1.5 whitespace-nowrap rounded-md bg-gray-900 px-2 py-1 text-[11px] font-medium text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus:opacity-100 group-focus-visible:opacity-100 dark:bg-gray-100 dark:text-gray-900"
    >
      {children}
    </span>
  )
}

const compactChatControlClass =
  'group relative h-8 w-8 justify-center rounded-lg bg-transparent shadow-none border-transparent hover:border-gray-200 focus-visible:border-gray-200 dark:hover:border-white/10 dark:focus-visible:border-white/10'

function DockMaximizeButton({
  isMaximized,
  onToggle,
}: {
  isMaximized: boolean
  onToggle: () => void
}) {
  const label = isMaximized ? 'Minimize panel' : 'Maximize panel'

  return (
    <button
      type="button"
      onClick={onToggle}
      title={label}
      aria-label={label}
      aria-pressed={isMaximized}
      className={twMerge(
        'pointer-events-auto flex items-center text-xs backdrop-blur-sm border border-gray-200 dark:border-white/10 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-white dark:hover:bg-black/90 disabled:opacity-40 disabled:hover:text-gray-400 dark:disabled:hover:text-gray-500 shadow-sm transition-colors',
        compactChatControlClass,
      )}
    >
      {isMaximized ? (
        <Minimize2 className="w-3.5 h-3.5" />
      ) : (
        <Maximize2 className="w-3.5 h-3.5" />
      )}
      <ChatControlTooltip>{label}</ChatControlTooltip>
    </button>
  )
}

function CopyChatButton({
  conversation,
  compact = false,
}: {
  conversation: Array<KapaDisplayQA>
  compact?: boolean
}) {
  const [copied, setCopied] = React.useState(false)
  const hasConversation = conversation.length > 0
  const label = copied ? 'Copied' : 'Copy chat'
  const resetCopiedTimerRef = React.useRef<number | null>(null)

  React.useEffect(() => {
    return () => {
      if (resetCopiedTimerRef.current) {
        window.clearTimeout(resetCopiedTimerRef.current)
      }
    }
  }, [])

  const handleCopy = () => {
    const text = conversation
      .map((qa) =>
        [`You: ${qa.question}`, qa.answer ? `TanStack: ${qa.answer}` : '']
          .filter(Boolean)
          .join('\n\n'),
      )
      .join('\n\n')

    if (!text) {
      return
    }

    navigator.clipboard.writeText(text).then(() => {
      if (resetCopiedTimerRef.current) {
        window.clearTimeout(resetCopiedTimerRef.current)
      }

      setCopied(true)
      resetCopiedTimerRef.current = window.setTimeout(() => {
        setCopied(false)
        resetCopiedTimerRef.current = null
      }, 2000)
    })
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      disabled={!hasConversation}
      title={label}
      aria-label={label}
      className={twMerge(
        'pointer-events-auto flex items-center text-xs backdrop-blur-sm border border-gray-200 dark:border-white/10 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-white dark:hover:bg-black/90 disabled:opacity-40 disabled:hover:text-gray-400 dark:disabled:hover:text-gray-500 shadow-sm transition-colors',
        compact
          ? compactChatControlClass
          : 'gap-1 px-2 py-1 rounded-md bg-white/80 dark:bg-black/80',
        copied &&
          'border-green-500/30 bg-green-500/10 text-green-600 hover:bg-green-500/15 hover:text-green-700 dark:border-green-400/30 dark:bg-green-400/10 dark:text-green-300 dark:hover:bg-green-400/15 dark:hover:text-green-200',
      )}
    >
      {copied ? (
        <Check className="w-3.5 h-3.5" />
      ) : (
        <Copy className="w-3 h-3" />
      )}
      {compact ? <ChatControlTooltip>{label}</ChatControlTooltip> : label}
    </button>
  )
}

function KapaHistoryButton({
  items,
  activeThreadId,
  isBusy,
  onSelect,
  compact = false,
}: {
  items: Array<KapaHistoryItem>
  activeThreadId: string | null
  isBusy: boolean
  onSelect: (item: KapaHistoryItem) => void
  compact?: boolean
}) {
  const { cancelAiDockHoverClose } = useSearchContext()
  const cancelPendingDockClose = React.useCallback(() => {
    if (!compact) {
      return
    }

    cancelAiDockHoverClose()
  }, [cancelAiDockHoverClose, compact])

  return (
    <Dropdown
      modal={false}
      onOpenChange={(open) => {
        if (open) {
          cancelPendingDockClose()
        }
      }}
    >
      <DropdownTrigger>
        <button
          type="button"
          disabled={isBusy}
          aria-label="Chat history"
          title="Chat history"
          className={twMerge(
            'pointer-events-auto flex items-center text-xs backdrop-blur-sm border border-gray-200 dark:border-white/10 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-white dark:hover:bg-black/90 disabled:opacity-40 disabled:hover:text-gray-400 dark:disabled:hover:text-gray-500 shadow-sm transition-colors',
            compact
              ? compactChatControlClass
              : 'gap-1 px-1.5 sm:px-2 py-1 rounded-md bg-white/80 dark:bg-black/80',
          )}
        >
          <History className="w-3 h-3" />
          {compact ? (
            <ChatControlTooltip>Chat history</ChatControlTooltip>
          ) : (
            <span className="hidden sm:inline">History</span>
          )}
        </button>
      </DropdownTrigger>
      <DropdownContent
        align="end"
        sideOffset={8}
        className="w-72 max-w-[calc(100vw-2rem)]"
        onFocus={cancelPendingDockClose}
        onPointerEnter={cancelPendingDockClose}
      >
        {items.length === 0 ? (
          <div className="px-2 py-2 text-xs text-gray-400 dark:text-gray-500">
            No saved chats yet
          </div>
        ) : null}
        {items.map((item) => {
          const isActive = item.threadId === activeThreadId

          return (
            <DropdownItem
              key={item.threadId}
              onSelect={() => {
                cancelPendingDockClose()
                onSelect(item)
              }}
              className="items-start justify-between gap-3 py-2"
            >
              <span className="min-w-0">
                <span className="block truncate text-xs font-semibold text-gray-700 dark:text-gray-200">
                  {item.title}
                </span>
                <span className="block truncate text-[10px] text-gray-400 dark:text-gray-500">
                  {formatKapaHistoryTime(item.updatedAt)}
                </span>
              </span>
              {isActive ? (
                <Check className="mt-0.5 w-3 h-3 shrink-0 text-green-500" />
              ) : null}
            </DropdownItem>
          )
        })}
      </DropdownContent>
    </Dropdown>
  )
}

function MessageActionButton({
  icon,
  title,
  onClick,
}: {
  icon: 'copy'
  title: string
  onClick: () => void
}) {
  const [flashed, setFlashed] = React.useState(false)

  const handleClick = () => {
    onClick()
    if (icon === 'copy') {
      setFlashed(true)
      setTimeout(() => setFlashed(false), 1500)
    }
  }

  const iconEl = flashed ? (
    <Check className="w-3 h-3 text-green-500" />
  ) : (
    <Copy className="w-3 h-3" />
  )

  return (
    <button
      type="button"
      onClick={handleClick}
      title={title}
      className="p-1 rounded text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
    >
      {iconEl}
    </button>
  )
}

function AIMessageHeader({ action }: { action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-1.5">
      <div className="flex items-center gap-1.5 min-w-0">
        <div className="w-5 h-5 rounded-full overflow-hidden ring-1 ring-black/10 dark:ring-white/10 shrink-0">
          <img
            src="/images/logos/logo-color-100.png"
            alt="TanStack"
            className="w-full h-full object-cover"
          />
        </div>
        <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0 min-w-0">
          <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">
            TanStack
          </span>
          <a
            href="https://www.kapa.ai/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            answers by kapa.ai
          </a>
        </div>
      </div>
      {action}
    </div>
  )
}

function AlgoliaAttribution() {
  return (
    <a
      href="https://www.algolia.com/developers/?utm_medium=referral&utm_content=powered_by&utm_source=tanstack.com&utm_campaign=docsearch"
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-1.5 opacity-45 hover:opacity-75 transition-opacity shrink-0"
      onClick={(event) => event.stopPropagation()}
    >
      <span className="hidden sm:inline text-[10px] text-gray-400 dark:text-gray-500">
        search by
      </span>
      <img
        src="/Algolia-logo-blue.svg"
        alt="Algolia"
        className="h-2.5 w-auto dark:hidden"
      />
      <img
        src="/Algolia-logo-white.svg"
        alt="Algolia"
        className="h-2.5 w-auto hidden dark:block"
      />
    </a>
  )
}

function getKapaSuggestions(selectedLibrary: string) {
  if (selectedLibrary === 'query') {
    return [
      'How do I invalidate a query?',
      'What is staleTime vs gcTime?',
      'How do I handle optimistic updates?',
    ]
  }

  if (selectedLibrary === 'router') {
    return [
      'How do I do nested layouts?',
      'What is the difference between loader and beforeLoad?',
      'How do I type search params?',
    ]
  }

  if (selectedLibrary === 'start') {
    return [
      'How do I create a server function?',
      'How do I add authentication?',
      'How does middleware work?',
    ]
  }

  if (selectedLibrary === 'table') {
    return [
      'How do I add column sorting?',
      'How do I implement row selection?',
      'How do I virtualize rows?',
    ]
  }

  if (selectedLibrary === 'form') {
    return [
      'How do I validate on submit?',
      'How do I handle async validation?',
      'How do I use array fields?',
    ]
  }

  return [
    'How do I get started with TanStack Query?',
    'What is the difference between Start and Router?',
    'Which TanStack library should I use for data fetching?',
  ]
}

function KapaWelcome({
  selectedLibrary,
  selectedFramework,
  onSuggestion,
  disabled,
  compact = false,
}: {
  selectedLibrary: string
  selectedFramework: string
  onSuggestion: (suggestion: string) => void
  disabled?: boolean
  compact?: boolean
}) {
  const suggestions = getKapaSuggestions(selectedLibrary)

  return (
    <div>
      <AIMessageHeader />
      <div className="rounded-2xl px-3.5 py-3 bg-white dark:bg-white/[0.06] border border-gray-200 dark:border-white/10 shadow-sm space-y-2.5">
        <p
          className={twMerge(
            'text-gray-700 dark:text-gray-300 leading-relaxed',
            compact ? 'text-[13px]' : 'text-sm',
          )}
        >
          Ask a TanStack docs question in plain English.
          {(selectedLibrary || selectedFramework) && (
            <>
              {' '}
              Your search is focused on{' '}
              {selectedLibrary && (
                <span className="font-semibold text-gray-900 dark:text-white">
                  TanStack {selectedLibrary.toUpperCase()}
                </span>
              )}
              {selectedLibrary && selectedFramework && ' + '}
              {selectedFramework && (
                <span className="font-semibold text-gray-900 dark:text-white">
                  {capitalize(selectedFramework)}
                </span>
              )}
              .
            </>
          )}
        </p>
        <div className="space-y-1.5">
          <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">
            Try asking
          </p>
          <div className="flex flex-wrap gap-1.5">
            {suggestions.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                disabled={disabled}
                onClick={() => onSuggestion(suggestion)}
                className={twMerge(
                  'px-2.5 py-1 rounded-full bg-gray-100 dark:bg-white/[0.08] text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-white/[0.14] disabled:hover:bg-gray-100 dark:disabled:hover:bg-white/[0.08] disabled:opacity-50 disabled:cursor-default transition-colors border border-gray-200 dark:border-white/10 text-left',
                  compact ? 'text-[11px]' : 'text-xs',
                )}
              >
                {suggestion}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function KapaAnswer({
  qa,
  isStreaming,
  error,
  onCopyQuestion,
  onFeedback,
  compact = false,
}: {
  qa: KapaDisplayQA
  isStreaming: boolean
  error?: string | null
  onCopyQuestion: () => void
  onFeedback: (reaction: 'upvote' | 'downvote') => void
  compact?: boolean
}) {
  const canSubmitFeedback =
    qa.id !== null && qa.isFeedbackSubmissionEnabled && qa.reaction === null
  const hasAnswerError = !isStreaming && !qa.answer && !!error

  return (
    <div className="space-y-3">
      <div className="group flex flex-col items-end gap-1">
        <div
          className={twMerge(
            'max-w-[85%] px-3.5 py-2 rounded-2xl rounded-tr-sm bg-gray-900 dark:bg-white text-white dark:text-gray-900 break-words',
            compact ? 'text-[13px]' : 'text-sm',
          )}
        >
          {qa.question}
        </div>
        <div className="flex items-center gap-0.5 opacity-60 group-hover:opacity-100 transition-opacity">
          <MessageActionButton
            icon="copy"
            title="Copy"
            onClick={onCopyQuestion}
          />
        </div>
      </div>
      <div>
        <AIMessageHeader />
        <div className="rounded-2xl px-3.5 py-2.5 bg-white dark:bg-white/[0.06] border border-gray-200 dark:border-white/10 shadow-sm">
          {hasAnswerError ? (
            <p
              className={twMerge(
                'text-red-700 dark:text-red-300 leading-relaxed',
                compact ? 'text-[13px]' : 'text-sm',
              )}
            >
              {error}
            </p>
          ) : qa.answer ? (
            <div
              className={twMerge(
                'text-gray-800 dark:text-gray-200 leading-relaxed break-words',
                compact ? 'text-[13px]' : 'text-sm',
              )}
            >
              <Streamdown
                components={streamdownComponents}
                isAnimating={isStreaming}
              >
                {qa.answer}
              </Streamdown>
            </div>
          ) : (
            <div className="flex items-center gap-1 py-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-gray-400 dark:bg-gray-500 animate-bounce [animation-delay:0ms]" />
              <span className="w-1.5 h-1.5 rounded-full bg-gray-400 dark:bg-gray-500 animate-bounce [animation-delay:150ms]" />
              <span className="w-1.5 h-1.5 rounded-full bg-gray-400 dark:bg-gray-500 animate-bounce [animation-delay:300ms]" />
            </div>
          )}
        </div>
        {!isStreaming && qa.sources.length > 0 && (
          <div className="mt-2 space-y-1">
            <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500 px-0.5">
              Sources
            </p>
            <div className="flex flex-wrap gap-1.5">
              {qa.sources.map((source) => {
                const subtitle =
                  source.subtitle && source.subtitle !== source.title
                    ? source.subtitle
                    : ''
                const label = subtitle
                  ? `${source.title} - ${subtitle}`
                  : source.title
                const sourceScope = getSourceScope(source.source_url)
                const hasSourceScope =
                  !!sourceScope.library || !!sourceScope.framework
                const internalTarget = getInternalLinkTarget(source.source_url)

                return (
                  <SafeLink
                    key={source.source_url}
                    href={source.source_url}
                    target={internalTarget ? undefined : '_blank'}
                    rel={internalTarget ? undefined : 'noopener noreferrer'}
                    className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-[11px] font-medium bg-gray-100 dark:bg-white/[0.06] text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-white/[0.12] hover:text-gray-900 dark:hover:text-gray-200 border border-gray-200 dark:border-white/10 transition-colors max-w-[280px]"
                  >
                    <SourceScopeBadges {...sourceScope} />
                    {!hasSourceScope ? (
                      <ExternalLink className="w-2.5 h-2.5 flex-none opacity-60" />
                    ) : null}
                    <span className="truncate">{label}</span>
                  </SafeLink>
                )
              })}
            </div>
          </div>
        )}
        {!isStreaming && qa.answer && (
          <div className="flex items-center gap-0.5 mt-1.5 px-0.5">
            <button
              type="button"
              onClick={() => onFeedback('upvote')}
              disabled={!canSubmitFeedback}
              title="Helpful"
              className={twMerge(
                'p-1 rounded transition-colors',
                qa.reaction === 'upvote'
                  ? 'text-green-500'
                  : 'text-gray-300 dark:text-gray-600 hover:text-gray-500 dark:hover:text-gray-400 disabled:opacity-40',
              )}
            >
              <ThumbsUp className="w-3 h-3" />
            </button>
            <button
              type="button"
              onClick={() => onFeedback('downvote')}
              disabled={!canSubmitFeedback}
              title="Not helpful"
              className={twMerge(
                'p-1 rounded transition-colors',
                qa.reaction === 'downvote'
                  ? 'text-red-500'
                  : 'text-gray-300 dark:text-gray-600 hover:text-gray-500 dark:hover:text-gray-400 disabled:opacity-40',
              )}
            >
              <ThumbsDown className="w-3 h-3" />
            </button>
            <div className="w-px h-3 bg-gray-200 dark:bg-white/10 mx-0.5" />
            <MessageActionButton
              icon="copy"
              title="Copy"
              onClick={() => navigator.clipboard.writeText(qa.answer)}
            />
          </div>
        )}
      </div>
    </div>
  )
}

function KapaChatPanel({
  onReset,
  isFullHeight,
  onToggleFullHeight,
  threadIdOverrideRef,
  newChatRequestId,
  surface,
  isDockMaximized = false,
  onToggleDockMaximized,
}: {
  onReset: () => void
  isFullHeight: boolean
  onToggleFullHeight: () => void
  threadIdOverrideRef: React.MutableRefObject<string | null>
  newChatRequestId: number
  surface: SearchSurface
  isDockMaximized?: boolean
  onToggleDockMaximized?: () => void
}) {
  const {
    conversation,
    threadId,
    submitQuery,
    isGeneratingAnswer,
    isPreparingAnswer,
    stopGeneration,
    resetConversation,
    addFeedback,
    error,
  } = useChat()
  const {
    aiDockAskRequest,
    clearAiDockAskRequest,
    closeSearch,
    setAiDockDirty,
  } = useSearchContext()
  const { selectedLibrary, selectedFramework, showSearchResults, searchQuery } =
    useSearchFilters()
  const scrollRef = React.useRef<HTMLDivElement>(null)
  const { items: historyItems, save: saveHistory } = useKapaChatHistory()
  const [selectedHistoryItem, setSelectedHistoryItem] =
    React.useState<KapaHistoryItem | null>(null)
  const isBusy = isGeneratingAnswer || isPreparingAnswer
  const isDock = surface === 'dock'
  const isSubmittingRef = React.useRef(false)
  const pendingSubmitIdRef = React.useRef(0)
  const lockedToBottom = React.useRef(true)
  const handledNewChatRequestId = React.useRef(newChatRequestId)
  const handledAiDockAskRequestId = React.useRef(0)
  const displayConversation = React.useMemo<Array<KapaDisplayQA>>(() => {
    const liveConversation = Array.from(conversation)

    if (!selectedHistoryItem) {
      return liveConversation
    }

    return [...selectedHistoryItem.conversation, ...liveConversation]
  }, [conversation, selectedHistoryItem])
  const hasConversation = displayConversation.length > 0
  const activeThreadId = threadId ?? selectedHistoryItem?.threadId ?? null

  React.useEffect(() => {
    if (!isDock) {
      return
    }

    setAiDockDirty(
      searchQuery.trim().length > 0 || displayConversation.length > 0 || isBusy,
    )
  }, [displayConversation.length, isBusy, isDock, searchQuery, setAiDockDirty])

  React.useEffect(() => {
    if (threadId) {
      threadIdOverrideRef.current = threadId
    }
  }, [threadId, threadIdOverrideRef])

  React.useEffect(() => {
    if (!threadId || isBusy || displayConversation.length === 0) {
      return
    }

    saveHistory(threadId, displayConversation)
  }, [displayConversation, isBusy, saveHistory, threadId])

  React.useEffect(() => {
    const element = scrollRef.current
    if (!element) return

    const handleScroll = () => {
      const distanceFromBottom =
        element.scrollHeight - element.scrollTop - element.clientHeight
      lockedToBottom.current = distanceFromBottom < 80
    }

    element.addEventListener('scroll', handleScroll, { passive: true })
    return () => {
      element.removeEventListener('scroll', handleScroll)
    }
  }, [])

  React.useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const element = scrollRef.current
      if (element && lockedToBottom.current) {
        element.scrollTop = element.scrollHeight
      }
    })

    return () => cancelAnimationFrame(frame)
  }, [displayConversation, isBusy])

  React.useEffect(() => {
    if (!isBusy) {
      isSubmittingRef.current = false
    }
  }, [isBusy])

  const ask = React.useCallback(
    (question: string) => {
      const trimmed = question.trim()
      if (trimmed.length < 3 || isBusy || isSubmittingRef.current) {
        return
      }

      const submitId = pendingSubmitIdRef.current + 1
      pendingSubmitIdRef.current = submitId
      isSubmittingRef.current = true

      waitForKapaRecaptchaReady().then(() => {
        if (pendingSubmitIdRef.current !== submitId) {
          return
        }

        submitQuery(trimmed)
      })
    },
    [isBusy, submitQuery],
  )

  const selectHistoryItem = React.useCallback(
    (item: KapaHistoryItem) => {
      if (isBusy) {
        return
      }

      resetConversation()
      threadIdOverrideRef.current = item.threadId
      setSelectedHistoryItem(item)
      lockedToBottom.current = true
    },
    [isBusy, resetConversation, threadIdOverrideRef],
  )

  const clearActiveChat = React.useCallback(() => {
    pendingSubmitIdRef.current += 1
    isSubmittingRef.current = false
    resetConversation()
    threadIdOverrideRef.current = null
    setSelectedHistoryItem(null)
    lockedToBottom.current = true
    onReset()
  }, [onReset, resetConversation, threadIdOverrideRef])

  const startNewChat = React.useCallback(() => {
    if (isBusy) {
      stopGeneration()
    }

    clearActiveChat()
  }, [clearActiveChat, isBusy, stopGeneration])

  React.useEffect(() => {
    if (handledNewChatRequestId.current === newChatRequestId) {
      return
    }

    handledNewChatRequestId.current = newChatRequestId
    startNewChat()
  }, [newChatRequestId, startNewChat])

  React.useEffect(() => {
    if (!isDock || !aiDockAskRequest) {
      return
    }

    if (handledAiDockAskRequestId.current === aiDockAskRequest.id) {
      return
    }

    if (isBusy) {
      stopGeneration()
      return
    }

    handledAiDockAskRequestId.current = aiDockAskRequest.id
    clearActiveChat()
    ask(aiDockAskRequest.question)
    clearAiDockAskRequest(aiDockAskRequest.id)
  }, [
    ask,
    aiDockAskRequest,
    clearActiveChat,
    clearAiDockAskRequest,
    isBusy,
    isDock,
    stopGeneration,
  ])

  return (
    <section
      ref={scrollRef}
      className={twMerge(
        'overflow-y-auto flex flex-col',
        isDock
          ? 'flex-1 min-h-0'
          : isFullHeight
            ? 'flex-1 min-h-0'
            : 'flex-1 min-h-0 sm:flex-none sm:max-h-[min(600px,calc(100dvh-2rem-90px))]',
      )}
    >
      <div
        className={twMerge(
          'sticky top-0 flex items-center justify-between gap-1.5',
          isDock
            ? 'z-20 px-3 py-2 border-b border-gray-200/80 dark:border-white/10 bg-white/90 dark:bg-black/90 backdrop-blur-xl shadow-sm'
            : 'z-10 pt-2 pb-1 px-4 sm:px-5 pointer-events-none',
        )}
      >
        {isDock ? null : <StickyTopBlur />}
        <div className="relative z-10 flex items-center gap-1 min-w-0">
          {isDock ? (
            <div className="min-w-0 py-1.5">
              <div className="truncate text-sm font-bold leading-4 text-gray-900 dark:text-white">
                TanStack AI
              </div>
            </div>
          ) : (
            <>
              <button
                type="button"
                onClick={closeSearch}
                className="pointer-events-auto flex items-center justify-center w-6 h-6 rounded-md bg-white/80 dark:bg-black/80 backdrop-blur-sm border border-gray-200 dark:border-white/10 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-white dark:hover:bg-black/90 shadow-sm transition-colors"
                aria-label="Close search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={onToggleFullHeight}
                className="hidden sm:flex pointer-events-auto items-center justify-center w-6 h-6 rounded-md bg-white/80 dark:bg-black/80 backdrop-blur-sm border border-gray-200 dark:border-white/10 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-white dark:hover:bg-black/90 shadow-sm transition-colors"
                aria-label={isFullHeight ? 'Collapse search' : 'Expand search'}
              >
                {isFullHeight ? (
                  <Minimize2 className="w-3 h-3" />
                ) : (
                  <Maximize2 className="w-3 h-3" />
                )}
              </button>
            </>
          )}
        </div>
        <div
          className={twMerge(
            'relative z-10 flex items-center',
            isDock
              ? 'gap-0.5 rounded-xl bg-gray-500/5 dark:bg-white/[0.04] p-0.5'
              : 'gap-1.5',
          )}
        >
          {isDock && onToggleDockMaximized ? (
            <DockMaximizeButton
              isMaximized={isDockMaximized}
              onToggle={onToggleDockMaximized}
            />
          ) : null}
          <KapaHistoryButton
            items={historyItems}
            activeThreadId={activeThreadId}
            isBusy={isBusy}
            onSelect={selectHistoryItem}
            compact={isDock}
          />
          {hasConversation ? (
            <>
              <CopyChatButton
                conversation={displayConversation}
                compact={isDock}
              />
              <button
                type="button"
                onClick={startNewChat}
                title="New chat"
                aria-label="New chat"
                className={twMerge(
                  'pointer-events-auto flex items-center text-xs backdrop-blur-sm border border-gray-200 dark:border-white/10 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-white dark:hover:bg-black/90 shadow-sm transition-colors',
                  isDock
                    ? compactChatControlClass
                    : 'gap-1 px-2 py-1 rounded-md bg-white/80 dark:bg-black/80',
                )}
              >
                <MessageSquarePlus className="w-3.5 h-3.5" />
                {isDock ? (
                  <ChatControlTooltip>New chat</ChatControlTooltip>
                ) : (
                  'New chat'
                )}
              </button>
            </>
          ) : null}
        </div>
      </div>
      <div
        className={twMerge(
          'flex-1 pt-3 space-y-4',
          isDock ? 'px-3 pb-[260px]' : 'px-3 sm:px-4 pb-[220px]',
        )}
      >
        {displayConversation.length === 0 ? (
          <KapaWelcome
            selectedLibrary={showSearchResults ? selectedLibrary : ''}
            selectedFramework={showSearchResults ? selectedFramework : ''}
            onSuggestion={ask}
            compact={isDock}
          />
        ) : (
          displayConversation.map((qa, index) => {
            const liveIndex =
              index -
              (selectedHistoryItem
                ? selectedHistoryItem.conversation.length
                : 0)
            const isLiveQA = liveIndex >= 0
            const isLatestLiveQA = liveIndex === conversation.length - 1
            const isStreamingLatest = isLiveQA && isLatestLiveQA && isBusy
            const answerError = isLiveQA && isLatestLiveQA ? error : null

            return (
              <KapaAnswer
                key={qa.id ?? `${qa.question}-${index}`}
                qa={qa}
                isStreaming={isStreamingLatest}
                error={answerError}
                onCopyQuestion={() =>
                  navigator.clipboard.writeText(qa.question)
                }
                onFeedback={(reaction) => {
                  if (qa.id !== null) {
                    addFeedback(qa.id, reaction)
                  }
                }}
                compact={isDock}
              />
            )
          })
        )}
        {error && conversation.length === 0 && (
          <div className="rounded-lg border border-red-300/70 dark:border-red-500/30 bg-red-50 dark:bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">
            {error}
          </div>
        )}
      </div>
      <div className="sticky bottom-0">
        <div className="absolute bottom-full left-0 right-0">
          <SearchResultsInChat surface={surface} />
        </div>
        <InputBar
          isBusy={isBusy}
          onAskAISubmit={ask}
          onStop={stopGeneration}
          surface={surface}
        />
      </div>
    </section>
  )
}

function StickyTopBlur() {
  const mask =
    '[mask-image:linear-gradient(to_bottom,black_0%,transparent_100%)] [-webkit-mask-image:linear-gradient(to_bottom,black_0%,transparent_100%)]'

  return (
    <div
      className="absolute inset-x-0 top-0 z-0 h-20 pointer-events-none"
      aria-hidden="true"
    >
      <div
        className={twMerge(
          'absolute inset-x-0 top-0 h-20 bg-white/25 dark:bg-black/25 backdrop-blur-sm',
          mask,
        )}
      />
      <div
        className={twMerge(
          'absolute inset-x-0 top-0 h-14 bg-white/25 dark:bg-black/25 backdrop-blur-md',
          mask,
        )}
      />
      <div
        className={twMerge(
          'absolute inset-x-0 top-0 h-8 bg-white/20 dark:bg-black/20 backdrop-blur-lg',
          mask,
        )}
      />
    </div>
  )
}

function KapaUnavailablePanel({
  isFullHeight,
  onToggleFullHeight,
  surface,
  isDockMaximized = false,
  onToggleDockMaximized,
}: {
  isFullHeight: boolean
  onToggleFullHeight: () => void
  surface: SearchSurface
  isDockMaximized?: boolean
  onToggleDockMaximized?: () => void
}) {
  const { closeSearch, setAiDockDirty } = useSearchContext()
  const { selectedLibrary, selectedFramework, showSearchResults, searchQuery } =
    useSearchFilters()
  const isDock = surface === 'dock'

  React.useEffect(() => {
    if (!isDock) {
      return
    }

    setAiDockDirty(searchQuery.trim().length > 0)
  }, [isDock, searchQuery, setAiDockDirty])

  return (
    <section
      className={twMerge(
        'overflow-y-auto flex flex-col',
        isDock
          ? 'flex-1 min-h-0'
          : isFullHeight
            ? 'flex-1 min-h-0'
            : 'flex-1 min-h-0 sm:flex-none sm:max-h-[min(600px,calc(100dvh-2rem-90px))]',
      )}
    >
      <div
        className={twMerge(
          'sticky top-0 flex items-center justify-between gap-1.5',
          isDock
            ? 'z-20 px-3 py-2 border-b border-gray-200/80 dark:border-white/10 bg-white/90 dark:bg-black/90 backdrop-blur-xl shadow-sm'
            : 'z-10 pt-2 pb-1 px-4 sm:px-5 pointer-events-none',
        )}
      >
        {isDock ? null : <StickyTopBlur />}
        <div className="relative z-10 flex items-center gap-1 min-w-0">
          {isDock ? (
            <div className="min-w-0 py-1.5">
              <div className="truncate text-sm font-bold leading-4 text-gray-900 dark:text-white">
                TanStack AI
              </div>
            </div>
          ) : (
            <>
              <button
                type="button"
                onClick={closeSearch}
                className="pointer-events-auto flex items-center justify-center w-6 h-6 rounded-md bg-white/80 dark:bg-black/80 backdrop-blur-sm border border-gray-200 dark:border-white/10 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-white dark:hover:bg-black/90 shadow-sm transition-colors"
                aria-label="Close search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={onToggleFullHeight}
                className="hidden sm:flex pointer-events-auto items-center justify-center w-6 h-6 rounded-md bg-white/80 dark:bg-black/80 backdrop-blur-sm border border-gray-200 dark:border-white/10 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-white dark:hover:bg-black/90 shadow-sm transition-colors"
                aria-label={isFullHeight ? 'Collapse search' : 'Expand search'}
              >
                {isFullHeight ? (
                  <Minimize2 className="w-3 h-3" />
                ) : (
                  <Maximize2 className="w-3 h-3" />
                )}
              </button>
            </>
          )}
        </div>
        {isDock && onToggleDockMaximized ? (
          <div className="relative z-10 flex items-center gap-0.5 rounded-xl bg-gray-500/5 dark:bg-white/[0.04] p-0.5">
            <DockMaximizeButton
              isMaximized={isDockMaximized}
              onToggle={onToggleDockMaximized}
            />
          </div>
        ) : null}
      </div>
      <div
        className={twMerge(
          'flex-1 pt-3 space-y-4',
          isDock ? 'px-3 pb-[260px]' : 'px-3 sm:px-4 pb-[220px]',
        )}
      >
        <div className="rounded-xl border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
          Kapa is not configured. Add{' '}
          <code className="font-mono">VITE_KAPA_INTEGRATION_ID</code> to enable
          AI answers.
        </div>
        <KapaWelcome
          selectedLibrary={showSearchResults ? selectedLibrary : ''}
          selectedFramework={showSearchResults ? selectedFramework : ''}
          onSuggestion={() => {}}
          disabled
          compact={isDock}
        />
      </div>
      <div className="sticky bottom-0">
        <div className="absolute bottom-full left-0 right-0">
          <SearchResultsInChat surface={surface} />
        </div>
        <InputBar isBusy onAskAISubmit={() => {}} surface={surface} />
      </div>
    </section>
  )
}

function SearchPanel({
  isFullHeight,
  onToggleFullHeight,
  newChatRequestId,
  surface,
  isDockMaximized = false,
  onToggleDockMaximized,
}: {
  isFullHeight: boolean
  onToggleFullHeight: () => void
  newChatRequestId: number
  surface: SearchSurface
  isDockMaximized?: boolean
  onToggleDockMaximized?: () => void
}) {
  const integrationId = KAPA_INTEGRATION_ID
  const threadIdOverrideRef = React.useRef<string | null>(null)
  const apiService = React.useMemo(
    () => new KapaThreadOverrideApiService(threadIdOverrideRef),
    [],
  )
  const sourceGroupIDsInclude = React.useMemo(
    () => parseSourceGroupIDs(env.VITE_KAPA_SOURCE_GROUP_IDS),
    [],
  )

  React.useEffect(() => {
    return () => {
      apiService.abortCurrent()
    }
  }, [apiService])

  return (
    <div
      className={twMerge(
        'bg-white/90 dark:bg-black/90 backdrop-blur-lg sm:rounded-[1.75rem] shadow-lg dark:border dark:border-white/20 overflow-hidden',
        surface === 'dock'
          ? 'h-full flex flex-col rounded-none sm:rounded-none border-l border-gray-200 bg-white shadow-2xl backdrop-blur-none dark:border-white/10 dark:bg-black'
          : isFullHeight
            ? 'flex flex-col h-full'
            : 'h-dvh sm:h-auto flex flex-col',
      )}
    >
      {integrationId ? (
        <KapaProvider
          integrationId={integrationId}
          sourceGroupIDsInclude={sourceGroupIDsInclude}
          userTrackingMode="cookie"
          apiService={apiService}
        >
          <KapaChatPanel
            onReset={() => {}}
            isFullHeight={isFullHeight}
            onToggleFullHeight={onToggleFullHeight}
            threadIdOverrideRef={threadIdOverrideRef}
            newChatRequestId={newChatRequestId}
            surface={surface}
            isDockMaximized={isDockMaximized}
            onToggleDockMaximized={onToggleDockMaximized}
          />
        </KapaProvider>
      ) : (
        <KapaUnavailablePanel
          isFullHeight={isFullHeight}
          onToggleFullHeight={onToggleFullHeight}
          surface={surface}
          isDockMaximized={isDockMaximized}
          onToggleDockMaximized={onToggleDockMaximized}
        />
      )}
    </div>
  )
}

function CommandSearchPanel({
  isFullHeight,
  onToggleFullHeight,
}: {
  isFullHeight: boolean
  onToggleFullHeight: () => void
}) {
  return (
    <Command
      label="Search TanStack"
      shouldFilter={false}
      loop
      className={twMerge(
        'flex flex-col overflow-hidden bg-white/95 text-left shadow-2xl backdrop-blur-xl dark:border dark:border-white/20 dark:bg-black/95 sm:rounded-[1.5rem]',
        isFullHeight ? 'h-full' : 'h-dvh sm:h-[min(760px,calc(100dvh-2rem))]',
      )}
    >
      <CommandSearchInput
        isFullHeight={isFullHeight}
        onToggleFullHeight={onToggleFullHeight}
      />
      <CommandSearchResults />
    </Command>
  )
}

function CommandSearchInput({
  isFullHeight,
  onToggleFullHeight,
}: {
  isFullHeight: boolean
  onToggleFullHeight: () => void
}) {
  const { closeSearch } = useSearchContext()
  const { refine } = useSearchBox()
  const { searchQuery, setSearchQuery } = useSearchFilters()
  const hasQuery = searchQuery.trim().length > 0
  const inputRef = React.useRef<HTMLInputElement>(null)

  React.useEffect(() => {
    const frame = requestAnimationFrame(() => {
      inputRef.current?.focus({ preventScroll: true })
    })

    return () => cancelAnimationFrame(frame)
  }, [])

  const clearSearch = React.useCallback(() => {
    setSearchQuery('')
    refine('')
  }, [refine, setSearchQuery])

  return (
    <header className="flex-none border-b border-gray-200/80 bg-white/95 px-3 py-3 dark:border-white/10 dark:bg-black/95 sm:px-4">
      <div className="flex items-center gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-3 rounded-xl border border-gray-200 bg-gray-500/[0.04] px-3 py-2.5 shadow-sm dark:border-white/10 dark:bg-white/[0.06]">
          <Search className="h-5 w-5 shrink-0 text-gray-400 dark:text-gray-500" />
          <Command.Input
            ref={inputRef}
            aria-label="Search TanStack"
            placeholder="Search TanStack..."
            value={searchQuery}
            onValueChange={(nextQuery) => {
              setSearchQuery(nextQuery)
              refine(nextQuery)
            }}
            className="w-full bg-transparent text-base text-gray-900 outline-none placeholder:text-gray-400 dark:text-white dark:placeholder:text-gray-500 [&::-webkit-search-cancel-button]:hidden"
          />
          <button
            type="button"
            onClick={clearSearch}
            className={twMerge(
              'flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-gray-400 transition-opacity hover:text-gray-700 dark:text-gray-500 dark:hover:text-gray-200',
              hasQuery ? 'opacity-100' : 'pointer-events-none opacity-0',
            )}
            tabIndex={-1}
            aria-label="Clear search"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <button
          type="button"
          onClick={onToggleFullHeight}
          className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-400 shadow-sm transition-colors hover:text-gray-700 dark:border-white/10 dark:bg-white/[0.06] dark:text-gray-500 dark:hover:text-gray-200 sm:flex"
          aria-label={isFullHeight ? 'Collapse search' : 'Expand search'}
        >
          {isFullHeight ? (
            <Minimize2 className="h-4 w-4" />
          ) : (
            <Maximize2 className="h-4 w-4" />
          )}
        </button>
        <button
          type="button"
          onClick={closeSearch}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-400 shadow-sm transition-colors hover:text-gray-700 dark:border-white/10 dark:bg-white/[0.06] dark:text-gray-500 dark:hover:text-gray-200"
          aria-label="Close search"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </header>
  )
}

function CommandSearchResults() {
  const { results } = useInstantSearch()
  const { hits, isLastPage, showMore } = useInfiniteHits<AlgoliaHit>({
    transformItems: dedupeSearchHitsByPage,
  })
  const sentinelRef = React.useRef<HTMLDivElement>(null)
  const resultsScrollRef = React.useRef<HTMLDivElement>(null)

  const {
    selectedLibrary,
    selectedFramework,
    setSelectedLibrary,
    setSelectedFramework,
    searchQuery,
  } = useSearchFilters()

  const refinedLibrary = selectedLibrary || null
  const refinedFramework = selectedFramework || null
  const trimmedQuery = searchQuery.trim()
  const hasQuery = trimmedQuery.length > 0

  const clearFramework = () => {
    setSelectedFramework('')
  }

  const clearLibrary = () => {
    setSelectedLibrary('')
  }

  const resultSummary = results.__isArtificial ? (
    <>Searching for &ldquo;{trimmedQuery}&rdquo;</>
  ) : results.nbHits > 0 ? (
    <>
      Results for{' '}
      <span className="font-medium text-gray-600 dark:text-gray-300">
        &ldquo;{trimmedQuery}&rdquo;
      </span>
    </>
  ) : (
    <>No results for &ldquo;{trimmedQuery}&rdquo;</>
  )

  React.useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel || !hasQuery || !hits.length) return

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && !isLastPage) {
            showMore()
          }
        })
      },
      { root: resultsScrollRef.current, rootMargin: '260px' },
    )

    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [hasQuery, hits, isLastPage, showMore])

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex-none border-b border-gray-200/80 px-3 py-2 dark:border-white/10 sm:px-4">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <div
            className="flex min-w-0 flex-wrap items-center gap-1.5"
            data-command-search-controls="true"
          >
            <FrameworkRefinement compact />
            <LibraryRefinement compact />
          </div>
          {hasQuery ? (
            <p className="min-w-[10rem] flex-1 truncate text-xs text-gray-500 dark:text-gray-400">
              {resultSummary}
            </p>
          ) : null}
          <div className="ml-auto flex shrink-0 items-center">
            <AlgoliaAttribution />
          </div>
        </div>
      </div>
      <Command.List
        ref={resultsScrollRef}
        className="min-h-0 flex-1 overflow-y-auto scroll-py-2"
        label="Search results"
      >
        {hasQuery ? (
          <>
            <AskAIResult query={trimmedQuery} />
            <NoResults
              refinedFramework={refinedFramework}
              refinedLibrary={refinedLibrary}
              clearFramework={clearFramework}
              clearLibrary={clearLibrary}
            />
            {hits.map((hit, index) => (
              <Hit
                key={hit.objectID}
                commandValue={`hit-${hit.objectID}-${index}`}
                hit={hit}
                refinedLibrary={refinedLibrary}
                refinedFramework={refinedFramework}
              />
            ))}
            <div ref={sentinelRef} className="h-4" aria-hidden="true" />
          </>
        ) : (
          <div className="flex h-full items-center justify-center px-6 py-16 text-sm text-gray-400 dark:text-gray-500">
            Search TanStack
          </div>
        )}
      </Command.List>
    </div>
  )
}

function AskAIResult({ query }: { query: string }) {
  const { askAiDock } = useSearchContext()

  return (
    <Command.Item
      value="ask-ai"
      onSelect={() => askAiDock(query)}
      className={twMerge(
        'flex w-full cursor-pointer scroll-my-2 items-center gap-3 border-b border-gray-200 px-4 py-3 text-left outline-none transition-colors dark:border-white/10',
        'hover:bg-gray-500/10 data-[selected=true]:bg-cyan-500/10 dark:data-[selected=true]:bg-cyan-400/10',
      )}
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-cyan-500/10 text-cyan-700 dark:bg-cyan-400/15 dark:text-cyan-300">
        <MessageSquarePlus className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-gray-900 dark:text-white">
          Ask AI
        </span>
        <span className="block truncate text-xs text-gray-500 dark:text-gray-400">
          Open TanStack AI with this query
        </span>
      </span>
      <CornerDownLeft className="h-4 w-4 shrink-0 text-gray-300 dark:text-gray-600" />
    </Command.Item>
  )
}

function InputBar({
  isBusy,
  onAskAISubmit,
  onStop,
  surface,
}: {
  isBusy: boolean
  onAskAISubmit: (question: string) => void
  onStop?: () => void
  surface: SearchSurface
}) {
  const { refine } = useSearchBox()
  const { searchQuery, setSearchQuery } = useSearchFilters()
  const trimmedQuery = searchQuery.trim()
  const hasQuery = trimmedQuery.length > 0
  const canAsk = trimmedQuery.length >= 3 && !isBusy
  const canStop = isBusy && !!onStop
  const isDock = surface === 'dock'
  const inputRef = React.useRef<HTMLInputElement>(null)

  React.useEffect(() => {
    const frame = requestAnimationFrame(() => {
      inputRef.current?.focus({ preventScroll: true })
    })

    return () => cancelAnimationFrame(frame)
  }, [])

  const submitQuestion = React.useCallback(() => {
    if (!canAsk) return

    setSearchQuery('')
    refine('')
    onAskAISubmit(trimmedQuery)
  }, [canAsk, onAskAISubmit, refine, setSearchQuery, trimmedQuery])

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault()

    submitQuestion()
  }

  return (
    <div className={twMerge('flex-none px-3', isDock ? 'pb-4' : 'pb-3')}>
      <div className="rounded-2xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/[0.06] shadow-sm overflow-visible">
        <div className="flex items-center gap-2 px-3 py-2.5">
          <Search className="w-4 h-4 opacity-30 flex-none" />
          <form className="flex-1 min-w-0" onSubmit={handleSubmit}>
            <input
              ref={inputRef}
              type="search"
              aria-label="Search"
              placeholder={
                isDock
                  ? 'Ask AI or search docs...'
                  : 'Search or ask a question...'
              }
              value={searchQuery}
              onChange={(event) => {
                const nextQuery = event.target.value
                setSearchQuery(nextQuery)
                refine(nextQuery)
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  submitQuestion()
                }
              }}
              className={twMerge(
                'w-full outline-none [&::-webkit-search-cancel-button]:hidden bg-transparent text-gray-800 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500',
                isDock ? 'text-[13px]' : 'text-sm',
              )}
            />
            <button type="submit" className="hidden" tabIndex={-1}>
              Search
            </button>
          </form>

          <button
            type="button"
            onClick={() => {
              setSearchQuery('')
              refine('')
            }}
            className={twMerge(
              'flex-none w-5 h-5 flex items-center justify-center rounded transition-opacity',
              hasQuery
                ? 'opacity-40 hover:opacity-70 cursor-pointer'
                : 'opacity-0 pointer-events-none',
            )}
            tabIndex={-1}
            aria-label="Clear search"
          >
            <X className="w-3.5 h-3.5" />
          </button>
          <SearchResultsToggle />

          <button
            type="button"
            onClick={canStop ? onStop : submitQuestion}
            disabled={!canStop && !canAsk}
            className={twMerge(
              'flex items-center justify-center w-7 h-7 rounded-full transition-all',
              canAsk || canStop
                ? 'bg-gray-900 dark:bg-white text-white dark:text-black hover:opacity-80'
                : 'bg-gray-200 dark:bg-white/10 text-gray-400 dark:text-gray-600 cursor-default',
            )}
            aria-label={canStop ? 'Stop generating answer' : 'Ask AI'}
          >
            {canStop ? (
              <span className="w-2 h-2 rounded-[1px] bg-current" />
            ) : (
              <ArrowUp className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

function SearchResultsToggle() {
  const { showSearchResults, toggleShowSearchResults } = useSearchFilters()
  const buttonRef = React.useRef<HTMLButtonElement>(null)
  const [tooltipRect, setTooltipRect] = React.useState<DOMRect | null>(null)
  const tooltipText = showSearchResults
    ? 'Hide search results'
    : 'Show search results'

  const showTooltip = () => {
    const rect = buttonRef.current?.getBoundingClientRect()
    if (rect) {
      setTooltipRect(rect)
    }
  }

  const hideTooltip = () => {
    setTooltipRect(null)
  }

  return (
    <div className="relative flex-none">
      <button
        ref={buttonRef}
        type="button"
        onClick={toggleShowSearchResults}
        onMouseEnter={showTooltip}
        onMouseLeave={hideTooltip}
        onFocus={showTooltip}
        onBlur={hideTooltip}
        aria-pressed={showSearchResults}
        aria-label={tooltipText}
        className={twMerge(
          'p-1.5 rounded transition-colors focus:outline-none',
          showSearchResults
            ? 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'
            : 'text-gray-300 dark:text-gray-600 hover:text-gray-400 dark:hover:text-gray-400',
        )}
      >
        {showSearchResults ? (
          <SearchSlash className="w-[18px] h-[18px]" />
        ) : (
          <Search className="w-[18px] h-[18px]" />
        )}
      </button>
      {tooltipRect && typeof document !== 'undefined'
        ? createPortal(
            <div
              className="pointer-events-none fixed z-[1200] whitespace-nowrap px-2.5 py-1.5 rounded-md bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 text-xs shadow-lg"
              style={{
                top: tooltipRect.top - 8,
                left: tooltipRect.right,
                transform: 'translate(-100%, -100%)',
              }}
            >
              {tooltipText}
              <div className="absolute right-2 -bottom-1 w-2 h-2 bg-gray-900 dark:bg-gray-100 rotate-45" />
            </div>,
            document.body,
          )
        : null}
    </div>
  )
}

function SearchResultsInChat({ surface }: { surface: SearchSurface }) {
  const { results } = useInstantSearch()
  const { hits, isLastPage, showMore } = useInfiniteHits<AlgoliaHit>({
    transformItems: dedupeSearchHitsByPage,
  })
  const sentinelRef = React.useRef<HTMLDivElement>(null)
  const resultsScrollRef = React.useRef<HTMLDivElement>(null)

  const {
    selectedLibrary,
    selectedFramework,
    setSelectedLibrary,
    setSelectedFramework,
    searchQuery,
    showSearchResults,
    hideSearchResults,
  } = useSearchFilters()

  const refinedLibrary = selectedLibrary || null
  const refinedFramework = selectedFramework || null
  const trimmedQuery = searchQuery.trim()
  const hasQuery = trimmedQuery.length > 0
  const isOpen = hasQuery && showSearchResults
  const isDock = surface === 'dock'

  const clearFramework = () => {
    setSelectedFramework('')
  }

  const clearLibrary = () => {
    setSelectedLibrary('')
  }

  const hideSearchResultsButton = (
    <button
      type="button"
      onClick={hideSearchResults}
      aria-label="Hide search results"
      className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gray-900 text-white shadow-sm transition-colors hover:bg-gray-700 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-white"
    >
      <X className="w-3 h-3" />
    </button>
  )

  const resultSummary =
    hits.length > 0 ? (
      <>
        {results.nbHits} page{results.nbHits === 1 ? '' : 's'} for{' '}
        <span className="font-medium text-gray-500 dark:text-gray-400">
          &ldquo;{trimmedQuery}&rdquo;
        </span>
      </>
    ) : (
      <>No pages found for &ldquo;{trimmedQuery}&rdquo;</>
    )

  React.useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel || !hits.length) return

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && !isLastPage) {
            showMore()
          }
        })
      },
      { root: resultsScrollRef.current, rootMargin: '200px' },
    )

    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [hits, isLastPage, showMore])

  return (
    <div
      className="overflow-hidden transition-[height] duration-300"
      style={{
        height: isOpen ? (isDock ? '260px' : '210px') : '0px',
        transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)',
      }}
    >
      <div className={isDock ? 'px-3' : 'px-6'}>
        <div className="rounded-t-2xl rounded-b-none border border-b-0 border-gray-200 dark:border-white/10 overflow-hidden bg-white dark:bg-white/[0.06]">
          <div
            className={twMerge(
              'px-3 py-1.5 border-b border-gray-100 dark:border-white/[0.06] flex gap-2',
              isDock ? 'flex-col items-stretch' : 'items-center',
            )}
          >
            {isDock ? (
              <>
                <div className="flex min-w-0 items-center gap-2">
                  <p className="flex-1 text-[11px] text-gray-400 dark:text-gray-500 min-w-0 truncate">
                    {resultSummary}
                  </p>
                  {hideSearchResultsButton}
                </div>
                <div className="flex items-center justify-end">
                  <AlgoliaAttribution />
                </div>
                <div className="flex min-w-0 items-center gap-2">
                  <FrameworkRefinement compact />
                  <LibraryRefinement compact />
                </div>
              </>
            ) : (
              <>
                <p className="flex-1 text-[11px] text-gray-400 dark:text-gray-500 min-w-0 truncate">
                  {resultSummary}
                </p>
                <div className="ml-auto flex min-w-0 items-center justify-end gap-1.5">
                  <FrameworkRefinement compact />
                  <LibraryRefinement compact />
                  <AlgoliaAttribution />
                  {hideSearchResultsButton}
                </div>
              </>
            )}
          </div>
          <div
            ref={resultsScrollRef}
            className={twMerge(
              'overflow-y-auto',
              isDock ? 'h-[210px]' : 'h-[180px]',
            )}
            role="listbox"
            aria-label="Search results"
          >
            <NoResults
              refinedFramework={refinedFramework}
              refinedLibrary={refinedLibrary}
              clearFramework={clearFramework}
              clearLibrary={clearLibrary}
            />
            {hits.map((hit) => (
              <Hit
                key={hit.objectID}
                hit={hit}
                refinedLibrary={refinedLibrary}
                refinedFramework={refinedFramework}
              />
            ))}
            <div ref={sentinelRef} className="h-2" aria-hidden="true" />
          </div>
        </div>
      </div>
    </div>
  )
}

const Hit = ({
  hit,
  commandValue,
  isFocused,
  refinedLibrary,
  refinedFramework,
}: {
  hit: AlgoliaHit
  commandValue?: string
  isFocused?: boolean
  refinedLibrary: string | null
  refinedFramework: string | null
}) => {
  const { closeSearch } = useSearchContext()
  const persistFramework = usePersistFrameworkPreference()

  const handleActivate = () => {
    const framework = hit.framework
    if (
      framework &&
      shouldPersistFrameworkForHit({
        url: hit.url,
        framework,
        routeStyle: hit.routeStyle,
      })
    ) {
      persistFramework(framework)
    }

    closeSearch()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      e.stopPropagation()
      const link = e.currentTarget as HTMLAnchorElement
      link.click()
    }
  }

  const handleClick = () => {
    handleActivate()
  }

  const handleCommandSelect = () => {
    handleActivate()
    if (typeof window !== 'undefined') {
      window.location.assign(hitUrl)
    }
  }

  const ref = React.useRef<HTMLAnchorElement>(null!)

  React.useEffect(() => {
    if (isFocused) {
      ref.current?.scrollIntoView({ behavior: 'instant', block: 'nearest' })
    }
  }, [isFocused])

  // Get library and framework info for this hit
  const hitLibrary = hit.library as string | undefined
  const hitFramework =
    frameworkOptions.find((f) => f.value === hit.framework) ??
    frameworkOptions.find((f) => hit.url.includes(`/framework/${f.value}`))
  const hitLibraryInfo = hitLibrary
    ? publicLibraries.find((l) => l.id === hitLibrary)
    : null
  const hitUrl = hit.urlWithAnchor ?? hit.url

  // Build hierarchy prefix based on what's filtered
  const prefixParts: React.ReactNode[] = []

  // Show library if not filtered to one
  if (!refinedLibrary && hitLibraryInfo) {
    prefixParts.push(
      <span
        key="library"
        className={twMerge(
          'inline-flex items-center text-[11px] font-black uppercase',
          hitLibraryInfo.textStyle || 'text-gray-500 dark:text-gray-400',
        )}
      >
        {hitLibraryInfo.id}
      </span>,
    )
  }

  // Show framework if not filtered to one and hit has a framework
  if (!refinedFramework && hitFramework) {
    prefixParts.push(
      <span
        key="framework"
        className={twMerge(
          'inline-flex items-center gap-1 text-[11px] font-semibold',
          hitFramework.fontColor,
        )}
      >
        <img
          src={hitFramework.logo}
          alt={hitFramework.label}
          className="w-3 h-3"
        />
        {capitalize(hitFramework.label)}
      </span>,
    )
  }

  const hierarchyLevels = [
    'lvl1',
    'lvl2',
    'lvl3',
    'lvl4',
    'lvl5',
    'lvl6',
  ].filter((lvl) => hit.hierarchy[lvl])

  const content = (
    <article className="flex items-start gap-4">
      <div className="flex-1">
        <h3 className="text-xs leading-relaxed text-gray-900 dark:text-white flex items-center gap-1.5 flex-wrap">
          {prefixParts.length > 0 && (
            <>
              {prefixParts.map((part, i) => (
                <React.Fragment key={i}>
                  {part}
                  <span className="text-gray-400 dark:text-gray-600 text-xs">
                    ›
                  </span>
                </React.Fragment>
              ))}
            </>
          )}
          {hierarchyLevels.map((lvl, i, arr) => (
            <React.Fragment key={lvl}>
              <span className="text-gray-600 dark:text-gray-400 [&_mark]:font-semibold [&_mark]:!bg-transparent [&_mark]:text-black [&_mark]:dark:text-white [&_mark]:inline [&_mark]:!p-0 [&_mark]:!m-0 [&_mark]:!rounded-none">
                <DecodedHighlight attribute={`hierarchy.${lvl}`} hit={hit} />
              </span>
              {i < arr.length - 1 && (
                <span className="text-gray-400 dark:text-gray-600 text-xs">
                  ›
                </span>
              )}
            </React.Fragment>
          ))}
        </h3>
        {hit.content ? (
          <p className="text-[11px] leading-relaxed text-gray-600 dark:text-gray-400 mt-0.5 line-clamp-2 [&_mark]:font-semibold [&_mark]:!bg-transparent [&_mark]:text-black [&_mark]:dark:text-white [&_mark]:inline [&_mark]:!p-0 [&_mark]:!m-0 [&_mark]:!rounded-none">
            <Snippet
              attribute="content"
              hit={hit as Parameters<typeof Snippet>[0]['hit']}
            />
          </p>
        ) : null}
      </div>
      {refinedFramework && hitFramework ? (
        <div className="flex-none">
          <div
            className={twMerge(
              'flex items-center gap-1 text-[11px] font-semibold',
              hitFramework.fontColor,
            )}
          >
            <img
              src={hitFramework.logo}
              alt={hitFramework.label}
              className="w-3 h-3"
            />
            {capitalize(hitFramework.label)}
          </div>
        </div>
      ) : null}
    </article>
  )

  if (commandValue) {
    return (
      <Command.Item
        value={commandValue}
        onSelect={handleCommandSelect}
        className={twMerge(
          'block cursor-pointer scroll-my-2 px-4 py-2.5 focus:outline-none border-b border-gray-300 dark:border-gray-700',
          'hover:bg-gray-500/10 data-[selected=true]:bg-gray-500/20',
        )}
        data-search-hit="true"
      >
        {content}
      </Command.Item>
    )
  }

  return (
    <SafeLink
      href={hitUrl}
      className={twMerge(
        'block px-4 py-2.5 focus:outline-none border-b border-gray-300 dark:border-gray-700',
        isFocused ? 'bg-gray-500/20' : 'hover:bg-gray-500/10',
      )}
      onKeyDown={handleKeyDown}
      onFocus={() => ref.current?.focus()}
      onClick={handleClick}
      role="option"
      aria-selected={isFocused}
      tabIndex={-1}
      data-search-hit="true"
      ref={ref}
    >
      {content}
    </SafeLink>
  )
}

type SearchScopePickerProps = {
  compact?: boolean
}

function LibraryRefinement({ compact = false }: SearchScopePickerProps) {
  const {
    selectedLibrary,
    setSelectedLibrary,
    libraryItems: items,
  } = useSearchFilters()

  const currentLibrary = publicLibraries.find((l) => l.id === selectedLibrary)

  return (
    <Dropdown modal={false}>
      <DropdownTrigger>
        <button
          type="button"
          className={twMerge(
            'flex min-w-0 items-center gap-1 p-0.5 cursor-pointer font-bold rounded focus:ring-2 text-gray-900 dark:text-gray-100',
            compact ? 'max-w-[10rem] text-xs' : 'text-sm',
          )}
        >
          {currentLibrary ? (
            <span className="min-w-0 truncate uppercase font-black">
              <span className="opacity-50">TanStack</span>{' '}
              <span className={currentLibrary.textStyle}>
                {currentLibrary.id.toUpperCase()}
              </span>
            </span>
          ) : (
            <span className="truncate">All Libraries</span>
          )}
          <ChevronDown className="w-3 h-3 opacity-50 shrink-0" />
        </button>
      </DropdownTrigger>
      <DropdownContent align="end" className="max-h-[60vh] w-64 overflow-auto">
        <DropdownItem
          onSelect={() => setSelectedLibrary('')}
          className="font-bold"
        >
          All Libraries
        </DropdownItem>
        {items.map((item) => {
          const lib = publicLibraries.find((l) => l.id === item.value)
          return (
            <DropdownItem
              key={item.value}
              onSelect={() => setSelectedLibrary(item.value)}
              className="justify-between"
            >
              <span className="uppercase font-black">
                <span className="opacity-50">TanStack</span>{' '}
                <span className={lib?.textStyle ?? ''}>
                  {item.label.toUpperCase()}
                </span>
              </span>
            </DropdownItem>
          )
        })}
      </DropdownContent>
    </Dropdown>
  )
}

function FrameworkRefinement({ compact = false }: SearchScopePickerProps) {
  const {
    selectedFramework,
    setSelectedFramework,
    frameworkItems: items,
  } = useSearchFilters()

  const persistFramework = usePersistFrameworkPreference()

  const handleSelect = (value: string) => {
    setSelectedFramework(value)
    if (value) {
      persistFramework(value)
    }
  }

  const currentFramework = frameworkOptions.find(
    (f) => f.value === selectedFramework,
  )

  return (
    <Dropdown modal={false}>
      <DropdownTrigger>
        <button
          type="button"
          className={twMerge(
            'flex min-w-0 items-center gap-1 p-0.5 font-bold rounded cursor-pointer focus:ring-2 text-gray-900 dark:text-gray-100',
            compact ? 'max-w-[9rem] text-xs' : 'text-sm',
          )}
        >
          {currentFramework && (
            <img
              src={currentFramework.logo}
              alt=""
              aria-hidden="true"
              className={twMerge(
                'shrink-0',
                compact ? 'w-3.5 h-3.5' : 'w-4 h-4',
              )}
            />
          )}
          <span className="truncate">
            {currentFramework
              ? capitalize(currentFramework.label)
              : 'All Frameworks'}
          </span>
          <ChevronDown className="w-3 h-3 opacity-50 shrink-0" />
        </button>
      </DropdownTrigger>
      <DropdownContent align="end" className="max-h-[60vh] w-52 overflow-auto">
        <DropdownItem onSelect={() => handleSelect('')} className="font-bold">
          All Frameworks
        </DropdownItem>
        {items.map((item) => {
          const fw = frameworkOptions.find((f) => f.value === item.value)
          return (
            <DropdownItem
              key={item.value}
              onSelect={() => handleSelect(item.value)}
              className="justify-between"
            >
              <span className="flex items-center gap-2">
                {fw && (
                  <img
                    src={fw.logo}
                    alt=""
                    aria-hidden="true"
                    className="w-4 h-4"
                  />
                )}
                <span className="font-bold">{capitalize(item.label)}</span>
              </span>
            </DropdownItem>
          )
        })}
      </DropdownContent>
    </Dropdown>
  )
}

function NoResults({
  refinedFramework,
  refinedLibrary,
  clearFramework,
  clearLibrary,
}: {
  refinedFramework: string | null
  refinedLibrary: string | null
  clearFramework: () => void
  clearLibrary: () => void
}) {
  const { results } = useInstantSearch()

  if (results.__isArtificial || results.nbHits > 0) {
    return null
  }

  const currentFrameworkOption = refinedFramework
    ? frameworkOptions.find((f) => f.value === refinedFramework)
    : null
  const currentLibrary = refinedLibrary
    ? publicLibraries.find((l) => l.id === refinedLibrary)
    : null

  return (
    <div className="p-8 text-center text-gray-500 dark:text-gray-400">
      <p className="text-lg font-medium">No results found</p>
      <p className="mt-2 text-sm">
        Try adjusting your search or filters to find what you're looking for.
      </p>
      {refinedFramework && (
        <div className="mt-4 inline-flex items-center gap-2">
          <button
            onClick={clearFramework}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-bold rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors shadow-sm"
          >
            Search all frameworks
            {currentFrameworkOption && (
              <span className="text-xs font-normal opacity-70">
                (currently {currentFrameworkOption.label})
              </span>
            )}
          </button>
          <CornerDownLeft className="w-4 h-4 animate-bounce" />
        </div>
      )}
      {!refinedFramework && refinedLibrary && (
        <div className="mt-4 inline-flex items-center gap-2">
          <button
            onClick={clearLibrary}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-bold rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors shadow-sm"
          >
            Search all libraries
            {currentLibrary && (
              <span className="text-xs font-normal opacity-70">
                (currently {currentLibrary.name})
              </span>
            )}
          </button>
          <CornerDownLeft className="w-4 h-4 animate-bounce" />
        </div>
      )}
    </div>
  )
}

const _submitIconComponent = () => {
  return <Search />
}

function isSearchModalPortalTarget(target: EventTarget | null) {
  return target instanceof Element && !!target.closest('.dropdown-content')
}

const searchModalTransitionMs = 140

export function SearchModal() {
  const { isOpen, closeSearch } = useSearchContext()
  const contentRef = React.useRef<HTMLDivElement>(null)
  const bodyPointerEventsRef = React.useRef('')
  const [shouldRenderSearch, setShouldRenderSearch] = React.useState(isOpen)
  const [isFullHeight, setIsFullHeight] = React.useState(() => {
    if (typeof window === 'undefined') return false
    return localStorage.getItem('search-full-height') === 'true'
  })

  const toggleFullHeight = React.useCallback(() => {
    setIsFullHeight((current) => {
      const next = !current
      localStorage.setItem('search-full-height', String(next))
      return next
    })
  }, [])

  React.useEffect(() => {
    if (isOpen) {
      setShouldRenderSearch(true)
      return
    }

    const timeout = window.setTimeout(() => {
      setShouldRenderSearch(false)
      requestAnimationFrame(() => {
        document.body.style.pointerEvents = bodyPointerEventsRef.current
      })
    }, searchModalTransitionMs)

    return () => window.clearTimeout(timeout)
  }, [isOpen])

  React.useEffect(() => {
    if (!isOpen) {
      return
    }

    const frame = requestAnimationFrame(() => {
      contentRef.current
        ?.querySelector<HTMLInputElement>('input[type="search"]')
        ?.focus({ preventScroll: true })
    })

    return () => cancelAnimationFrame(frame)
  }, [isOpen])

  React.useEffect(() => {
    if (typeof document === 'undefined') {
      return
    }

    if (isOpen) {
      document.body.style.pointerEvents = 'none'
      return
    }

    const frame = requestAnimationFrame(() => {
      document.body.style.pointerEvents = bodyPointerEventsRef.current
    })

    return () => cancelAnimationFrame(frame)
  }, [isOpen])

  React.useEffect(() => {
    if (typeof document === 'undefined') {
      return
    }

    bodyPointerEventsRef.current =
      document.body.style.pointerEvents === 'none'
        ? ''
        : document.body.style.pointerEvents

    return () => {
      document.body.style.pointerEvents = bodyPointerEventsRef.current
    }
  }, [])

  const shouldMountSearch = isOpen || shouldRenderSearch

  return (
    <DialogPrimitive.Root
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          closeSearch()
        }
      }}
    >
      <DialogPrimitive.Portal forceMount>
        {shouldMountSearch ? (
          <>
            <DialogPrimitive.Overlay
              forceMount
              className="search-modal-overlay fixed inset-0 z-[999] bg-black/60 backdrop-blur-sm xl:bg-black/30"
            />
            <DialogPrimitive.Content
              forceMount
              ref={contentRef}
              className={twMerge(
                'search-modal-content fixed z-[1000] inset-0 sm:inset-auto sm:top-4 sm:left-1/2 sm:-translate-x-1/2 sm:w-[96%] xl:w-full sm:max-w-4xl text-left outline-none',
                isFullHeight && 'sm:bottom-4',
              )}
              onInteractOutside={(event) => {
                if (isSearchModalPortalTarget(event.target)) {
                  event.preventDefault()
                }
              }}
            >
              <DialogPrimitive.Title className="sr-only">
                Search TanStack
              </DialogPrimitive.Title>
              <DialogPrimitive.Description className="sr-only">
                Search TanStack and open TanStack AI from the current query.
              </DialogPrimitive.Description>
              <div className="search-modal-panel-transition h-full">
                <InstantSearch
                  searchClient={searchClient}
                  indexName={searchIndexName}
                >
                  <SearchFiltersProvider resetFiltersOnOpen={isOpen}>
                    <DynamicFilters />
                    <CommandSearchPanel
                      isFullHeight={isFullHeight}
                      onToggleFullHeight={toggleFullHeight}
                    />
                  </SearchFiltersProvider>
                </InstantSearch>
              </div>
            </DialogPrimitive.Content>
          </>
        ) : null}
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

export function AiDock() {
  const {
    cancelAiDockHoverClose,
    isAiDockOpen,
    newChatRequestId,
    scheduleAiDockHoverClose,
  } = useSearchContext()
  const [hasActivated, setHasActivated] = React.useState(isAiDockOpen)
  const [isDockVisible, setIsDockVisible] = React.useState(false)
  const [isDockMaximized, setIsDockMaximized] = React.useState(false)
  const [dockWidth, setDockWidth] = React.useState(readAiDockWidth)
  const [viewportWidth, setViewportWidth] = React.useState(() =>
    typeof window === 'undefined'
      ? AI_DOCK_DEFAULT_WIDTH / AI_DOCK_MAX_WIDTH_RATIO
      : window.innerWidth,
  )
  const [isResizingDock, setIsResizingDock] = React.useState(false)
  const contentRef = React.useRef<HTMLDivElement>(null)
  const isResizingDockRef = React.useRef(false)
  const displayedDockWidth = clampAiDockWidth(dockWidth, viewportWidth)
  const dockMaxWidth = getAiDockMaxWidth(viewportWidth)
  const dockStyle: AiDockStyle = {
    '--ai-dock-width': `${displayedDockWidth}px`,
    '--ai-dock-max-width': `${AI_DOCK_MAXIMIZED_WIDTH}px`,
  }

  React.useEffect(() => {
    if (!isAiDockOpen) {
      setIsDockVisible(false)
      return
    }

    setHasActivated(true)

    let enterFrame = 0
    const mountFrame = requestAnimationFrame(() => {
      enterFrame = requestAnimationFrame(() => {
        setIsDockVisible(true)
      })
    })

    return () => {
      cancelAnimationFrame(mountFrame)
      cancelAnimationFrame(enterFrame)
    }
  }, [isAiDockOpen])

  React.useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    const handleResize = () => {
      setViewportWidth(window.innerWidth)
    }

    handleResize()
    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
    }
  }, [])

  React.useEffect(() => {
    if (!isAiDockOpen || !isDockVisible) {
      return
    }

    const frame = requestAnimationFrame(() => {
      contentRef.current
        ?.querySelector<HTMLInputElement>('input[type="search"]')
        ?.focus({ preventScroll: true })
    })

    return () => cancelAnimationFrame(frame)
  }, [isAiDockOpen, isDockVisible])

  const toggleDockMaximized = React.useCallback(() => {
    setIsDockMaximized((current) => !current)
  }, [])

  const handleResizePointerDown = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (isDockMaximized || typeof window === 'undefined') {
        return
      }

      event.preventDefault()
      event.stopPropagation()
      cancelAiDockHoverClose()

      const startX = event.clientX
      const startWidth = displayedDockWidth
      let nextWidth = startWidth
      const previousCursor = document.body.style.cursor
      const previousUserSelect = document.body.style.userSelect

      isResizingDockRef.current = true
      setIsResizingDock(true)
      document.body.style.cursor = 'ew-resize'
      document.body.style.userSelect = 'none'

      const stopResizing = () => {
        window.removeEventListener('pointermove', handlePointerMove)
        window.removeEventListener('pointerup', stopResizing)
        window.removeEventListener('pointercancel', stopResizing)
        document.body.style.cursor = previousCursor
        document.body.style.userSelect = previousUserSelect
        isResizingDockRef.current = false
        setIsResizingDock(false)
        writeAiDockWidth(nextWidth)
      }

      const handlePointerMove = (moveEvent: PointerEvent) => {
        const currentViewportWidth = window.innerWidth
        nextWidth = clampAiDockWidth(
          startWidth + startX - moveEvent.clientX,
          currentViewportWidth,
        )
        setViewportWidth(currentViewportWidth)
        setDockWidth(nextWidth)
      }

      window.addEventListener('pointermove', handlePointerMove)
      window.addEventListener('pointerup', stopResizing)
      window.addEventListener('pointercancel', stopResizing)
    },
    [cancelAiDockHoverClose, displayedDockWidth, isDockMaximized],
  )

  const handleResizeKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (isDockMaximized) {
        return
      }

      const step = event.shiftKey ? 48 : 16
      let nextWidth: number | null = null

      if (event.key === 'ArrowLeft') {
        nextWidth = displayedDockWidth + step
      } else if (event.key === 'ArrowRight') {
        nextWidth = displayedDockWidth - step
      } else if (event.key === 'Home') {
        nextWidth = AI_DOCK_MIN_WIDTH
      } else if (event.key === 'End') {
        nextWidth = dockMaxWidth
      }

      if (nextWidth === null) {
        return
      }

      event.preventDefault()

      const clampedWidth = clampAiDockWidth(nextWidth, viewportWidth)
      setDockWidth(clampedWidth)
      writeAiDockWidth(clampedWidth)
    },
    [displayedDockWidth, dockMaxWidth, isDockMaximized, viewportWidth],
  )

  const handlePointerEnter = (event: React.PointerEvent<HTMLElement>) => {
    if (event.pointerType === 'touch') {
      return
    }

    cancelAiDockHoverClose()
  }

  const handlePointerLeave = (event: React.PointerEvent<HTMLElement>) => {
    if (event.pointerType === 'touch') {
      return
    }

    if (isResizingDockRef.current) {
      return
    }

    if (
      event.relatedTarget instanceof Element &&
      event.relatedTarget.closest('.dropdown-content')
    ) {
      return
    }

    scheduleAiDockHoverClose()
  }

  if (!hasActivated) {
    return null
  }

  return (
    <div
      ref={contentRef}
      aria-label="TanStack AI"
      aria-hidden={!isAiDockOpen}
      inert={!isAiDockOpen}
      style={dockStyle}
      className={twMerge(
        'fixed top-[var(--navbar-height)] right-0 bottom-0 z-[1000] w-full max-w-full pointer-events-none',
        isDockMaximized
          ? 'sm:w-[min(var(--ai-dock-max-width),100vw)]'
          : 'sm:w-[var(--ai-dock-width)]',
        !isResizingDock && 'transition-[width] duration-300 ease-out',
      )}
    >
      <aside
        onPointerEnter={handlePointerEnter}
        onPointerLeave={handlePointerLeave}
        className={twMerge(
          'pointer-events-auto absolute right-0 top-0 h-full w-full max-w-full text-left outline-none transition-[transform,translate,opacity] duration-300 ease-out',
          isDockVisible
            ? 'translate-x-0 opacity-100'
            : 'translate-x-full opacity-0 pointer-events-none',
        )}
      >
        {!isDockMaximized ? (
          <div
            role="separator"
            aria-label="Resize AI panel"
            aria-orientation="vertical"
            aria-valuemin={AI_DOCK_MIN_WIDTH}
            aria-valuemax={dockMaxWidth}
            aria-valuenow={displayedDockWidth}
            tabIndex={0}
            onPointerDown={handleResizePointerDown}
            onKeyDown={handleResizeKeyDown}
            className="group/resize absolute left-0 top-0 z-40 hidden h-full w-3 -translate-x-1.5 cursor-ew-resize touch-none outline-none sm:block"
          >
            <div
              className={twMerge(
                'absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-transparent transition-colors',
                isResizingDock
                  ? 'bg-cyan-500/70'
                  : 'group-hover/resize:bg-cyan-500/50 group-focus/resize:bg-cyan-500/60',
              )}
            />
          </div>
        ) : null}
        <h2 className="sr-only">TanStack AI</h2>
        <InstantSearch searchClient={searchClient} indexName={searchIndexName}>
          <SearchFiltersProvider>
            <DynamicFilters />
            <SearchPanel
              isFullHeight
              onToggleFullHeight={() => {}}
              newChatRequestId={newChatRequestId}
              surface="dock"
              isDockMaximized={isDockMaximized}
              onToggleDockMaximized={toggleDockMaximized}
            />
          </SearchFiltersProvider>
        </InstantSearch>
      </aside>
    </div>
  )
}
