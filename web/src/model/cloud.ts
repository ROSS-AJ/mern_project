// The signed-in user's projects, kept by the Partwise API (server.js).
// The main site signs people in and leaves the token in localStorage
// ('authToken'); the editor is served from the same address, so it can read
// it. Guests have no token and simply don't see any of this.

import type { ProjectDoc } from './types.ts';
import { writePartwiseFile, partwiseFileName } from './partwiseFile.ts';

export const API_BASE: string = import.meta.env.VITE_API_URL ?? 'https://lamp.rosslampdemo.com/mern/api';

const TOKEN_KEY = 'authToken';

/** Thrown when the sign-in has run out (a token lasts an hour unless it's refreshed). */
export class SignedOutError extends Error {
  constructor() {
    super('Your sign-in has expired. Sign in again to save to your projects.');
  }
}

/** Thrown when the project isn't in the signed-in user's projects (deleted on the dashboard, or another account). */
export class NotInProjectsError extends Error {
  constructor() {
    super("This project isn't in your projects any more.");
  }
}

/** When the token runs out (ms), read from the JWT. The server checks the token for real. */
function expiresAt(token: string): number | null {
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))) as { exp?: unknown };
    return typeof payload.exp === 'number' ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

/** The sign-in, if there is one that hasn't run out. */
export function authToken(): string | null {
  try {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) return null;
    const end = expiresAt(token);
    return end !== null && end <= Date.now() ? null : token;
  } catch {
    return null;
  }
}

/** Refresh the sign-in once it has less than this left. */
const REFRESH_WITHIN = 30 * 60 * 1000;

/**
 * Swaps the sign-in for a fresh one-hour one when it's getting old, so someone
 * who keeps working is never signed out. Does nothing for guests or a
 * sign-in that has already run out.
 */
export async function refreshSignIn(force = false): Promise<void> {
  const token = authToken();
  if (!token) return;
  const end = expiresAt(token);
  if (!force && end !== null && end - Date.now() > REFRESH_WITHIN) return;
  try {
    const response = await fetch(`${API_BASE}/refresh`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) return;
    const data = (await response.json()) as { token?: string };
    // Another tab may have signed someone else in meanwhile; keep theirs.
    if (data.token && localStorage.getItem(TOKEN_KEY) === token) localStorage.setItem(TOKEN_KEY, data.token);
  } catch {
    // Offline: try again next time.
  }
}

async function request(path: string, init: RequestInit = {}): Promise<Response> {
  const token = authToken();
  if (!token) throw new SignedOutError();
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { ...init.headers, Authorization: `Bearer ${token}` },
  });
  if (response.status === 401) throw new SignedOutError();
  if (response.status === 404) throw new NotInProjectsError();
  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error || `The server said no (${response.status}).`);
  }
  return response;
}

export interface CloudProject {
  _id: string;
  title: string;
  originalName: string;
  /** The editor's ProjectDoc, or null if it was uploaded as a bare PDF and never opened. */
  pageLayout: ProjectDoc | null;
}

/** One of the user's projects, without its PDF. */
export async function fetchCloudLayout(id: string): Promise<CloudProject> {
  const { project } = (await (await request(`/projects/${encodeURIComponent(id)}`)).json()) as { project: CloudProject };
  return project;
}

/** One of the user's projects, with its PDF. */
export async function fetchCloudProject(id: string): Promise<{ project: CloudProject; pdf: Uint8Array }> {
  const project = await fetchCloudLayout(id);
  const pdf = new Uint8Array(await (await request(`/projects/${encodeURIComponent(id)}/file`)).arrayBuffer());
  return { project, pdf };
}

/**
 * Saves the layout of a project that's already in the user's projects.
 * `keepalive` lets the request finish while the tab closes.
 */
export async function saveCloudLayout(id: string, doc: ProjectDoc, keepalive = false): Promise<void> {
  const body = JSON.stringify({ layout: { ...doc, cloudId: undefined } });
  await request(`/projects/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body,
    // Browsers refuse keepalive requests over 64 KB; a big layout goes the normal way.
    keepalive: keepalive && body.length < 60_000,
  });
}

/** Adds a project to the user's projects (as a .partwise file); returns its id. */
export async function createCloudProject(doc: ProjectDoc, pdf: Uint8Array): Promise<string> {
  const form = new FormData();
  const bytes = writePartwiseFile(doc, pdf);
  form.append('file', new Blob([bytes as BlobPart], { type: 'application/zip' }), partwiseFileName(doc));
  const { project } = (await (await request('/projects', { method: 'POST', body: form })).json()) as {
    project: { _id: string };
  };
  return project._id;
}

/**
 * Of the copy in this browser and the one in the user's projects, the one
 * edited last. Both carry the editor's updatedAt, so they compare directly.
 */
export function newerCopy(local: ProjectDoc, saved: ProjectDoc | null): 'local' | 'saved' {
  return saved && saved.updatedAt > local.updatedAt ? 'saved' : 'local';
}
