// Keeps ONE project in the browser (IndexedDB): the one you're working on,
// so you can close the tab and continue later. Starting a new score replaces
// it. Signed-in users will get a real project browser backed by the API; this
// file is the only place that knows where projects live, so that's where the
// API calls go.
//
// IndexedDB rather than localStorage because the PDF itself is stored too,
// and PDFs are far bigger than localStorage allows.

import type { ProjectDoc } from './types.ts';

const DB_NAME = 'partwise';
const DB_VERSION = 1;
const PROJECTS = 'projects';
const FILES = 'files';

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(PROJECTS)) db.createObjectStore(PROJECTS, { keyPath: 'id' });
        if (!db.objectStoreNames.contains(FILES)) db.createObjectStore(FILES);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  return dbPromise;
}

function run<T>(stores: string[], mode: IDBTransactionMode, body: (tx: IDBTransaction) => IDBRequest<T> | void): Promise<T | undefined> {
  return openDb().then(
    (db) =>
      new Promise<T | undefined>((resolve, reject) => {
        const transaction = db.transaction(stores, mode);
        const request = body(transaction);
        transaction.oncomplete = () => resolve(request ? request.result : undefined);
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
      }),
  );
}

/** The project to continue, without its PDF (for the home screen). */
export async function peekLastProject(): Promise<ProjectDoc | undefined> {
  const all = (await run<ProjectDoc[]>([PROJECTS], 'readonly', (tx) => tx.objectStore(PROJECTS).getAll())) ?? [];
  return all.sort((a, b) => b.updatedAt - a.updatedAt)[0];
}

/** The project to continue, with its PDF. */
export async function loadLastProject(): Promise<{ doc: ProjectDoc; bytes: Uint8Array } | undefined> {
  const doc = await peekLastProject();
  if (!doc) return undefined;
  const value = await run<Uint8Array | ArrayBuffer>([FILES], 'readonly', (tx) => tx.objectStore(FILES).get(doc.id));
  if (!value) return undefined;
  return { doc, bytes: value instanceof Uint8Array ? value : new Uint8Array(value) };
}

/** Autosave of the open project. */
export async function saveProject(doc: ProjectDoc): Promise<void> {
  await run([PROJECTS], 'readwrite', (tx) => tx.objectStore(PROJECTS).put(doc));
}

/** Replaces whatever was saved with a new project and its PDF. */
export async function startNewProject(doc: ProjectDoc, bytes: Uint8Array): Promise<void> {
  await run([PROJECTS, FILES], 'readwrite', (tx) => {
    tx.objectStore(PROJECTS).clear();
    tx.objectStore(FILES).clear();
    tx.objectStore(PROJECTS).put(doc);
    tx.objectStore(FILES).put(bytes, doc.id);
  });
}

/** Removes everything Partwise saved in this browser. */
export async function clearSaved(): Promise<void> {
  await run([PROJECTS, FILES], 'readwrite', (tx) => {
    tx.objectStore(PROJECTS).clear();
    tx.objectStore(FILES).clear();
  });
}
