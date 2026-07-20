import { createServerFn } from '@tanstack/react-start'
import {
  deleteCookie,
  getCookie,
  setCookie,
  setResponseHeaders,
} from '@tanstack/react-start/server'
import * as v from 'valibot'
import { shopifyServerFetch } from '~/server/shopify/fetch'
import {
  shopifyCartLineIdSchema,
  shopifyProductVariantIdSchema,
} from '~/utils/shopify-id'
import { shopifyHandleSchema } from '~/utils/shopify-handle'
import {
  CART_CREATE_MUTATION,
  CART_DISCOUNT_CODES_UPDATE_MUTATION,
  CART_LINES_ADD_MUTATION,
  CART_LINES_REMOVE_MUTATION,
  CART_LINES_UPDATE_MUTATION,
  CART_QUERY,
  COLLECTION_QUERY,
  COLLECTIONS_QUERY,
  PAGE_QUERY,
  PRODUCTS_QUERY,
  PRODUCT_QUERY,
  SEARCH_QUERY,
  SHOP_QUERY,
  type CartCreateResult,
  type CartDetail,
  type CartDiscountCodesUpdateResult,
  type CartLinesAddResult,
  type CartLinesRemoveResult,
  type CartLinesUpdateResult,
  type CartQueryResult,
  type CartUserError,
  type CollectionDetail,
  type CollectionListItem,
  type CollectionQueryResult,
  type CollectionsQueryResult,
  type PageDetail,
  type PageQueryResult,
  type ProductDetail,
  type ProductListPage,
  type ProductQueryResult,
  type ProductsQueryResult,
  type ProductsQueryVariables,
  type SearchQueryResult,
  type ShopQueryResult,
  SHOP_POLICIES_QUERY,
  type ShopPoliciesQueryResult,
  type ShopPolicy,
  flattenPolicies,
  type PolicySummary,
} from '~/utils/shopify-queries'

const CART_COOKIE_NAME = 'tanstack_cart_id'
const CART_COOKIE_OPTIONS = {
  path: '/',
  maxAge: 60 * 60 * 24 * 365, // 1 year
  sameSite: 'lax' as const,
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
}

class CartUserErrorsError extends Error {
  constructor(public readonly userErrors: Array<CartUserError>) {
    super(userErrors.map((e) => e.message).join('\n'))
    this.name = 'CartUserErrorsError'
  }
}

function throwIfUserErrors(errs: Array<CartUserError>) {
  if (errs.length > 0) throw new CartUserErrorsError(errs)
}

/**
 * Edge-cache product browse responses for a few minutes. Catalog data
 * doesn't change often and webhook-based revalidation can refine this later.
 */
function setBrowseCacheHeaders() {
  setResponseHeaders(
    new Headers({
      'Cache-Control': 'public, max-age=0, must-revalidate',
      'Cloudflare-CDN-Cache-Control':
        'public, max-age=300, stale-while-revalidate=600',
    }),
  )
}

export const getShop = createServerFn({ method: 'GET' }).handler(
  async (): Promise<ShopQueryResult['shop']> => {
    setBrowseCacheHeaders()
    const data = await shopifyServerFetch<ShopQueryResult>({
      query: SHOP_QUERY,
    })
    return data.shop
  },
)

const productSortKeys = [
  'BEST_SELLING',
  'CREATED_AT',
  'ID',
  'PRICE',
  'PRODUCT_TYPE',
  'RELEVANCE',
  'TITLE',
  'UPDATED_AT',
  'VENDOR',
] as const
const shopCursorSchema = v.pipe(v.string(), v.maxLength(512))
const shopPageSizeSchema = v.pipe(
  v.number(),
  v.integer(),
  v.minValue(1),
  v.maxValue(48),
)
const shopSearchQuerySchema = v.pipe(
  v.string(),
  v.minLength(1),
  v.maxLength(120),
)
const discountCodeSchema = v.pipe(v.string(), v.minLength(1), v.maxLength(100))
const cartQuantitySchema = v.pipe(
  v.number(),
  v.integer(),
  v.minValue(1),
  v.maxValue(99),
)
const cartUpdateQuantitySchema = v.pipe(
  v.number(),
  v.integer(),
  v.minValue(0),
  v.maxValue(99),
)

export const getProducts = createServerFn({ method: 'POST' })
  .validator(
    v.object({
      first: v.optional(shopPageSizeSchema, 24),
      after: v.optional(v.nullable(shopCursorSchema)),
      sortKey: v.optional(v.picklist(productSortKeys)),
      reverse: v.optional(v.boolean()),
    }),
  )
  .handler(async ({ data }): Promise<ProductListPage> => {
    setBrowseCacheHeaders()
    const result = await shopifyServerFetch<
      ProductsQueryResult,
      ProductsQueryVariables
    >({
      query: PRODUCTS_QUERY,
      variables: {
        first: data.first,
        after: data.after ?? null,
        sortKey: data.sortKey ?? null,
        reverse: data.reverse ?? null,
      },
    })
    return result.products
  })

export const getCollections = createServerFn({ method: 'GET' }).handler(
  async (): Promise<Array<CollectionListItem>> => {
    setBrowseCacheHeaders()
    const result = await shopifyServerFetch<
      CollectionsQueryResult,
      { first: number }
    >({
      query: COLLECTIONS_QUERY,
      variables: { first: 50 },
    })
    return result.collections.nodes
  },
)

export const getProduct = createServerFn({ method: 'POST' })
  .validator(v.object({ handle: shopifyHandleSchema }))
  .handler(async ({ data }): Promise<ProductDetail | null> => {
    setBrowseCacheHeaders()
    const result = await shopifyServerFetch<
      ProductQueryResult,
      { handle: string }
    >({
      query: PRODUCT_QUERY,
      variables: { handle: data.handle },
    })
    return result.product
  })

const collectionSortKeys = [
  'BEST_SELLING',
  'COLLECTION_DEFAULT',
  'CREATED',
  'ID',
  'MANUAL',
  'PRICE',
  'RELEVANCE',
  'TITLE',
] as const

export const getCollection = createServerFn({ method: 'POST' })
  .validator(
    v.object({
      handle: shopifyHandleSchema,
      first: v.optional(shopPageSizeSchema, 24),
      after: v.optional(v.nullable(shopCursorSchema)),
      sortKey: v.optional(v.picklist(collectionSortKeys)),
      reverse: v.optional(v.boolean()),
    }),
  )
  .handler(async ({ data }): Promise<CollectionDetail | null> => {
    setBrowseCacheHeaders()
    const result = await shopifyServerFetch<
      CollectionQueryResult,
      {
        handle: string
        first: number
        after: string | null
        sortKey: (typeof collectionSortKeys)[number] | null
        reverse: boolean | null
      }
    >({
      query: COLLECTION_QUERY,
      variables: {
        handle: data.handle,
        first: data.first,
        after: data.after ?? null,
        sortKey: data.sortKey ?? null,
        reverse: data.reverse ?? null,
      },
    })
    return result.collection
  })

export const getPage = createServerFn({ method: 'POST' })
  .validator(v.object({ handle: shopifyHandleSchema }))
  .handler(async ({ data }): Promise<PageDetail | null> => {
    setBrowseCacheHeaders()
    const result = await shopifyServerFetch<
      PageQueryResult,
      { handle: string }
    >({
      query: PAGE_QUERY,
      variables: { handle: data.handle },
    })
    return result.page
  })

export const getShopPolicies = createServerFn({ method: 'GET' }).handler(
  async (): Promise<Array<PolicySummary>> => {
    setBrowseCacheHeaders()
    const result = await shopifyServerFetch<ShopPoliciesQueryResult>({
      query: SHOP_POLICIES_QUERY,
    })
    return flattenPolicies(result.shop)
  },
)

export const getShopPolicy = createServerFn({ method: 'POST' })
  .validator(v.object({ handle: shopifyHandleSchema }))
  .handler(
    async ({
      data,
    }): Promise<{ title: string; body: string; handle: string } | null> => {
      setBrowseCacheHeaders()
      const result = await shopifyServerFetch<ShopPoliciesQueryResult>({
        query: SHOP_POLICIES_QUERY,
      })
      const all = [
        result.shop.privacyPolicy,
        result.shop.refundPolicy,
        result.shop.termsOfService,
        result.shop.shippingPolicy,
      ].filter((p): p is NonNullable<ShopPolicy> => p !== null)
      return all.find((p) => p.handle === data.handle) ?? null
    },
  )

export const searchProducts = createServerFn({ method: 'POST' })
  .validator(
    v.object({
      query: shopSearchQuerySchema,
      first: v.optional(shopPageSizeSchema, 24),
      after: v.optional(v.nullable(shopCursorSchema)),
    }),
  )
  .handler(
    async ({
      data,
    }): Promise<{
      totalCount: number
      pageInfo: { hasNextPage: boolean; endCursor: string | null }
      products: ProductListPage['nodes']
    }> => {
      setBrowseCacheHeaders()
      const result = await shopifyServerFetch<
        SearchQueryResult,
        { query: string; first: number; after: string | null }
      >({
        query: SEARCH_QUERY,
        variables: {
          query: data.query,
          first: data.first,
          after: data.after ?? null,
        },
      })
      return {
        totalCount: result.search.totalCount,
        pageInfo: result.search.pageInfo,
        products: result.search.nodes,
      }
    },
  )

/* ──────────────────────────────────────────────────────────────────────────
 * Cart server functions
 *
 * Cart ID is stored in an httpOnly cookie. Reads + writes all go through the
 * server (higher rate limits via the private token, no token on the client,
 * and SSR can load the cart in route loaders). Optimistic updates happen in
 * the React Query cache on top of these.
 * ────────────────────────────────────────────────────────────────────────── */

function setCartResponseHeaders() {
  // Cart is per-user; do not edge-cache.
  setResponseHeaders(
    new Headers({ 'Cache-Control': 'private, no-store, must-revalidate' }),
  )
}

async function fetchCartById(cartId: string): Promise<CartDetail | null> {
  const result = await shopifyServerFetch<CartQueryResult, { cartId: string }>({
    query: CART_QUERY,
    variables: { cartId },
  })
  return result.cart
}

export const getCart = createServerFn({ method: 'GET' }).handler(
  async (): Promise<CartDetail | null> => {
    setCartResponseHeaders()
    const cartId = getCookie(CART_COOKIE_NAME)
    if (!cartId) return null

    const cart = await fetchCartById(cartId)
    // If Shopify pruned the cart (expired/abandoned), clear the stale cookie.
    if (!cart) deleteCookie(CART_COOKIE_NAME, { path: '/' })
    return cart
  },
)

export const addToCart = createServerFn({ method: 'POST' })
  .validator(
    v.object({
      variantId: shopifyProductVariantIdSchema,
      quantity: v.optional(cartQuantitySchema, 1),
    }),
  )
  .handler(async ({ data }): Promise<CartDetail> => {
    setCartResponseHeaders()
    const existingCartId = getCookie(CART_COOKIE_NAME)

    if (!existingCartId) {
      const result = await shopifyServerFetch<CartCreateResult>({
        query: CART_CREATE_MUTATION,
        variables: {
          input: {
            lines: [
              {
                merchandiseId: data.variantId,
                quantity: data.quantity,
              },
            ],
          },
        },
      })
      throwIfUserErrors(result.cartCreate.userErrors)
      const cart = result.cartCreate.cart
      if (!cart) throw new Error('Shopify returned no cart after create.')
      setCookie(CART_COOKIE_NAME, cart.id, CART_COOKIE_OPTIONS)
      return cart
    }

    const result = await shopifyServerFetch<CartLinesAddResult>({
      query: CART_LINES_ADD_MUTATION,
      variables: {
        cartId: existingCartId,
        lines: [{ merchandiseId: data.variantId, quantity: data.quantity }],
      },
    })
    throwIfUserErrors(result.cartLinesAdd.userErrors)
    const cart = result.cartLinesAdd.cart
    // If the existing cart was pruned between requests, fall through and
    // create a fresh cart with this line.
    if (!cart) {
      deleteCookie(CART_COOKIE_NAME, { path: '/' })
      const createResult = await shopifyServerFetch<CartCreateResult>({
        query: CART_CREATE_MUTATION,
        variables: {
          input: {
            lines: [{ merchandiseId: data.variantId, quantity: data.quantity }],
          },
        },
      })
      throwIfUserErrors(createResult.cartCreate.userErrors)
      const newCart = createResult.cartCreate.cart
      if (!newCart)
        throw new Error('Shopify returned no cart after recovery create.')
      setCookie(CART_COOKIE_NAME, newCart.id, CART_COOKIE_OPTIONS)
      return newCart
    }
    return cart
  })

export const updateCartLine = createServerFn({ method: 'POST' })
  .validator(
    v.object({
      lineId: shopifyCartLineIdSchema,
      quantity: cartUpdateQuantitySchema,
    }),
  )
  .handler(async ({ data }): Promise<CartDetail> => {
    setCartResponseHeaders()
    const cartId = getCookie(CART_COOKIE_NAME)
    if (!cartId) throw new Error('No cart exists to update.')

    const result = await shopifyServerFetch<CartLinesUpdateResult>({
      query: CART_LINES_UPDATE_MUTATION,
      variables: {
        cartId,
        lines: [{ id: data.lineId, quantity: data.quantity }],
      },
    })
    throwIfUserErrors(result.cartLinesUpdate.userErrors)
    const cart = result.cartLinesUpdate.cart
    if (!cart) throw new Error('Shopify returned no cart after update.')
    return cart
  })

export const removeCartLine = createServerFn({ method: 'POST' })
  .validator(v.object({ lineId: shopifyCartLineIdSchema }))
  .handler(async ({ data }): Promise<CartDetail> => {
    setCartResponseHeaders()
    const cartId = getCookie(CART_COOKIE_NAME)
    if (!cartId) throw new Error('No cart exists to remove from.')

    const result = await shopifyServerFetch<CartLinesRemoveResult>({
      query: CART_LINES_REMOVE_MUTATION,
      variables: { cartId, lineIds: [data.lineId] },
    })
    throwIfUserErrors(result.cartLinesRemove.userErrors)
    const cart = result.cartLinesRemove.cart
    if (!cart) throw new Error('Shopify returned no cart after remove.')
    return cart
  })

export const applyDiscountCode = createServerFn({ method: 'POST' })
  .validator(v.object({ code: discountCodeSchema }))
  .handler(async ({ data }): Promise<CartDetail> => {
    setCartResponseHeaders()
    const cartId = getCookie(CART_COOKIE_NAME)
    if (!cartId) throw new Error('No cart exists to apply a discount to.')
    const result = await shopifyServerFetch<CartDiscountCodesUpdateResult>({
      query: CART_DISCOUNT_CODES_UPDATE_MUTATION,
      variables: { cartId, discountCodes: [data.code] },
    })
    throwIfUserErrors(result.cartDiscountCodesUpdate.userErrors)
    const cart = result.cartDiscountCodesUpdate.cart
    if (!cart)
      throw new Error('Shopify returned no cart after discount update.')
    // Shopify silently drops invalid codes — surface that to the UI by
    // checking whether the code we sent is present and applicable.
    const applied = cart.discountCodes.find(
      (c) => c.code.toLowerCase() === data.code.toLowerCase(),
    )
    if (!applied || !applied.applicable) {
      throw new CartUserErrorsError([
        {
          field: null,
          message: `Discount code "${data.code}" is not valid or not applicable to this cart.`,
        },
      ])
    }
    return cart
  })

export const removeDiscountCode = createServerFn({ method: 'POST' }).handler(
  async (): Promise<CartDetail> => {
    setCartResponseHeaders()
    const cartId = getCookie(CART_COOKIE_NAME)
    if (!cartId) throw new Error('No cart exists.')
    const result = await shopifyServerFetch<CartDiscountCodesUpdateResult>({
      query: CART_DISCOUNT_CODES_UPDATE_MUTATION,
      variables: { cartId, discountCodes: [] },
    })
    throwIfUserErrors(result.cartDiscountCodesUpdate.userErrors)
    const cart = result.cartDiscountCodesUpdate.cart
    if (!cart) throw new Error('Shopify returned no cart after discount clear.')
    return cart
  },
)
