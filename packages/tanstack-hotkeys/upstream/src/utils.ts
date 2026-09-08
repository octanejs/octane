import type React from 'react'

/**
 * Type guard to check if a value is a React ref-like object.
 */
export function isRef(
  value: unknown,
): value is React.RefObject<HTMLElement | null> {
  return value !== null && typeof value === 'object' && 'current' in value
}
