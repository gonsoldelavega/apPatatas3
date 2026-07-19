export function fortnightFor(dateValue: string): { start: string; end: string } {
  const [year, month, day] = dateValue.split("-").map(Number);
  if (!year || !month || !day) return { start: "", end: "" };
  const pad = (value: number) => String(value).padStart(2, "0");
  const prefix = `${year}-${pad(month)}-`;
  return day <= 15
    ? { start: `${prefix}01`, end: `${prefix}15` }
    : {
        start: `${prefix}16`,
        end: `${prefix}${pad(new Date(year, month, 0).getDate())}`,
      };
}

export function addCalendarDays(dateValue: string, days: number): string {
  const [year, month, day] = dateValue.split("-").map(Number);
  if (!year || !month || !day || !Number.isInteger(days)) return "";
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
}
