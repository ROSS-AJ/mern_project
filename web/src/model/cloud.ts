// The signed-in user's projects, kept by the Partwise API (server.js).
// The main site signs people in and leaves the token in localStorage
// ('authToken'); the editor is served from the same address, so it can read
// it. Guests have no token and simply don't see any of this.

import type { ProjectDoc } from './types.ts';
import { writePartwiseFile, partwiseFileName } from './partwiseFile.ts';

// Same address as the site and editor ('/api'); the old host builds with /mern/api.
export const API_BASE: string = import.meta.env.VITE_API_URL ?? '/api';

/** Thrown when the sign-in has run out (the token lasts an hour). */
export class SignedOutError extends Error {
  constructor() {
    super('Your sign-in has expired. Sign in again to save to your projects.');
  }
}

/** The site's sign-in token, or null if there's none or it has run out. */
export function authToken(): string | null {
  try {
    const token = localStorage.getItem('authToken');
    return token && !tokenExpired(token) ? token : null;
  } catch {
    return null;
  }
}

/** Reads the expiry from the token itself (a JWT); it isn't checked, the server does that. */
export function tokenExpired(token: string): boolean {
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))) as { exp?: number };
    return typeof payload.exp === 'number' && payload.exp * 1000 <= Date.now();
  } catch {
    return true;
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

/** One of the user's projects, with its PDF. */
export async function fetchCloudProject(id: string): Promise<{ project: CloudProject; pdf: Uint8Array }> {
  const key = encodeURIComponent(id);
  const { project } = (await (await request(`/projects/${key}`)).json()) as { project: CloudProject };
  const pdf = new Uint8Array(await (await request(`/projects/${key}/file`)).arrayBuffer());
  return { project, pdf };
}

/** Saves the layout of a project that's already in the user's projects. */
export async function saveCloudLayout(id: string, doc: ProjectDoc): Promise<void> {
  await request(`/projects/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ layout: { ...doc, cloudId: undefined } }),
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
