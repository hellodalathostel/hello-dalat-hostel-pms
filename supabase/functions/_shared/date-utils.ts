export function todayVN(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());
}

export function isValidDateOnly(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

export function nightsBetween(checkIn: string, checkOut: string): number {
  const d1 = new Date(`${checkIn}T00:00:00Z`);
  const d2 = new Date(`${checkOut}T00:00:00Z`);
  return Math.round((d2.getTime() - d1.getTime()) / 86400000);
}
