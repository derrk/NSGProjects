import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function formatPrice(price: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(price);
}

export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export function calculateSavings(market: number, store: number): number {
  return Math.round(((market - store) / market) * 100);
}

export function slugify(text: string): string {
  return text.toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]/g, '');
}

// Merges Tailwind classes, with later utilities winning over earlier ones in the
// same group — the ported admin components rely on that to override variants.
// Existing callers pass plain strings, which still behave as before.
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
