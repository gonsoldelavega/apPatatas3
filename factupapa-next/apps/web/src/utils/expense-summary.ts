export type ExpensePeriodKind = "all" | "month" | "quarter" | "year";

export interface ExpensePeriodRange { from?: string; to?: string; }
export interface RecurringSummaryItem { amount: string; startsOn: string; endsOn: string | null; isActive: boolean; }

function monthEnd(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Date(Date.UTC(year, monthNumber, 0)).toISOString().slice(0, 10);
}

export function recurringMonthsApplied(item: RecurringSummaryItem, range: ExpensePeriodRange) {
  if (!range.from || !range.to) return item.isActive ? 1 : 0;
  let cursor = range.from.slice(0, 7);
  const last = range.to.slice(0, 7);
  let count = 0;
  while (cursor <= last) {
    const start = `${cursor}-01`;
    const end = monthEnd(cursor);
    if (item.isActive && item.startsOn <= end && (!item.endsOn || item.endsOn >= start)) count += 1;
    const [year, monthNumber] = cursor.split("-").map(Number);
    cursor = monthNumber === 12 ? `${year + 1}-01` : `${year}-${String(monthNumber + 1).padStart(2, "0")}`;
  }
  return count;
}

export function recurringTotal(items: RecurringSummaryItem[], kind: ExpensePeriodKind, range: ExpensePeriodRange) {
  if (kind === "all") return 0;
  return items.reduce((sum, item) => sum + Number(item.amount) * recurringMonthsApplied(item, range), 0);
}

export function expensePeriodTotal(purchases: number, fixed: number, kind: ExpensePeriodKind) {
  return kind === "all" ? null : purchases + fixed;
}
