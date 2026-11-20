/**
 * Tenant utilities for the frontend.
 * Detects which tenant the current browser is viewing.
 */

export function getCurrentTenantSlug() {
  const host = window.location.hostname;
  const base = import.meta.env.VITE_BASE_DOMAIN ?? 'localhost';

  if (host === base || host === `www.${base}`) {
    return null;
  }

  const parts = host.split('.');
  if (parts.length >= 2) {
    const sub = parts[0];
    if (!['www', 'api', 'super', 'admin'].includes(sub)) {
      return sub;
    }
  }
  return null;
}

export function isSuperAdminDomain() {
  const host = window.location.hostname;
  const superDomain = import.meta.env.VITE_SUPER_ADMIN_DOMAIN ?? 'super.localhost';
  return host === superDomain;
}

export function getTenantSubdomain(slug) {
  const base = import.meta.env.VITE_BASE_DOMAIN ?? 'localhost';
  const port = window.location.port ? `:${window.location.port}` : '';
  return `http://${slug}.${base}${port}`;
}
