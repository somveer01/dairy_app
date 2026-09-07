import { doc, setDoc, getDoc, collection, getDocs, writeBatch } from 'firebase/firestore';
import { db } from '../config/firebase';
import { Customer, MilkEntry, Payment, Supplier } from '../types';
import { StorageService } from './storageService';

export const FirebaseSyncService = {
  // Test Firebase Firestore connection
  async testConnection(): Promise<{ success: boolean; message: string }> {
    try {
      const testDocRef = doc(db, 'system', 'ping');
      await setDoc(testDocRef, {
        lastPing: Date.now(),
        client: 'Dairy Mobile App'
      }, { merge: true });
      return { success: true, message: 'Connected to Firebase Cloud Firestore successfully!' };
    } catch (error: any) {
      console.warn('Firebase connection test error:', error);
      return {
        success: false,
        message: error?.message || 'Failed to connect. Please make sure Firestore is enabled in Firebase Console.'
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

      // 1. Sync supplier profile
      await setDoc(doc(db, 'suppliers', supplierId), {
        ...supplier,
        lastSyncedAt: Date.now()
      }, { merge: true });

      // 2. Sync customers in batch
      const customers = await StorageService.getCustomers();
      if (customers.length > 0) {
        // Firestore batch allows up to 500 writes
        const batchSize = 400;
        for (let i = 0; i < customers.length; i += batchSize) {
          const chunk = customers.slice(i, i + batchSize);
          const batch = writeBatch(db);
          chunk.forEach(c => {
            const ref = doc(db, 'suppliers', supplierId, 'customers', c.id);
            batch.set(ref, c, { merge: true });
          });
          await batch.commit();
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
          await batch.commit();
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
          await batch.commit();
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
        message: error?.message || 'Upload failed. Ensure Firestore Database is created in your Firebase Console.'
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
      const custSnapshot = await getDocs(collection(db, 'suppliers', supplierId, 'customers'));
      const cloudCustomers: Customer[] = [];
      custSnapshot.forEach(d => cloudCustomers.push(d.data() as Customer));

      if (cloudCustomers.length > 0) {
        await StorageService.saveCustomersBatch(cloudCustomers);
      }

      // 2. Download entries
      const entriesSnapshot = await getDocs(collection(db, 'suppliers', supplierId, 'milkEntries'));
      const cloudEntries: MilkEntry[] = [];
      entriesSnapshot.forEach(d => cloudEntries.push(d.data() as MilkEntry));

      if (cloudEntries.length > 0) {
        await StorageService.saveMilkEntriesBatch(cloudEntries);
      }

      // 3. Download payments
      const paymentsSnapshot = await getDocs(collection(db, 'suppliers', supplierId, 'payments'));
      const cloudPayments: Payment[] = [];
      paymentsSnapshot.forEach(d => cloudPayments.push(d.data() as Payment));

      if (cloudPayments.length > 0) {
        await StorageService.savePaymentsBatch(cloudPayments);
      }

      return {
        success: true,
        message: `Downloaded from Firebase Cloud! (${cloudCustomers.length} customers, ${cloudEntries.length} entries)`,
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
        message: error?.message || 'Download failed.'
      };
    }
  }
};
