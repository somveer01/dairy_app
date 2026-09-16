import { ref, set, get, update } from 'firebase/database';
import { rtdb } from '../config/firebase';
import { Customer, MilkEntry, Payment, Supplier, SubSupplier, MilkInwardEntry, SubSupplierPayment } from '../types';
import { StorageService } from './storageService';
import { CardSyncService } from './cardSyncService';

// Helper to prevent infinite spinner with a timeout
const withTimeout = <T>(promise: Promise<T>, timeoutMs = 15000, errorMsg = 'Firebase request timed out'): Promise<T> => {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(errorMsg)), timeoutMs))
  ]);
};

export const normalizePhoneDigits = (raw?: string | null): string => {
  if (!raw) return '';
  const digits = raw.replace(/\D/g, '');
  if (digits.length >= 12 && digits.startsWith('91')) return digits.slice(2, 12);
  if (digits.length === 11 && digits.startsWith('0')) return digits.slice(1, 11);
  if (digits.length > 10) return digits.slice(-10);
  return digits;
};

function formatFirebaseError(error: any): string {
  const msg = error?.message || String(error);
  if (msg.includes('PERMISSION_DENIED') || msg.includes('permission_denied')) {
    return 'Firebase permission denied. Realtime Database rules need read/write access.';
  }
  if (msg.includes('timed out') || msg.includes('TIMEOUT')) {
    return 'Connection timed out (15s). Please check your internet connection.';
  }
  if (msg.includes('network') || msg.includes('NETWORK')) {
    return 'Network connection issue. Please check your mobile data or Wi-Fi.';
  }
  return msg || 'An unknown error occurred during cloud sync.';
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

  // Check if a supplier profile already exists in Firebase by 10-digit phone
  async checkSupplierExists(phone: string): Promise<{
    exists: boolean;
    supplierId?: string;
    profile?: Supplier;
    dataCounts?: {
      customers: number;
      entries: number;
      payments: number;
      subSuppliers?: number;
      milkInwardEntries?: number;
      subSupplierPayments?: number;
    };
    cloudData?: any;
  }> {
    const cleanPhone = normalizePhoneDigits(phone);
    if (!cleanPhone || cleanPhone.length !== 10) {
      return { exists: false };
    }

    try {
      // 1. Direct lookup by standard key: suppliers/supp_<10digits>
      const standardId = `supp_${cleanPhone}`;
      const directRef = ref(rtdb, `suppliers/${standardId}`);
      const directSnap = await withTimeout(get(directRef), 12000, 'Cloud lookup timed out');

      if (directSnap.exists()) {
        const data = directSnap.val();
        const profile = data.profile || { id: standardId, phone: cleanPhone, name: 'Dairy Supplier', businessName: 'My Dairy', createdAt: Date.now() };
        const custCount = data.customers ? Object.keys(data.customers).length : 0;
        const entryCount = data.milkEntries ? Object.keys(data.milkEntries).length : 0;
        const payCount = data.payments ? Object.keys(data.payments).length : 0;
        const subSuppCount = data.subSuppliers ? Object.keys(data.subSuppliers).length : 0;
        const inwardCount = data.milkInwardEntries ? Object.keys(data.milkInwardEntries).length : 0;
        const subPayCount = data.subSupplierPayments ? Object.keys(data.subSupplierPayments).length : 0;

        return {
          exists: true,
          supplierId: standardId,
          profile,
          dataCounts: {
            customers: custCount,
            entries: entryCount,
            payments: payCount,
            subSuppliers: subSuppCount,
            milkInwardEntries: inwardCount,
            subSupplierPayments: subPayCount
          },
          cloudData: data
        };
      }

      // 2. Scan suppliers root to see if an existing profile has this phone number under a legacy ID
      const allRef = ref(rtdb, 'suppliers');
      const allSnap = await withTimeout(get(allRef), 12000, 'Cloud lookup timed out');
      if (allSnap.exists()) {
        const allSuppliers = allSnap.val();
        for (const sId of Object.keys(allSuppliers)) {
          const sData = allSuppliers[sId];
          const sPhone = normalizePhoneDigits(sData?.profile?.phone);
          if (sPhone === cleanPhone) {
            const profile = sData.profile || { id: sId, phone: cleanPhone, name: 'Dairy Supplier', businessName: 'My Dairy', createdAt: Date.now() };
            const custCount = sData.customers ? Object.keys(sData.customers).length : 0;
            const entryCount = sData.milkEntries ? Object.keys(sData.milkEntries).length : 0;
            const payCount = sData.payments ? Object.keys(sData.payments).length : 0;
            const subSuppCount = sData.subSuppliers ? Object.keys(sData.subSuppliers).length : 0;
            const inwardCount = sData.milkInwardEntries ? Object.keys(sData.milkInwardEntries).length : 0;
            const subPayCount = sData.subSupplierPayments ? Object.keys(sData.subSupplierPayments).length : 0;

            return {
              exists: true,
              supplierId: sId,
              profile,
              dataCounts: {
                customers: custCount,
                entries: entryCount,
                payments: payCount,
                subSuppliers: subSuppCount,
                milkInwardEntries: inwardCount,
                subSupplierPayments: subPayCount
              },
              cloudData: sData
            };
          }
        }
      }

      return { exists: false };
    } catch (err) {
      console.warn('Check supplier existence in Firebase failed:', err);
      return { exists: false };
    }
  },

  // Two-Way Union Merge: Synchronizes local records and cloud records without overwriting or data loss
  async twoWaySync(supplier: Supplier): Promise<{
    success: boolean;
    message: string;
    counts?: {
      customers: number;
      entries: number;
      payments: number;
      subSuppliers: number;
      milkInwardEntries: number;
      subSupplierPayments: number;
    };
  }> {
    try {
      if (!supplier || !supplier.id) {
        throw new Error('No supplier profile provided for sync.');
      }

      const supplierId = supplier.id;
      const supplierRef = ref(rtdb, `suppliers/${supplierId}`);

      // 1. Fetch Cloud Data
      const cloudSnap = await withTimeout(get(supplierRef), 15000, 'Cloud read timed out');
      const cloudData = cloudSnap.exists() ? cloudSnap.val() : {};

      const cloudCustMap: Record<string, Customer> = cloudData.customers || {};
      const cloudEntryMap: Record<string, MilkEntry> = cloudData.milkEntries || {};
      const cloudPayMap: Record<string, Payment> = cloudData.payments || {};
      const cloudSubSuppMap: Record<string, SubSupplier> = cloudData.subSuppliers || {};
      const cloudInwardMap: Record<string, MilkInwardEntry> = cloudData.milkInwardEntries || {};
      const cloudSubPayMap: Record<string, SubSupplierPayment> = cloudData.subSupplierPayments || {};

      // 2. Fetch Local Data
      const [
        localCusts,
        localEntries,
        localPays,
        localSubSupps,
        localInward,
        localSubPays
      ] = await Promise.all([
        StorageService.getRawCustomers(supplierId),
        StorageService.getRawMilkEntries(supplierId),
        StorageService.getRawPayments(supplierId),
        StorageService.getRawSubSuppliers(supplierId),
        StorageService.getRawMilkInwardEntries(supplierId),
        StorageService.getRawSubSupplierPayments(supplierId)
      ]);

      // 3. Merge Customers (Union by ID, newer updatedAt wins, propagate isDeleted)
      const mergedCustMap: Record<string, Customer> = { ...cloudCustMap };
      localCusts.forEach(lc => {
        const cc = mergedCustMap[lc.id];
        if (!cc) {
          mergedCustMap[lc.id] = lc;
        } else {
          const localTime = lc.updatedAt || lc.createdAt || 0;
          const cloudTime = cc.updatedAt || cc.createdAt || 0;
          mergedCustMap[lc.id] = localTime >= cloudTime ? lc : cc;
        }
      });

      // 4. Merge Milk Entries (Union by ID, newer updatedAt wins, propagate isDeleted)
      const mergedEntryMap: Record<string, MilkEntry> = { ...cloudEntryMap };
      localEntries.forEach(le => {
        const ce = mergedEntryMap[le.id];
        if (!ce) {
          mergedEntryMap[le.id] = le;
        } else {
          const localTime = le.updatedAt || le.createdAt || 0;
          const cloudTime = ce.updatedAt || ce.createdAt || 0;
          mergedEntryMap[le.id] = localTime >= cloudTime ? le : ce;
        }
      });

      // 5. Merge Payments (Union by ID, newer updatedAt wins, propagate isDeleted)
      const mergedPayMap: Record<string, Payment> = { ...cloudPayMap };
      localPays.forEach(lp => {
        const cp = mergedPayMap[lp.id];
        if (!cp) {
          mergedPayMap[lp.id] = lp;
        } else {
          const localTime = lp.updatedAt || lp.createdAt || 0;
          const cloudTime = cp.updatedAt || cp.createdAt || 0;
          mergedPayMap[lp.id] = localTime >= cloudTime ? lp : cp;
        }
      });

      // 6. Merge Sub-Suppliers (Vendors/Farmers)
      const mergedSubSuppMap: Record<string, SubSupplier> = { ...cloudSubSuppMap };
      localSubSupps.forEach(ls => {
        const cs = mergedSubSuppMap[ls.id];
        if (!cs) {
          mergedSubSuppMap[ls.id] = ls;
        } else {
          const localTime = ls.updatedAt || ls.createdAt || 0;
          const cloudTime = cs.updatedAt || cs.createdAt || 0;
          mergedSubSuppMap[ls.id] = localTime >= cloudTime ? ls : cs;
        }
      });

      // 7. Merge Milk Inward Entries (Procurement from Sub-Suppliers)
      const mergedInwardMap: Record<string, MilkInwardEntry> = { ...cloudInwardMap };
      localInward.forEach(li => {
        const ci = mergedInwardMap[li.id];
        if (!ci) {
          mergedInwardMap[li.id] = li;
        } else {
          const localTime = li.updatedAt || li.createdAt || 0;
          const cloudTime = ci.updatedAt || ci.createdAt || 0;
          mergedInwardMap[li.id] = localTime >= cloudTime ? li : ci;
        }
      });

      // 8. Merge Sub-Supplier Payments (Outward Payments to Vendors)
      const mergedSubPayMap: Record<string, SubSupplierPayment> = { ...cloudSubPayMap };
      localSubPays.forEach(lsp => {
        const csp = mergedSubPayMap[lsp.id];
        if (!csp) {
          mergedSubPayMap[lsp.id] = lsp;
        } else {
          const localTime = lsp.updatedAt || lsp.createdAt || 0;
          const cloudTime = csp.updatedAt || csp.createdAt || 0;
          mergedSubPayMap[lsp.id] = localTime >= cloudTime ? lsp : csp;
        }
      });

      // 9. Save Merged Data Locally (both customers and sub-suppliers)
      const mergedCustList = Object.values(mergedCustMap);
      const mergedEntryList = Object.values(mergedEntryMap);
      const mergedPayList = Object.values(mergedPayMap);
      const mergedSubSuppList = Object.values(mergedSubSuppMap);
      const mergedInwardList = Object.values(mergedInwardMap);
      const mergedSubPayList = Object.values(mergedSubPayMap);

      await StorageService.setAllDataForSupplier(
        supplierId,
        mergedCustList,
        mergedEntryList,
        mergedPayList,
        mergedSubSuppList,
        mergedInwardList,
        mergedSubPayList
      );

      // 10. Push Complete Merged Bundle to Firebase Cloud
      const uploadBundle = {
        profile: {
          ...supplier,
          lastSyncedAt: Date.now()
        },
        customers: mergedCustMap,
        milkEntries: mergedEntryMap,
        payments: mergedPayMap,
        subSuppliers: mergedSubSuppMap,
        milkInwardEntries: mergedInwardMap,
        subSupplierPayments: mergedSubPayMap
      };

      await withTimeout(set(supplierRef, uploadBundle), 15000, 'Cloud write timed out');
      
      // Asynchronously update all digital milk cards in RTDB (cards/${supplierId})
      CardSyncService.syncAllCards(supplier, mergedCustList, mergedEntryList, mergedPayList).catch(err => {
        console.warn('Post-sync card update notice:', err);
      });

      const activeCusts = mergedCustList.filter(c => !c.isDeleted).length;
      const activeEntries = mergedEntryList.filter(e => !e.isDeleted).length;
      const activePays = mergedPayList.filter(p => !p.isDeleted).length;
      const activeSubSupps = mergedSubSuppList.filter(s => !s.isDeleted).length;
      const activeInward = mergedInwardList.filter(i => !i.isDeleted).length;
      const activeSubPays = mergedSubPayList.filter(sp => !sp.isDeleted).length;

      return {
        success: true,
        message: `Synced successfully! (${activeCusts} customers, ${activeEntries} entries, ${activePays} payments, ${activeSubSupps} vendors, ${activeInward} inwards, ${activeSubPays} vendor payments)`,
        counts: {
          customers: activeCusts,
          entries: activeEntries,
          payments: activePays,
          subSuppliers: activeSubSupps,
          milkInwardEntries: activeInward,
          subSupplierPayments: activeSubPays
        }
      };
    } catch (error: any) {
      console.warn('Two-way sync error:', error);
      return {
        success: false,
        message: formatFirebaseError(error)
      };
    }
  },

  // Upload all local data to Firebase Cloud Realtime Database (using Two-Way Merge for safety)
  async uploadAllToCloud(supplier: Supplier): Promise<{ success: boolean; message: string }> {
    return this.twoWaySync(supplier);
  },

  // Download records strictly for the authenticated supplier (NO random supplier fallback!)
  async downloadFromCloud(supplierId?: string): Promise<{
    success: boolean;
    message: string;
    counts?: {
      customers: number;
      entries: number;
      payments: number;
      subSuppliers: number;
      milkInwardEntries: number;
      subSupplierPayments: number;
    };
  }> {
    try {
      if (!supplierId) {
        return { success: false, message: 'No supplier ID provided to restore.' };
      }

      const supplierRef = ref(rtdb, `suppliers/${supplierId}`);
      const snapshot = await withTimeout(get(supplierRef), 15000, 'Timed out downloading data from Firebase.');

      if (!snapshot.exists()) {
        return {
          success: false,
          message: 'No cloud backup found for your account in Firebase. Please sync first.'
        };
      }

      const cloudData = snapshot.val();
      if (cloudData.profile) {
        await StorageService.saveSupplier(cloudData.profile);
      }

      const cloudCustMap = cloudData.customers || {};
      const cloudEntryMap = cloudData.milkEntries || {};
      const cloudPayMap = cloudData.payments || {};
      const cloudSubSuppMap = cloudData.subSuppliers || {};
      const cloudInwardMap = cloudData.milkInwardEntries || {};
      const cloudSubPayMap = cloudData.subSupplierPayments || {};

      const cloudCustomers: Customer[] = Array.isArray(cloudCustMap) ? cloudCustMap : Object.values(cloudCustMap);
      const cloudEntries: MilkEntry[] = Array.isArray(cloudEntryMap) ? cloudEntryMap : Object.values(cloudEntryMap);
      const cloudPayments: Payment[] = Array.isArray(cloudPayMap) ? cloudPayMap : Object.values(cloudPayMap);
      const cloudSubSuppliers: SubSupplier[] = Array.isArray(cloudSubSuppMap) ? cloudSubSuppMap : Object.values(cloudSubSuppMap);
      const cloudInwardEntries: MilkInwardEntry[] = Array.isArray(cloudInwardMap) ? cloudInwardMap : Object.values(cloudInwardMap);
      const cloudSubPayments: SubSupplierPayment[] = Array.isArray(cloudSubPayMap) ? cloudSubPayMap : Object.values(cloudSubPayMap);

      await StorageService.setAllDataForSupplier(
        supplierId,
        cloudCustomers,
        cloudEntries,
        cloudPayments,
        cloudSubSuppliers,
        cloudInwardEntries,
        cloudSubPayments
      );

      const activeCustCount = cloudCustomers.filter(c => !c.isDeleted).length;
      const activeEntryCount = cloudEntries.filter(e => !e.isDeleted).length;
      const activePayCount = cloudPayments.filter(p => !p.isDeleted).length;
      const activeSubSuppCount = cloudSubSuppliers.filter(s => !s.isDeleted).length;
      const activeInwardCount = cloudInwardEntries.filter(i => !i.isDeleted).length;
      const activeSubPayCount = cloudSubPayments.filter(p => !p.isDeleted).length;

      return {
        success: true,
        message: `Restored successfully from Firebase Cloud!\n\n• ${activeCustCount} Customers\n• ${activeEntryCount} Milk Entries\n• ${activePayCount} Payments\n• ${activeSubSuppCount} Vendors / Farmers\n• ${activeInwardCount} Milk Inward Records\n• ${activeSubPayCount} Vendor Payments`,
        counts: {
          customers: activeCustCount,
          entries: activeEntryCount,
          payments: activePayCount,
          subSuppliers: activeSubSuppCount,
          milkInwardEntries: activeInwardCount,
          subSupplierPayments: activeSubPayCount
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
