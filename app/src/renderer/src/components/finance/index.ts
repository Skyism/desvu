/**
 * Finance surface components. `budget.ts` holds every rule that decides how a number is
 * drawn — including the one that says over budget is gold, never red.
 */

export { BudgetBar, SpendLine } from './BudgetBar'
export type { BudgetBarProps, SpendLineProps } from './BudgetBar'

export { BudgetDialog } from './BudgetDialog'
export type { BudgetDialogProps } from './BudgetDialog'

export { PurchaseDialog } from './PurchaseDialog'
export type { PurchaseDialogProps } from './PurchaseDialog'

export { PurchaseLog } from './PurchaseLog'
export type { PurchaseLogProps } from './PurchaseLog'

export { SpendingCard } from './SpendingCard'
export type { SpendingCardProps } from './SpendingCard'

export * from './budget'
