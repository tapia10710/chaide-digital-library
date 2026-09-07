import type { DocumentDef } from './mockData';

export const DISTRIBUTOR_CATEGORY_SLUG = 'catalogo-de-distribuidores';
export const DISTRIBUTOR_CATEGORY_NAME = 'Catálogo de Distribuidores';

const ACCESS_SESSION_KEY = 'chaide:distributor-catalog:access:v1';
const ACCESS_ACTIVITY_KEY = 'chaide:distributor-catalog:last-activity:v1';
const ACCESS_SESSION_VALUE = 'granted:2026';
const ACCESS_PASSWORD_SHA256 = '84a2b36807cbc98e2013c73d83ddc69650c7c293bf5b5643cc0fe04817d3e5b1';
export const DISTRIBUTOR_ACCESS_EVENT = 'chaide:distributor-access-change';
export const DISTRIBUTOR_ACCESS_TIMEOUT_MS = 20 * 60 * 1000;

type DistributorAccessChangeReason = 'granted' | 'manual' | 'expired';

function announceAccessChange(reason: DistributorAccessChangeReason) {
  window.dispatchEvent(new CustomEvent(DISTRIBUTOR_ACCESS_EVENT, { detail: { reason } }));
}

function normalize(value?: string | null) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

export function isDistributorCategory(slug?: string | null, name?: string | null) {
  return normalize(slug) === DISTRIBUTOR_CATEGORY_SLUG || normalize(name) === normalize(DISTRIBUTOR_CATEGORY_NAME);
}

export function isDistributorDocument(document?: Pick<DocumentDef, 'category'> | null) {
  return isDistributorCategory(undefined, document?.category);
}

export function canViewDistributorDocument(
  document?: Pick<DocumentDef, 'category'> | null,
  role?: string | null,
) {
  return !isDistributorDocument(document) || role === 'admin' || hasDistributorAccess();
}

export function hasDistributorAccess() {
  if (typeof window === 'undefined') return false;
  if (window.sessionStorage.getItem(ACCESS_SESSION_KEY) !== ACCESS_SESSION_VALUE) return false;

  const lastActivity = Number(window.sessionStorage.getItem(ACCESS_ACTIVITY_KEY) || 0);
  if (!lastActivity || Date.now() - lastActivity >= DISTRIBUTOR_ACCESS_TIMEOUT_MS) {
    clearDistributorAccess('expired');
    return false;
  }

  return true;
}

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function verifyDistributorPassword(password: string) {
  return (await sha256(password.trim())) === ACCESS_PASSWORD_SHA256;
}

export function grantDistributorAccess() {
  if (typeof window === 'undefined') return;
  window.sessionStorage.setItem(ACCESS_SESSION_KEY, ACCESS_SESSION_VALUE);
  window.sessionStorage.setItem(ACCESS_ACTIVITY_KEY, String(Date.now()));
  announceAccessChange('granted');
}

export function refreshDistributorAccess() {
  if (typeof window === 'undefined' || !hasDistributorAccess()) return false;
  window.sessionStorage.setItem(ACCESS_ACTIVITY_KEY, String(Date.now()));
  return true;
}

export function clearDistributorAccess(reason: Exclude<DistributorAccessChangeReason, 'granted'> = 'manual') {
  if (typeof window === 'undefined') return;
  window.sessionStorage.removeItem(ACCESS_SESSION_KEY);
  window.sessionStorage.removeItem(ACCESS_ACTIVITY_KEY);
  announceAccessChange(reason);
}
