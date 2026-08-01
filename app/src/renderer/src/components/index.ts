/**
 * The design system's public vocabulary. Import from `@/components`, not from the
 * individual files — the barrel is what makes a later rename cheap.
 *
 * Everything here is derived from the approved comp and the locked design brief. If a
 * surface needs something that is not in this list, that is a design decision: it belongs
 * in `Moodboard/Design-Brief.md` first and in this directory second. Do not style one off
 * inside a surface.
 */

export { Badge, Dot } from './Badge'
export type { BadgeProps, BadgeTone } from './Badge'

export { Button } from './Button'
export type { ButtonProps, ButtonSize, ButtonVariant } from './Button'

export { Card, Eyebrow } from './Card'
export type { CardProps, CardVariant } from './Card'

export { CategoryLegend, CategoryMarker } from './CategoryMarker'
export type { CategoryMarkerProps } from './CategoryMarker'

export { Checkbox } from './Checkbox'
export type { CheckboxProps } from './Checkbox'

export { Dialog } from './Dialog'
export type { DialogProps } from './Dialog'

export { EmptyState } from './EmptyState'
export type { EmptyStateProps } from './EmptyState'

export { CONTROL_CLASS, Field } from './Field'
export type { FieldProps } from './Field'

export { Input, Select, Textarea } from './Input'
export type { InputProps, SelectProps, TextareaProps } from './Input'

export { Page } from './Page'
export type { PageProps } from './Page'

export { PriorityEdge } from './PriorityEdge'
export type { PriorityEdgeProps } from './PriorityEdge'

export { Skeleton, SkeletonLines } from './Skeleton'
export type { SkeletonProps } from './Skeleton'

export { StreakBadge } from './Streak'
export type { StreakBadgeProps } from './Streak'

export { ToastProvider, useToast } from './Toast'
export type { ToastOptions, ToastTone } from './Toast'

export { GlobalControls } from './shell/GlobalControls'
export { QUICK_CAPTURE_GLOBAL_HINT, QUICK_CAPTURE_HINT, QuickCapture } from './shell/QuickCapture'
export { Sidebar } from './shell/Sidebar'
