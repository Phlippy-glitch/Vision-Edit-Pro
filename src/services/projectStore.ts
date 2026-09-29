import type { Project } from '../types/Editor.types';

/**
 * Projects live in IndexedDB on the device, so the app works offline on a
 * job site with no signal. Photos are stored as Blobs, not data URLs.
 */

const DB_NAME = 'vision-edit-pro';
const DB_VERSION = 1;
const STORE = 'projects';

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE)) {
          request.result.createObjectStore(STORE, { keyPath: 'id' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => {
        dbPromise = null;
        reject(new Error('Could not open local storage. Private browsing may block saving projects.'));
      };
    });
  }
  return dbPromise;
}

function run<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const request = fn(tx.objectStore(STORE));
        tx.oncomplete = () => resolve(request.result);
        tx.onerror = () => reject(tx.error ?? new Error('Storage operation failed.'));
        tx.onabort = () =>
          reject(
            tx.error?.name === 'QuotaExceededError'
              ? new Error('Device storage is full. Delete old projects to free space.')
              : (tx.error ?? new Error('Storage operation was aborted.')),
          );
      }),
  );
}

export async function listProjects(): Promise<Project[]> {
  const projects = await run<Project[]>('readonly', (store) => store.getAll());
  return projects.sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getProject(id: string): Promise<Project | undefined> {
  return run<Project | undefined>('readonly', (store) => store.get(id));
}

export async function saveProject(project: Project): Promise<void> {
  await run('readwrite', (store) => store.put(project));
}

export async function deleteProject(id: string): Promise<void> {
  await run('readwrite', (store) => store.delete(id));
}
