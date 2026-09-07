import { ref, set, get, child } from 'firebase/database';
import { rtdb } from '../config/firebase';
import { Customer, MilkEntry, Payment, Supplier } from '../types';
import { StorageService } from './storageService';

// Helper to prevent infinite spinner with a timeout
const withTimeout = <T>(promise: Promise<T>, timeoutMs = 15000, errorMsg = 'Firebase request timed out'): Promise<T> => {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(errorMsg)), timeoutMs))
  ]);
};

function formatFirebaseError(error: any): string {
  const msg = error?.message || String(error);
  if (msg.includes('PERMISSION_DENIED') || msg.includes('permission_denied')) {
    return 'Firebase permission denied. In Firebase Console > Realtime Database > Rules, set ".read": true, ".write": true for Test Mode.';
  }
  if (msg.includes('timed out') || msg.includes('TIMEOUT')) {
    return 'Connection timed out (15s). Please check your internet connection.';
  }
  if (msg.includes('network') || msg.includes('NETWORK')) {
    return 'Network connection issue. Please check your mobile data or Wi-Fi.';
  }
  return msg || 'An unknown error occurred during sync.';
}

export const FirebaseSyncService = {
  // Test Firebase connection
  async testConnection(): Promise<{ success: boolean; message: string }> {
    try {
      const pingRef = ref(rtdb, 'system/ping');
      await withTimeout(
        set(pingRef, {
          lastPing: Date.now(),
          client: 'Dairy Mobile App'
        }),
        10000,
        'Firebase Ping timed out after 10 seconds.'
      );
      return {
        success: true,
        message: 'Connected to Firebase Cloud Database successfully!'
      };
    } catch (error: any) {
      console.warn('Firebase connection test error:', error);
      return {
        success: false,
        message: formatFirebaseError(error)
      };
    }
  },

  // Upload all local data to Firebase Cloud Realtime Database
  async uploadAllToCloud(supplier: Supplier): Promise<{ success: boolean; message: string }> {
    try {
      if (!supplier || !supplier.id) {
        throw new Error('No supplier profile found to sync.');
      }

      const supplierId = supplier.id;

      // 1. Fetch local storage data
      const customers = await StorageService.getCustomers();
      const milkEntries = await StorageService.getMilkEntries();
      const payments = await StorageService.getPayments();

      // Format records into indexed objects for Realtime Database
      const customersMap: Record<string, Customer> = {};
      customers.forEach(c => {
        if (c && c.id) customersMap[c.id] = c;
      });

      const milkEntriesMap: Record<string, MilkEntry> = {};
      milkEntries.forEach(e => {
        if (e && e.id) milkEntriesMap[e.id] = e;
      });

      const paymentsMap: Record<string, Payment> = {};
      payments.forEach(p => {
        if (p && p.id) paymentsMap[p.id] = p;
      });

      // 2. Upload supplier root bundle to Firebase Realtime Database
      const supplierData = {
        profile: {
          ...supplier,
          lastSyncedAt: Date.now()
        },
        customers: customersMap,
        milkEntries: milkEntriesMap,
        payments: paymentsMap
      };

      const supplierRef = ref(rtdb, `suppliers/${supplierId}`);
      await withTimeout(
        set(supplierRef, supplierData),
        15000,
        'Upload timed out connecting to Firebase Cloud.'
      );

      return {
        success: true,
        message: `Successfully backed up to Firebase Cloud! (${customers.length} customers, ${milkEntries.length} entries, ${payments.length} payments)`
      };
    } catch (error: any) {
      console.warn('Upload to cloud error:', error);
      return {
        success: false,
        message: formatFirebaseError(error)
      };
    }
  },

  // Download records from Cloud to Device
  async downloadFromCloud(supplierId: string): Promise<{
    success: boolean;
    message: string;
    counts?: { customers: number; entries: number; payments: number };
  }> {
    try {
      const supplierRef = ref(rtdb, `suppliers/${supplierId}`);
      const snapshot = await withTimeout(
        get(supplierRef),
        15000,
        'Timed out downloading data from Firebase Cloud.'
      );

      if (!snapshot.exists()) {
        return {
          success: false,
          message: 'No cloud backup found for this dairy profile.'
        };
      }

      const cloudData = snapshot.val();
      const cloudCustomersObj = cloudData.customers || {};
      const cloudEntriesObj = cloudData.milkEntries || {};
      const cloudPaymentsObj = cloudData.payments || {};

      const cloudCustomers: Customer[] = Object.values(cloudCustomersObj);
      const cloudEntries: MilkEntry[] = Object.values(cloudEntriesObj);
      const cloudPayments: Payment[] = Object.values(cloudPaymentsObj);

      if (cloudCustomers.length > 0) {
        await StorageService.saveCustomersBatch(cloudCustomers);
      }
      if (cloudEntries.length > 0) {
        await StorageService.saveMilkEntriesBatch(cloudEntries);
      }
      if (cloudPayments.length > 0) {
        await StorageService.savePaymentsBatch(cloudPayments);
      }

      return {
        success: true,
        message: `Downloaded from Firebase Cloud! (${cloudCustomers.length} customers, ${cloudEntries.length} entries, ${cloudPayments.length} payments)`,
        counts: {
          customers: cloudCustomers.length,
          entries: cloudEntries.length,
          payments: cloudPayments.length
        }
      };
    } catch (error: any) {
      console.warn('Download from cloud error:', error);
      return {
        success: false,
        message: formatFirebaseError(error)
      };
    }
  }
};
