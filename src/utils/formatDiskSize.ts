import type { Locale } from '@/i18n';

const UNITS = ['B', 'KB', 'MB', 'GB', 'TB'];

export function formatDiskSize(bytes: number, locale: Locale): string {
  if (!bytes) {
    return '-';
  }

  let value = bytes;
  let unit = 0;

  while (value >= 1000 && unit < UNITS.length - 1) {
    value /= 1000;
    unit++;
  }
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value)} ${UNITS[unit]}`;
}
