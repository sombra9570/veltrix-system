// Fotos del cliente guardadas en el dispositivo mientras no hay señal (IndexedDB); se suben al volver la conexión.
const DB = 'vx_offline_files';
const STORE = 'files';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
const run = async <T,>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> => {
  const db = await open();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const r = fn(tx.objectStore(STORE));
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    tx.oncomplete = () => db.close();
  });
};
export const putFile = (key: string, blob: Blob) => run('readwrite', (s) => s.put(blob, key)).then(() => undefined);
export const getFile = (key: string) => run<Blob | undefined>('readonly', (s) => s.get(key) as IDBRequest<Blob | undefined>);
export const delFile = (key: string) => run('readwrite', (s) => s.delete(key)).then(() => undefined);
