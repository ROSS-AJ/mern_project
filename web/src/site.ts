// Where the main Partwise site (sign-in, account, project library) lives.
// The editor itself needs no account: guests can always use it.
//   - development: the main site's own dev server
//   - production: served next to the editor (editor at /partwise/editor/)
// Override with VITE_SITE_URL if it's deployed somewhere else.
export const SITE_URL: string =
  import.meta.env.VITE_SITE_URL ?? (import.meta.env.DEV ? 'http://localhost:8443/partwise/' : '/partwise/');
