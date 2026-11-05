import Dexie from 'dexie';
import axios from 'axios';
import API_BASE from '../config/api';

export const db = new Dexie('NhanDucPharmacyDB');

// Remove payload from index definition (Dexie limitation with objects)
db.version(2).stores({
  products: 'id, name, price, category, barcode, has_serial, has_batch', 
  customers: 'id, name, phone, email, taxId, loyalty_points, tier',
  offlineBills: '++id, customer_name, customer_phone, total_amount, date, sync_status' 
});

export const initDB = async () => {
  try {
    await db.open();
    console.log('Offline database initialized successfully');
  } catch (error) {
    console.error('Failed to initialize offline database:', error);
  }
};

let isSyncing = false;

/**
 * Sync offline bills to the server
 * @returns {Promise<number>} Number of synced bills
 */
export const syncOfflineBills = async () => {
  if (!navigator.onLine || isSyncing) return 0;
  isSyncing = true;
  
  let syncedCount = 0;
  
  try {
    const pendingBills = await db.offlineBills.where('sync_status').equals('pending').toArray();
    if (pendingBills.length === 0) {
      isSyncing = false;
      return 0;
    }

    for (const bill of pendingBills) {
      try {
        // Mark as syncing to avoid duplicate processing
        await db.offlineBills.update(bill.id, { sync_status: 'processing' });
        
        await axios.post(`${API_BASE}/api/pos/checkout`, bill.payload);
        
        // Mark as synced
        await db.offlineBills.update(bill.id, { sync_status: 'synced' });
        syncedCount++;
      } catch (err) {
        console.error(`Failed to sync bill ${bill.id}`, err);
        // If 4xx error, mark failed. Else network error, revert to pending
        if (err.response && err.response.status >= 400 && err.response.status < 500) {
          await db.offlineBills.update(bill.id, { sync_status: 'failed' });
        } else {
          await db.offlineBills.update(bill.id, { sync_status: 'pending' });
        }
      }
    }
  } catch (err) {
    console.error("Database access failed during sync", err);
  } finally {
    isSyncing = false;
  }
  
  return syncedCount;
};
