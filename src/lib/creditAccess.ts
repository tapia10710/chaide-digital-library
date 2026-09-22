import type { DocumentDef } from './mockData';

export const CREDIT_CATEGORY_SLUG = 'credito';
export const CREDIT_CATEGORY_NAME = 'Crédito';

const ACCESS_SESSION_KEY = 'chaide:credit-catalog:access:v1';
const ACCESS_ACTIVITY_KEY = 'chaide:credit-catalog:last-activity:v1';
const ACCESS_SESSION_VALUE = 'granted:2026';
const ACCESS_PASSWORD_SHA256 = '6fc6bc327c5aea64ab324766069147e76a3843f4839a0d859bb53693c6fde0ad';
export const CREDIT_ACCESS_EVENT = 'chaide:credit-access-change';
export const CREDIT_ACCESS_TIMEOUT_MS = 20 * 60 * 1000;

type CreditAccessChangeReason = 'granted' | 'manual' | 'expired';

function announceAccessChange(reason: CreditAccessChangeReason) {
  window.dispatchEvent(new CustomEvent(CREDIT_ACCESS_EVENT, { detail: { reason } }));
}

function normalize(value?: string | null) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

export function isCreditCategory(slug?: string | null, name?: string | null) {
  return normalize(slug) === CREDIT_CATEGORY_SLUG || normalize(name) === normalize(CREDIT_CATEGORY_NAME);
}

export function isCreditDocument(document?: Pick<DocumentDef, 'category'> | null) {
  return isCreditCategory(undefined, document?.category);
}

export function canViewCreditDocument(
  document?: Pick<DocumentDef, 'category'> | null,
  role?: string | null,
) {
  return !isCreditDocument(document) || role === 'admin' || hasCreditAccess();
}

export function hasCreditAccess() {
  if (typeof window === 'undefined') return false;
  if (window.sessionStorage.getItem(ACCESS_SESSION_KEY) !== ACCESS_SESSION_VALUE) return false;

  const lastActivity = Number(window.sessionStorage.getItem(ACCESS_ACTIVITY_KEY) || 0);
  if (!lastActivity || Date.now() - lastActivity >= CREDIT_ACCESS_TIMEOUT_MS) {
    clearCreditAccess('expired');
    return false;
  }

  return true;
}

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function verifyCreditPassword(password: string) {
  return (await sha256(password.trim())) === ACCESS_PASSWORD_SHA256;
}

export function grantCreditAccess() {
  if (typeof window === 'undefined') return;
  window.sessionStorage.setItem(ACCESS_SESSION_KEY, ACCESS_SESSION_VALUE);
  window.sessionStorage.setItem(ACCESS_ACTIVITY_KEY, String(Date.now()));
  announceAccessChange('granted');
}

export function refreshCreditAccess() {
  if (typeof window === 'undefined' || !hasCreditAccess()) return false;
  window.sessionStorage.setItem(ACCESS_ACTIVITY_KEY, String(Date.now()));
  return true;
}

export function clearCreditAccess(reason: Exclude<CreditAccessChangeReason, 'granted'> = 'manual') {
  if (typeof window === 'undefined') return;
  window.sessionStorage.removeItem(ACCESS_SESSION_KEY);
  window.sessionStorage.removeItem(ACCESS_ACTIVITY_KEY);
  announceAccessChange(reason);
}
