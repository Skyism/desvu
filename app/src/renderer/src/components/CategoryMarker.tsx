import type { Category } from '@shared/types'

import { CATEGORY_LABEL, CATEGORY_SHAPE, categoryMarkerStyle } from '@/lib/category'
import { cn } from '@/lib/cn'

export interface CategoryMarkerProps {
  category: Category
  /** Side length in px. The diamond is drawn at 0.875× so its visual weight matches. */
  size?: number
  /** Render the category name beside the marker, in the eyebrow style from the comp. */
  showLabel?: boolean
  /**
   * Set when adjacent text already names the category, so screen readers do not hear
   * "Recruiting, Recruiting". `showLabel` implies this.
   */
  decorative?: boolean
  className?: string
  labelClassName?: string
}

/**
 * The category marker. Every surface uses this, and nothing else may encode category.
 *
 * WHY SHAPE. The three category hues hold lightness and chroma constant and vary only
 * hue — which is what makes the triad harmonious, and which puts their contrast *against
 * each other* at 1.01–1.03. At 7px they are three identical dots. Splitting lightness
 * would fix separation but lightness encodes rank, and these categories are unordered
 * (and light-theme `personal` would fall to 2.52:1, under the non-text floor).
 *
 *   recruiting = square      school = circle      personal = diamond
 *
 * Shape is nominal, so it implies no ranking, and it is colourblind-safe by
 * construction. Colour is decoration here; it must never be the only signal. This is
 * load-bearing in the Today timeline and any chronological list, where rows are not
 * grouped under text headers and the marker is the only category signal present.
 *
 * The marker is also never the only *interactive* signal — gold always outranks
 * category, because gold means "interact with this" and category means "this belongs
 * to that group".
 */
export function CategoryMarker({
  category,
  size = 8,
  showLabel = false,
  decorative = false,
  className,
  labelClassName,
}: CategoryMarkerProps): React.JSX.Element {
  const shape = CATEGORY_SHAPE[category]
  const silent = decorative || showLabel

  const marker = (
    <span
      // The wrapper keeps a stable `size × size` footprint so a rotated diamond never
      // shifts the row it sits in.
      className={cn('inline-grid place-items-center', className)}
      style={{ width: size, height: size, flex: `0 0 ${size}px` }}
      {...(silent
        ? { 'aria-hidden': true }
        : { role: 'img', 'aria-label': CATEGORY_LABEL[category] })}
      data-category={category}
      data-shape={shape}
    >
      <span style={categoryMarkerStyle(category, size)} />
    </span>
  )

  if (!showLabel) return marker

  return (
    <span className="inline-flex items-center gap-2.5">
      {marker}
      <span
        className={cn(
          'text-label tracking-label text-muted uppercase',
          labelClassName
        )}
      >
        {CATEGORY_LABEL[category]}
      </span>
    </span>
  )
}

/**
 * The three markers with their names — for a filter bar or a chart legend. Anywhere the
 * reader has to learn the mapping once, show it once.
 */
export function CategoryLegend({ className }: { className?: string }): React.JSX.Element {
  return (
    <div className={cn('flex flex-wrap items-center gap-x-5 gap-y-2', className)}>
      {(Object.keys(CATEGORY_LABEL) as Category[]).map((category) => (
        <CategoryMarker key={category} category={category} showLabel />
      ))}
    </div>
  )
}
