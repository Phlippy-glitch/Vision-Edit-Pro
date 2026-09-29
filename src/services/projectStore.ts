import type { CustomAssetRecord, Project } from '../types/Editor.types';

/**
 * Projects live in IndexedDB on the device, so the app works offline on a
 * job site with no signal. Photos are stored as Blobs, not data URLs.
 */

const DB_NAME = 'vision-edit-pro';
// v2 adds the store for custom plant photos; existing projects are untouched.
const DB_VERSION = 2;
const PROJECTS = 'projects';
const CUSTOM_ASSETS = 'customAssets';
type StoreName = typeof PROJECTS | typeof CUSTOM_ASSETS;

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        for (const name of [PROJECTS, CUSTOM_ASSETS]) {
          if (!request.result.objectStoreNames.contains(name)) {
            request.result.createObjectStore(name, { keyPath: 'id' });
          }
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

function run<T>(storeName: StoreName, mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(storeName, mode);
        const request = fn(tx.objectStore(storeName));
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
  const projects = await run<Project[]>(PROJECTS, 'readonly', (store) => store.getAll());
  return projects.sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getProject(id: string): Promise<Project | undefined> {
  return run<Project | undefined>(PROJECTS, 'readonly', (store) => store.get(id));
}

export async function saveProject(project: Project): Promise<void> {
  await run(PROJECTS, 'readwrite', (store) => store.put(project));
}

export async function deleteProject(id: string): Promise<void> {
  await run(PROJECTS, 'readwrite', (store) => store.delete(id));
}

export async function listCustomAssets(): Promise<CustomAssetRecord[]> {
  const records = await run<CustomAssetRecord[]>(CUSTOM_ASSETS, 'readonly', (store) => store.getAll());
  return records.sort((a, b) => a.createdAt - b.createdAt);
}

export async function saveCustomAsset(record: CustomAssetRecord): Promise<void> {
  await run(CUSTOM_ASSETS, 'readwrite', (store) => store.put(record));
}

export async function deleteCustomAsset(id: string): Promise<void> {
  await run(CUSTOM_ASSETS, 'readwrite', (store) => store.delete(id));
}
