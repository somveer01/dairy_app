import { doc, setDoc, getDoc, collection, getDocs, writeBatch } from 'firebase/firestore';
import { db } from '../config/firebase';
import { Customer, MilkEntry, Payment, Supplier } from '../types';
import { StorageService } from './storageService';

// Helper to prevent infinite spinner with a timeout
const withTimeout = <T>(promise: Promise<T>, timeoutMs = 12000, errorMsg = 'Firebase request timed out'): Promise<T> => {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(errorMsg)), timeoutMs))
  ]);
};

function formatFirebaseError(error: any): string {
  const msg = error?.message || String(error);
  if (msg.includes('Cloud Firestore API has not been used') || msg.includes('disabled') || msg.includes('firestore.googleapis.com')) {
    return 'Cloud Firestore is not activated in your Firebase project (diaryapp-28278).\n\nTo activate it:\n1. Open https://console.firebase.google.com\n2. Select your project "diaryapp-28278"\n3. Click "Firestore Database" in the left menu\n4. Click "Create database" (choose Test Mode)';
  }
  if (msg.includes('PERMISSION_DENIED') || msg.includes('permission-denied') || msg.includes('Missing or insufficient permissions')) {
    return 'Firebase permission denied. In Firebase Console > Firestore Database > Rules, ensure read/write rules are set to: allow read, write: if true; (Test Mode)';
  }
  if (msg.includes('timed out') || msg.includes('TIMEOUT')) {
    return 'Connection timed out (12s). Please check your internet connection or verify Firestore Database is created in Firebase Console.';
  }
  if (msg.includes('unavailable') || msg.includes('network')) {
    return 'Firebase Cloud service is currently unreachable. Check your internet connection.';
  }
  return msg || 'An unknown error occurred during sync.';
}

export const FirebaseSyncService = {
  // Test Firebase Firestore connection
  async testConnection(): Promise<{ success: boolean; message: string }> {
    try {
      const testDocRef = doc(db, 'system', 'ping');
      await withTimeout(
        setDoc(testDocRef, {
          lastPing: Date.now(),
          client: 'Dairy Mobile App'
        }, { merge: true }),
        8000,
        'Firebase Ping timed out after 8 seconds.'
      );
      return { success: true, message: 'Connected to Firebase Cloud Firestore successfully!' };
    } catch (error: any) {
      console.warn('Firebase connection test error:', error);
      return {
        success: false,
        message: formatFirebaseError(error)
      };
    }
  },

  // Upload all local data to Firebase Cloud Firestore
  async uploadAllToCloud(supplier: Supplier): Promise<{ success: boolean; message: string }> {
    try {
      if (!supplier || !supplier.id) {
        throw new Error('No supplier profile found to sync.');
      }

      const supplierId = supplier.id;

      // 1. Sync supplier profile with timeout
      await withTimeout(
        setDoc(doc(db, 'suppliers', supplierId), {
          ...supplier,
          lastSyncedAt: Date.now()
        }, { merge: true }),
        10000,
        'Sync timed out connecting to Firebase Cloud.'
      );

      // 2. Sync customers in batch
      const customers = await StorageService.getCustomers();
      if (customers.length > 0) {
        const batchSize = 400;
        for (let i = 0; i < customers.length; i += batchSize) {
          const chunk = customers.slice(i, i + batchSize);
          const batch = writeBatch(db);
          chunk.forEach(c => {
            const ref = doc(db, 'suppliers', supplierId, 'customers', c.id);
            batch.set(ref, c, { merge: true });
          });
          await withTimeout(batch.commit(), 10000, 'Batch commit timed out for customers.');
        }
      }

      // 3. Sync milk entries in batch
      const milkEntries = await StorageService.getMilkEntries();
      if (milkEntries.length > 0) {
        const batchSize = 400;
        for (let i = 0; i < milkEntries.length; i += batchSize) {
          const chunk = milkEntries.slice(i, i + batchSize);
          const batch = writeBatch(db);
          chunk.forEach(e => {
            const ref = doc(db, 'suppliers', supplierId, 'milkEntries', e.id);
            batch.set(ref, e, { merge: true });
          });
          await withTimeout(batch.commit(), 10000, 'Batch commit timed out for milk entries.');
        }
      }

      // 4. Sync payments in batch
      const payments = await StorageService.getPayments();
      if (payments.length > 0) {
        const batchSize = 400;
        for (let i = 0; i < payments.length; i += batchSize) {
          const chunk = payments.slice(i, i + batchSize);
          const batch = writeBatch(db);
          chunk.forEach(p => {
            const ref = doc(db, 'suppliers', supplierId, 'payments', p.id);
            batch.set(ref, p, { merge: true });
          });
          await withTimeout(batch.commit(), 10000, 'Batch commit timed out for payments.');
        }
      }

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
      // 1. Download customers
      const custSnapshot = await withTimeout(
        getDocs(collection(db, 'suppliers', supplierId, 'customers')),
        10000,
        'Timed out reading customers from cloud.'
      );
      const cloudCustomers: Customer[] = [];
      custSnapshot.forEach(d => cloudCustomers.push(d.data() as Customer));

      if (cloudCustomers.length > 0) {
        await StorageService.saveCustomersBatch(cloudCustomers);
      }

      // 2. Download entries
      const entriesSnapshot = await withTimeout(
        getDocs(collection(db, 'suppliers', supplierId, 'milkEntries')),
        10000,
        'Timed out reading milk entries from cloud.'
      );
      const cloudEntries: MilkEntry[] = [];
      entriesSnapshot.forEach(d => cloudEntries.push(d.data() as MilkEntry));

      if (cloudEntries.length > 0) {
        await StorageService.saveMilkEntriesBatch(cloudEntries);
      }

      // 3. Download payments
      const paymentsSnapshot = await withTimeout(
        getDocs(collection(db, 'suppliers', supplierId, 'payments')),
        10000,
        'Timed out reading payments from cloud.'
      );
      const cloudPayments: Payment[] = [];
      paymentsSnapshot.forEach(d => cloudPayments.push(d.data() as Payment));

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
