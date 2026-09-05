import { TradeEventData } from '../types';

const DATABASE_NAME = 'trade_tracker_storage';
const DATABASE_VERSION = 1;
const STORE_NAME = 'trade_events';
const LEDGER_KEY = 'ledger';

const openDatabase = (): Promise<IDBDatabase> => new Promise((resolve, reject) => {
  const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
  request.onupgradeneeded = () => {
    const database = request.result;
    if (!database.objectStoreNames.contains(STORE_NAME)) {
      database.createObjectStore(STORE_NAME);
    }
  };
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error || new Error('Unable to open Trade Events storage'));
});

export const loadStoredTradeEvents = async (): Promise<TradeEventData[]> => {
  if (typeof indexedDB === 'undefined') return [];
  const database = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readonly');
      const request = transaction.objectStore(STORE_NAME).get(LEDGER_KEY);
      request.onsuccess = () => resolve(Array.isArray(request.result) ? request.result : []);
      request.onerror = () => reject(request.error || new Error('Unable to load Trade Events'));
    });
  } finally {
    database.close();
  }
};

export const saveStoredTradeEvents = async (events: TradeEventData[]): Promise<void> => {
  if (typeof indexedDB === 'undefined') return;
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).put(events, LEDGER_KEY);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error('Unable to save Trade Events'));
      transaction.onabort = () => reject(transaction.error || new Error('Trade Events save was aborted'));
    });
  } finally {
    database.close();
  }
};
