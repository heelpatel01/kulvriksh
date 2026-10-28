// Display formatting. Used on the server so that labels are identical in the HTML and after
// hydration. The time zone is fixed for deterministic output.
const LOCALE = 'en-IN';
const TIME_ZONE = 'Asia/Kolkata';

const dateFormat = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'short', year: 'numeric', timeZone: TIME_ZONE });
const dateTimeFormat = new Intl.DateTimeFormat(LOCALE, {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: TIME_ZONE,
});

export function formatDate(iso: string): string {
  return dateFormat.format(new Date(iso));
}

export function formatDateTime(iso: string): string {
  return dateTimeFormat.format(new Date(iso));
}

/**
 * Amounts are stored in the smallest currency unit (paise). The currency is a placeholder:
 * currencies are TBC (DQ-2) and all amounts in the preview are sample values.
 */
export function formatAmount(minorUnits: number): string {
  return new Intl.NumberFormat(LOCALE, { style: 'currency', currency: 'INR' }).format(minorUnits / 100);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
}

/** Minor units → display, using the currency's own number of decimals (e.g. 2 for INR, 0 for JPY). */
export function formatMoney(minorUnits: number, currency: string): string {
  const format = new Intl.NumberFormat(LOCALE, { style: 'currency', currency });
  const digits = format.resolvedOptions().maximumFractionDigits ?? 2;
  return format.format(minorUnits / 10 ** digits);
}

/** The number of decimals a currency uses, for converting typed prices into minor units. */
export function currencyDigits(currency: string): number {
  return new Intl.NumberFormat(LOCALE, { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2;
}
