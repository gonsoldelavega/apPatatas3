export type PeriodKind = "all" | "month" | "quarter" | "year";

export interface Period {
  kind: PeriodKind;
  month: string; // "YYYY-MM"
  quarter: string; // "1".."4"
  year: string; // "YYYY"
}

export function currentPeriod(kind: PeriodKind = "month"): Period {
  const today = new Date();
  const year = String(today.getFullYear());
  const month = `${year}-${String(today.getMonth() + 1).padStart(2, "0")}`;
  return {
    kind,
    month,
    quarter: String(Math.floor(today.getMonth() / 3) + 1),
    year,
  };
}

const lastDay = (year: number, month: number) =>
  new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);

export function periodRange(period: Period): { from?: string; to?: string } {
  if (period.kind === "month" && /^\d{4}-\d{2}$/.test(period.month)) {
    return {
      from: `${period.month}-01`,
      to: lastDay(Number(period.month.slice(0, 4)), Number(period.month.slice(5))),
    };
  }
  if (
    period.kind === "quarter" &&
    /^\d{4}$/.test(period.year) &&
    /^[1-4]$/.test(period.quarter)
  ) {
    const year = Number(period.year),
      firstMonth = (Number(period.quarter) - 1) * 3 + 1;
    return {
      from: `${period.year}-${String(firstMonth).padStart(2, "0")}-01`,
      to: lastDay(year, firstMonth + 2),
    };
  }
  if (period.kind === "year" && /^\d{4}$/.test(period.year)) {
    return { from: `${period.year}-01-01`, to: `${period.year}-12-31` };
  }
  return {};
}

export function periodLabel(period: Period): string {
  if (period.kind === "month") return period.month;
  if (period.kind === "quarter") return `${period.year}-T${period.quarter}`;
  if (period.kind === "year") return period.year;
  return "todo";
}
