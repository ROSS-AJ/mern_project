// Where the main Partwise site (sign-in, dashboard) lives. The editor needs
// no account: guests can always use it.
//
// The editor is served at <site>/editor/, so the site is one level up from
// the editor's own address. Override with VITE_SITE_URL if it's deployed
// somewhere else.
export const SITE_URL: string = import.meta.env.VITE_SITE_URL ?? import.meta.env.BASE_URL.replace(/editor\/?$/, '');

/** Sign in, then come back to the editor. */
export const LOGIN_URL = `${SITE_URL}login?next=${encodeURIComponent('/editor/')}`;

export const DASHBOARD_URL = `${SITE_URL}dashboard`;
