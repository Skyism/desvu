import type { CSSProperties } from 'react'
import type { Category } from '@shared/types'

/**
 * Category resolves by SHAPE, not by colour.
 *
 * The three hues hold lightness and chroma constant and vary only hue, which is what
 * makes the triad harmonious — and which also puts their mutual contrast at 1.01–1.03.
 * At 7px they are three identical dots. A lightness split was evaluated and rejected:
 * lightness encodes rank, and these categories are unordered.
 *
 * So the colour is decoration and the shape is the encoding. It is nominal (implies no
 * ranking) and colourblind-safe by construction. This matters most in the Today timeline
 * and any chronological list, where rows are not grouped under text headers and the
 * marker is the only category signal present.
 */

export type MarkerShape = 'square' | 'circle' | 'diamond'

export const CATEGORY_LABEL: Record<Category, string> = {
  recruiting: 'Recruiting',
  school: 'School',
  personal: 'Personal',
}

export const CATEGORY_SHAPE: Record<Category, MarkerShape> = {
  recruiting: 'square',
  school: 'circle',
  personal: 'diamond',
}

export const CATEGORY_COLOR: Record<Category, string> = {
  recruiting: 'var(--cat-recruiting)',
  school: 'var(--cat-school)',
  personal: 'var(--cat-personal)',
}

/** Display order. Matches the comp's Today list. */
export const CATEGORY_ORDER: readonly Category[] = ['recruiting', 'school', 'personal'] as const

/**
 * A diamond is a rotated square, so at equal side length it reads heavier and its
 * bounding box is 1.41× wider. The comp compensates by drawing it at 7px where the
 * square and circle are 8px; this keeps that ratio at any size.
 */
const DIAMOND_RATIO = 0.875

/**
 * Inline style for a marker, for the places that cannot mount a component — SVG charts,
 * the Today rail's absolutely-positioned blocks, Recharts `fill` props.
 * Prefer `<CategoryMarker>` anywhere a DOM node is acceptable: it also carries the
 * accessible name.
 */
export function categoryMarkerStyle(category: Category, size = 8): CSSProperties {
  const shape = CATEGORY_SHAPE[category]
  const side = shape === 'diamond' ? Math.round(size * DIAMOND_RATIO * 100) / 100 : size
  return {
    width: `${side}px`,
    height: `${side}px`,
    flex: `0 0 ${side}px`,
    background: CATEGORY_COLOR[category],
    borderRadius: shape === 'circle' ? '99px' : '1px',
    transform: shape === 'diamond' ? 'rotate(45deg)' : 'none',
  }
}
