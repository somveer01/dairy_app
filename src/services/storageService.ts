import AsyncStorage from '@react-native-async-storage/async-storage';
import { Customer, MilkEntry, Payment, Supplier, SubSupplier, MilkInwardEntry, SubSupplierPayment } from '../types';
import { AutoSyncService } from './autoSyncService';

const STORAGE_KEYS = {
  SUPPLIER: '@dairy_supplier',
  CUSTOMERS: '@dairy_customers',
  MILK_ENTRIES: '@dairy_milk_entries',
  PAYMENTS: '@dairy_payments',
  LANGUAGE: '@dairy_lang',
  SUB_SUPPLIERS: '@dairy_sub_suppliers',
  MILK_INWARD_ENTRIES: '@dairy_milk_inward_entries',
  SUB_SUPPLIER_PAYMENTS: '@dairy_sub_supplier_payments'
};

let currentSupplierId: string | null = null;

const getScopedKey = (base: string, supplierId?: string): string => {
  const sId = supplierId || currentSupplierId;
  return sId ? `${base}_${sId}` : base;
};

export const StorageService = {
  setActiveSupplierId(id: string | null) {
    currentSupplierId = id;
  },

  getActiveSupplierId(): string | null {
    return currentSupplierId;
  },

  // Supplier Profile
  async getSupplier(): Promise<Supplier | null> {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const local = window.localStorage.getItem(STORAGE_KEYS.SUPPLIER);
        if (local) {
          const parsed = JSON.parse(local);
          if (parsed && parsed.id) {
            currentSupplierId = parsed.id;
            return parsed;
          }
        }
      }
    } catch {
      // ignore
    }

    const data = await AsyncStorage.getItem(STORAGE_KEYS.SUPPLIER);
    if (!data) return null;

    try {
      const parsed: Supplier = JSON.parse(data);
      if (parsed && parsed.id) {
        currentSupplierId = parsed.id;
        return parsed;
      }
      return null;
    } catch {
      return null;
    }
  },

  async saveSupplier(supplier: Supplier): Promise<void> {
    currentSupplierId = supplier.id;
    AutoSyncService.setActiveSupplier(supplier);
    const jsonStr = JSON.stringify(supplier);
    await AsyncStorage.setItem(STORAGE_KEYS.SUPPLIER, jsonStr);
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        window.localStorage.setItem(STORAGE_KEYS.SUPPLIER, jsonStr);
      } catch {
        // ignore
      }
    }
  },

  async clearActiveSession(): Promise<void> {
    currentSupplierId = null;
    AutoSyncService.setActiveSupplier(null);
    await AsyncStorage.removeItem(STORAGE_KEYS.SUPPLIER);
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        window.localStorage.removeItem(STORAGE_KEYS.SUPPLIER);
      } catch {
        // ignore
      }
    }
  },

  // Migration: Migrate any existing un-scoped legacy device records to the newly authenticated supplier
  async migrateLegacyDataToSupplier(supplier: Supplier): Promise<{ migratedCount: number }> {
    if (!supplier || !supplier.id) return { migratedCount: 0 };
    const targetSupplierId = supplier.id;
    currentSupplierId = targetSupplierId;
    AutoSyncService.setActiveSupplier(supplier);

    let totalMigrated = 0;

    try {
      // 1. Check legacy customers
      const legacyCustData = await AsyncStorage.getItem(STORAGE_KEYS.CUSTOMERS);
      if (legacyCustData) {
        const parsedCusts: Customer[] = JSON.parse(legacyCustData);
        if (Array.isArray(parsedCusts) && parsedCusts.length > 0) {
          const scopedKey = getScopedKey(STORAGE_KEYS.CUSTOMERS, targetSupplierId);
          const existingScoped = await AsyncStorage.getItem(scopedKey);
          let targetList: Customer[] = existingScoped ? JSON.parse(existingScoped) : [];

          parsedCusts.forEach(c => {
            if (!targetList.some(tc => tc.id === c.id)) {
              targetList.push({
                ...c,
                supplierId: targetSupplierId,
                updatedAt: c.updatedAt || Date.now()
              });
              totalMigrated++;
            }
          });

          await AsyncStorage.setItem(scopedKey, JSON.stringify(targetList));
        }
      }

      // 2. Check legacy milk entries
      const legacyEntryData = await AsyncStorage.getItem(STORAGE_KEYS.MILK_ENTRIES);
      if (legacyEntryData) {
        const parsedEntries: MilkEntry[] = JSON.parse(legacyEntryData);
        if (Array.isArray(parsedEntries) && parsedEntries.length > 0) {
          const scopedKey = getScopedKey(STORAGE_KEYS.MILK_ENTRIES, targetSupplierId);
          const existingScoped = await AsyncStorage.getItem(scopedKey);
          let targetList: MilkEntry[] = existingScoped ? JSON.parse(existingScoped) : [];

          parsedEntries.forEach(e => {
            if (!targetList.some(te => te.id === e.id)) {
              targetList.push({
                ...e,
                supplierId: targetSupplierId,
                updatedAt: e.updatedAt || Date.now()
              });
              totalMigrated++;
            }
          });

          await AsyncStorage.setItem(scopedKey, JSON.stringify(targetList));
        }
      }

      // 3. Check legacy payments
      const legacyPayData = await AsyncStorage.getItem(STORAGE_KEYS.PAYMENTS);
      if (legacyPayData) {
        const parsedPays: Payment[] = JSON.parse(legacyPayData);
        if (Array.isArray(parsedPays) && parsedPays.length > 0) {
          const scopedKey = getScopedKey(STORAGE_KEYS.PAYMENTS, targetSupplierId);
          const existingScoped = await AsyncStorage.getItem(scopedKey);
          let targetList: Payment[] = existingScoped ? JSON.parse(existingScoped) : [];

          parsedPays.forEach(p => {
            if (!targetList.some(tp => tp.id === p.id)) {
              targetList.push({
                ...p,
                supplierId: targetSupplierId,
                updatedAt: p.updatedAt || Date.now()
              });
              totalMigrated++;
            }
          });

          await AsyncStorage.setItem(scopedKey, JSON.stringify(targetList));
        }
      }

      // 4. Check legacy sub-suppliers (vendors/farmers)
      const legacySubData = await AsyncStorage.getItem(STORAGE_KEYS.SUB_SUPPLIERS);
      if (legacySubData) {
        const parsedSubs: SubSupplier[] = JSON.parse(legacySubData);
        if (Array.isArray(parsedSubs) && parsedSubs.length > 0) {
          const scopedKey = getScopedKey(STORAGE_KEYS.SUB_SUPPLIERS, targetSupplierId);
          const existingScoped = await AsyncStorage.getItem(scopedKey);
          let targetList: SubSupplier[] = existingScoped ? JSON.parse(existingScoped) : [];

          parsedSubs.forEach(s => {
            if (!targetList.some(ts => ts.id === s.id)) {
              targetList.push({
                ...s,
                supplierId: targetSupplierId,
                updatedAt: s.updatedAt || Date.now()
              });
              totalMigrated++;
            }
          });

          await AsyncStorage.setItem(scopedKey, JSON.stringify(targetList));
        }
      }

      // 5. Check legacy milk inward entries
      const legacyInwardData = await AsyncStorage.getItem(STORAGE_KEYS.MILK_INWARD_ENTRIES);
      if (legacyInwardData) {
        const parsedInward: MilkInwardEntry[] = JSON.parse(legacyInwardData);
        if (Array.isArray(parsedInward) && parsedInward.length > 0) {
          const scopedKey = getScopedKey(STORAGE_KEYS.MILK_INWARD_ENTRIES, targetSupplierId);
          const existingScoped = await AsyncStorage.getItem(scopedKey);
          let targetList: MilkInwardEntry[] = existingScoped ? JSON.parse(existingScoped) : [];

          parsedInward.forEach(i => {
            if (!targetList.some(ti => ti.id === i.id)) {
              targetList.push({
                ...i,
                supplierId: targetSupplierId,
                updatedAt: i.updatedAt || Date.now()
              });
              totalMigrated++;
            }
          });

          await AsyncStorage.setItem(scopedKey, JSON.stringify(targetList));
        }
      }

      // 6. Check legacy sub-supplier payments
      const legacySubPayData = await AsyncStorage.getItem(STORAGE_KEYS.SUB_SUPPLIER_PAYMENTS);
      if (legacySubPayData) {
        const parsedSubPays: SubSupplierPayment[] = JSON.parse(legacySubPayData);
        if (Array.isArray(parsedSubPays) && parsedSubPays.length > 0) {
          const scopedKey = getScopedKey(STORAGE_KEYS.SUB_SUPPLIER_PAYMENTS, targetSupplierId);
          const existingScoped = await AsyncStorage.getItem(scopedKey);
          let targetList: SubSupplierPayment[] = existingScoped ? JSON.parse(existingScoped) : [];

          parsedSubPays.forEach(sp => {
            if (!targetList.some(tsp => tsp.id === sp.id)) {
              targetList.push({
                ...sp,
                supplierId: targetSupplierId,
                updatedAt: sp.updatedAt || Date.now()
              });
              totalMigrated++;
            }
          });

          await AsyncStorage.setItem(scopedKey, JSON.stringify(targetList));
        }
      }
    } catch (e) {
      console.warn('Legacy data migration notice:', e);
    }

    return { migratedCount: totalMigrated };
  },

  // Set all data directly (used by cloud restore & two-way sync)
  async setAllDataForSupplier(
    supplierId: string,
    customers: Customer[],
    entries: MilkEntry[],
    payments: Payment[],
    subSuppliers?: SubSupplier[],
    inwardEntries?: MilkInwardEntry[],
    subPayments?: SubSupplierPayment[]
  ): Promise<void> {
    currentSupplierId = supplierId;
    const custKey = getScopedKey(STORAGE_KEYS.CUSTOMERS, supplierId);
    const entryKey = getScopedKey(STORAGE_KEYS.MILK_ENTRIES, supplierId);
    const payKey = getScopedKey(STORAGE_KEYS.PAYMENTS, supplierId);

    const promises: Promise<any>[] = [
      AsyncStorage.setItem(custKey, JSON.stringify(customers)),
      AsyncStorage.setItem(entryKey, JSON.stringify(entries)),
      AsyncStorage.setItem(payKey, JSON.stringify(payments))
    ];

    if (subSuppliers !== undefined) {
      const subKey = getScopedKey(STORAGE_KEYS.SUB_SUPPLIERS, supplierId);
      promises.push(AsyncStorage.setItem(subKey, JSON.stringify(subSuppliers)));
    }
    if (inwardEntries !== undefined) {
      const inKey = getScopedKey(STORAGE_KEYS.MILK_INWARD_ENTRIES, supplierId);
      promises.push(AsyncStorage.setItem(inKey, JSON.stringify(inwardEntries)));
    }
    if (subPayments !== undefined) {
      const subPayKey = getScopedKey(STORAGE_KEYS.SUB_SUPPLIER_PAYMENTS, supplierId);
      promises.push(AsyncStorage.setItem(subPayKey, JSON.stringify(subPayments)));
    }

    await Promise.all(promises);
  },

  // Raw data access for sync engine (includes tombstones where isDeleted is true)
  async getRawCustomers(supplierId?: string): Promise<Customer[]> {
    const key = getScopedKey(STORAGE_KEYS.CUSTOMERS, supplierId);
    const data = await AsyncStorage.getItem(key);
    if (!data) {
      // Check legacy key if scoped has not been created yet
      if (supplierId) {
        const legacy = await AsyncStorage.getItem(STORAGE_KEYS.CUSTOMERS);
        if (legacy) {
          const parsed = JSON.parse(legacy);
          if (Array.isArray(parsed) && parsed.length > 0) {
            await AsyncStorage.setItem(key, legacy);
            return parsed;
          }
        }
      }
      return [];
    }
    try {
      return JSON.parse(data);
    } catch {
      return [];
    }
  },

  async getRawMilkEntries(supplierId?: string): Promise<MilkEntry[]> {
    const key = getScopedKey(STORAGE_KEYS.MILK_ENTRIES, supplierId);
    const data = await AsyncStorage.getItem(key);
    if (!data) {
      if (supplierId) {
        const legacy = await AsyncStorage.getItem(STORAGE_KEYS.MILK_ENTRIES);
        if (legacy) {
          const parsed = JSON.parse(legacy);
          if (Array.isArray(parsed) && parsed.length > 0) {
            await AsyncStorage.setItem(key, legacy);
            return parsed;
          }
        }
      }
      return [];
    }
    try {
      return JSON.parse(data);
    } catch {
      return [];
    }
  },

  async getRawPayments(supplierId?: string): Promise<Payment[]> {
    const key = getScopedKey(STORAGE_KEYS.PAYMENTS, supplierId);
    const data = await AsyncStorage.getItem(key);
    if (!data) {
      if (supplierId) {
        const legacy = await AsyncStorage.getItem(STORAGE_KEYS.PAYMENTS);
        if (legacy) {
          const parsed = JSON.parse(legacy);
          if (Array.isArray(parsed) && parsed.length > 0) {
            await AsyncStorage.setItem(key, legacy);
            return parsed;
          }
        }
      }
      return [];
    }
    try {
      return JSON.parse(data);
    } catch {
      return [];
    }
  },

  // Public Customers API (Filters out isDeleted === true)
  async getCustomers(supplierId?: string): Promise<Customer[]> {
    const raw = await this.getRawCustomers(supplierId);
    return raw.filter(c => !c.isDeleted);
  },

  async saveCustomer(customer: Customer): Promise<void> {
    const key = getScopedKey(STORAGE_KEYS.CUSTOMERS, customer.supplierId);
    const raw = await this.getRawCustomers(customer.supplierId);
    const updatedCustomer: Customer = {
      ...customer,
      updatedAt: Date.now(),
      isDeleted: false
    };

    const existingIndex = raw.findIndex(c => c.id === customer.id);
    if (existingIndex >= 0) {
      raw[existingIndex] = updatedCustomer;
    } else {
      raw.push(updatedCustomer);
    }

    await AsyncStorage.setItem(key, JSON.stringify(raw));
    this.triggerAutoSync();
  },

  async saveCustomersBatch(newCustomers: Customer[]): Promise<void> {
    if (newCustomers.length === 0) return;
    const targetSupplierId = newCustomers[0].supplierId;
    const key = getScopedKey(STORAGE_KEYS.CUSTOMERS, targetSupplierId);
    const raw = await this.getRawCustomers(targetSupplierId);
    const map = new Map<string, Customer>();

    raw.forEach(c => map.set(c.id, c));
    newCustomers.forEach(c => {
      map.set(c.id, {
        ...c,
        updatedAt: Date.now(),
        isDeleted: false
      });
    });

    const merged = Array.from(map.values());
    await AsyncStorage.setItem(key, JSON.stringify(merged));
    this.triggerAutoSync();
  },

  async deleteCustomer(id: string, supplierId?: string): Promise<void> {
    const sId = supplierId || currentSupplierId || (await this.getSupplier())?.id;
    const key = getScopedKey(STORAGE_KEYS.CUSTOMERS, sId);
    const raw = await this.getRawCustomers(sId);
    const existing = raw.find(c => c.id === id);
    if (existing) {
      existing.isDeleted = true;
      existing.updatedAt = Date.now();
      await AsyncStorage.setItem(key, JSON.stringify(raw));
    }

    // Clean up legacy storage key as well
    const legacy = await AsyncStorage.getItem(STORAGE_KEYS.CUSTOMERS);
    if (legacy) {
      try {
        const legacyList: Customer[] = JSON.parse(legacy);
        const legacyCust = legacyList.find(c => c.id === id);
        if (legacyCust) {
          legacyCust.isDeleted = true;
          legacyCust.updatedAt = Date.now();
          await AsyncStorage.setItem(STORAGE_KEYS.CUSTOMERS, JSON.stringify(legacyList));
        }
      } catch {}
    }

    // Cascade delete related milk entries and payments for this customer
    await this.deleteCustomerRecords(id, sId);
    this.triggerAutoSync();
  },

  async deleteCustomerRecords(customerId: string, supplierId?: string): Promise<void> {
    const sId = supplierId || currentSupplierId || (await this.getSupplier())?.id;
    // Mark milk entries as deleted
    const entryKey = getScopedKey(STORAGE_KEYS.MILK_ENTRIES, sId);
    const rawEntries = await this.getRawMilkEntries(sId);
    let entriesModified = false;
    rawEntries.forEach(e => {
      if (e.customerId === customerId && !e.isDeleted) {
        e.isDeleted = true;
        e.updatedAt = Date.now();
        entriesModified = true;
      }
    });
    if (entriesModified) {
      await AsyncStorage.setItem(entryKey, JSON.stringify(rawEntries));
    }

    // Mark payments as deleted
    const payKey = getScopedKey(STORAGE_KEYS.PAYMENTS, sId);
    const rawPays = await this.getRawPayments(sId);
    let paysModified = false;
    rawPays.forEach(p => {
      if (p.customerId === customerId && !p.isDeleted) {
        p.isDeleted = true;
        p.updatedAt = Date.now();
        paysModified = true;
      }
    });
    if (paysModified) {
      await AsyncStorage.setItem(payKey, JSON.stringify(rawPays));
    }
  },

  async updateCustomerName(id: string, newName: string): Promise<void> {
    const trimmed = newName.trim();
    if (!trimmed) return;
    const sId = currentSupplierId || (await this.getSupplier())?.id;

    // 1. Update in Customers
    const key = getScopedKey(STORAGE_KEYS.CUSTOMERS, sId);
    const raw = await this.getRawCustomers(sId);
    const cust = raw.find(c => c.id === id);
    if (cust) {
      cust.name = trimmed;
      cust.updatedAt = Date.now();
      await AsyncStorage.setItem(key, JSON.stringify(raw));
    }

    // 2. Update in Milk Entries
    const entryKey = getScopedKey(STORAGE_KEYS.MILK_ENTRIES, sId);
    const rawEntries = await this.getRawMilkEntries(sId);
    let entriesChanged = false;
    rawEntries.forEach(e => {
      if (e.customerId === id && e.customerName !== trimmed) {
        e.customerName = trimmed;
        e.updatedAt = Date.now();
        entriesChanged = true;
      }
    });
    if (entriesChanged) {
      await AsyncStorage.setItem(entryKey, JSON.stringify(rawEntries));
    }

    // 3. Update in Payments
    const payKey = getScopedKey(STORAGE_KEYS.PAYMENTS, sId);
    const rawPays = await this.getRawPayments(sId);
    let paysChanged = false;
    rawPays.forEach(p => {
      if (p.customerId === id && p.customerName !== trimmed) {
        p.customerName = trimmed;
        p.updatedAt = Date.now();
        paysChanged = true;
      }
    });
    if (paysChanged) {
      await AsyncStorage.setItem(payKey, JSON.stringify(rawPays));
    }

    this.triggerAutoSync();
  },

  // Public Milk Entries API (Filters out isDeleted === true)
  async getMilkEntries(supplierId?: string): Promise<MilkEntry[]> {
    const raw = await this.getRawMilkEntries(supplierId);
    return raw.filter(e => !e.isDeleted);
  },

  async saveMilkEntry(entry: MilkEntry): Promise<void> {
    const key = getScopedKey(STORAGE_KEYS.MILK_ENTRIES, entry.supplierId);
    const raw = await this.getRawMilkEntries(entry.supplierId);
    const updatedEntry: MilkEntry = {
      ...entry,
      updatedAt: Date.now(),
      isDeleted: false
    };

    const idx = raw.findIndex(e => e.id === entry.id);
    if (idx >= 0) {
      raw[idx] = updatedEntry;
    } else {
      raw.push(updatedEntry);
    }

    await AsyncStorage.setItem(key, JSON.stringify(raw));
    this.triggerAutoSync();
  },

  async saveMilkEntriesBatch(newEntries: MilkEntry[]): Promise<void> {
    if (newEntries.length === 0) return;
    const targetSupplierId = newEntries[0].supplierId;
    const key = getScopedKey(STORAGE_KEYS.MILK_ENTRIES, targetSupplierId);
    const raw = await this.getRawMilkEntries(targetSupplierId);
    const map = new Map<string, MilkEntry>();

    raw.forEach(e => map.set(e.id, e));
    newEntries.forEach(e => {
      map.set(e.id, {
        ...e,
        updatedAt: Date.now(),
        isDeleted: false
      });
    });

    const merged = Array.from(map.values());
    await AsyncStorage.setItem(key, JSON.stringify(merged));
    this.triggerAutoSync();
  },

  async deleteMilkEntry(id: string, supplierId?: string): Promise<void> {
    const sId = supplierId || currentSupplierId || (await this.getSupplier())?.id;
    const key = getScopedKey(STORAGE_KEYS.MILK_ENTRIES, sId);
    const raw = await this.getRawMilkEntries(sId);
    const existing = raw.find(e => e.id === id);
    if (existing) {
      existing.isDeleted = true;
      existing.updatedAt = Date.now();
      await AsyncStorage.setItem(key, JSON.stringify(raw));
    }

    // Also mark in legacy key if present
    const legacy = await AsyncStorage.getItem(STORAGE_KEYS.MILK_ENTRIES);
    if (legacy) {
      try {
        const legacyList: MilkEntry[] = JSON.parse(legacy);
        const legEntry = legacyList.find(e => e.id === id);
        if (legEntry) {
          legEntry.isDeleted = true;
          legEntry.updatedAt = Date.now();
          await AsyncStorage.setItem(STORAGE_KEYS.MILK_ENTRIES, JSON.stringify(legacyList));
        }
      } catch {}
    }
    this.triggerAutoSync();
  },

  // Public Payments API (Filters out isDeleted === true)
  async getPayments(supplierId?: string): Promise<Payment[]> {
    const raw = await this.getRawPayments(supplierId);
    return raw.filter(p => !p.isDeleted);
  },

  async savePayment(payment: Payment): Promise<void> {
    const key = getScopedKey(STORAGE_KEYS.PAYMENTS, payment.supplierId);
    const raw = await this.getRawPayments(payment.supplierId);
    const updatedPayment: Payment = {
      ...payment,
      updatedAt: Date.now(),
      isDeleted: false
    };

    const idx = raw.findIndex(p => p.id === payment.id);
    if (idx >= 0) {
      raw[idx] = updatedPayment;
    } else {
      raw.push(updatedPayment);
    }

    await AsyncStorage.setItem(key, JSON.stringify(raw));
    this.triggerAutoSync();
  },

  async savePaymentsBatch(newPayments: Payment[]): Promise<void> {
    if (newPayments.length === 0) return;
    const targetSupplierId = newPayments[0].supplierId;
    const key = getScopedKey(STORAGE_KEYS.PAYMENTS, targetSupplierId);
    const raw = await this.getRawPayments(targetSupplierId);
    const map = new Map<string, Payment>();

    raw.forEach(p => map.set(p.id, p));
    newPayments.forEach(p => {
      map.set(p.id, {
        ...p,
        updatedAt: Date.now(),
        isDeleted: false
      });
    });

    const merged = Array.from(map.values());
    await AsyncStorage.setItem(key, JSON.stringify(merged));
    this.triggerAutoSync();
  },

  async deletePayment(id: string, supplierId?: string): Promise<void> {
    const sId = supplierId || currentSupplierId || (await this.getSupplier())?.id;
    const key = getScopedKey(STORAGE_KEYS.PAYMENTS, sId);
    const raw = await this.getRawPayments(sId);
    const existing = raw.find(p => p.id === id);
    if (existing) {
      existing.isDeleted = true;
      existing.updatedAt = Date.now();
      await AsyncStorage.setItem(key, JSON.stringify(raw));
    }

    // Also mark in legacy key if present
    const legacy = await AsyncStorage.getItem(STORAGE_KEYS.PAYMENTS);
    if (legacy) {
      try {
        const legacyList: Payment[] = JSON.parse(legacy);
        const legPay = legacyList.find(p => p.id === id);
        if (legPay) {
          legPay.isDeleted = true;
          legPay.updatedAt = Date.now();
          await AsyncStorage.setItem(STORAGE_KEYS.PAYMENTS, JSON.stringify(legacyList));
        }
      } catch {}
    }
    this.triggerAutoSync();
  },

  // Trigger background auto-sync if supplier is active
  async triggerAutoSync(): Promise<void> {
    const supplier = await this.getSupplier();
    if (supplier && supplier.id && supplier.phone && supplier.phone.length >= 10) {
      AutoSyncService.queueSync(supplier, 1500);
    }
  },

  // ==========================================
  // SUB-SUPPLIER PROCUREMENT & PAYMENT APIs
  // ==========================================

  // --- Sub-Suppliers ---
  async getRawSubSuppliers(supplierId?: string): Promise<SubSupplier[]> {
    const key = getScopedKey(STORAGE_KEYS.SUB_SUPPLIERS, supplierId);
    const data = await AsyncStorage.getItem(key);
    if (!data) return [];
    try {
      return JSON.parse(data);
    } catch {
      return [];
    }
  },

  async getSubSuppliers(supplierId?: string): Promise<SubSupplier[]> {
    const raw = await this.getRawSubSuppliers(supplierId);
    return raw.filter(s => !s.isDeleted);
  },

  async saveSubSupplier(subSupplier: SubSupplier): Promise<void> {
    const key = getScopedKey(STORAGE_KEYS.SUB_SUPPLIERS, subSupplier.supplierId);
    const raw = await this.getRawSubSuppliers(subSupplier.supplierId);
    const updated: SubSupplier = {
      ...subSupplier,
      updatedAt: Date.now(),
      isDeleted: false
    };

    const existingIdx = raw.findIndex(s => s.id === subSupplier.id);
    if (existingIdx >= 0) {
      raw[existingIdx] = updated;
    } else {
      raw.push(updated);
    }

    await AsyncStorage.setItem(key, JSON.stringify(raw));
    this.triggerAutoSync();
  },

  async saveSubSuppliersBatch(newSubSuppliers: SubSupplier[]): Promise<void> {
    if (newSubSuppliers.length === 0) return;
    const targetSupplierId = newSubSuppliers[0].supplierId;
    const key = getScopedKey(STORAGE_KEYS.SUB_SUPPLIERS, targetSupplierId);
    const raw = await this.getRawSubSuppliers(targetSupplierId);
    const map = new Map<string, SubSupplier>();

    raw.forEach(s => map.set(s.id, s));
    newSubSuppliers.forEach(s => {
      map.set(s.id, {
        ...s,
        updatedAt: Date.now(),
        isDeleted: false
      });
    });

    const merged = Array.from(map.values());
    await AsyncStorage.setItem(key, JSON.stringify(merged));
    this.triggerAutoSync();
  },

  async updateSubSupplierName(id: string, newName: string, supplierId?: string): Promise<void> {
    const sId = supplierId || currentSupplierId || (await this.getSupplier())?.id;
    const key = getScopedKey(STORAGE_KEYS.SUB_SUPPLIERS, sId);
    const raw = await this.getRawSubSuppliers(sId);
    const existing = raw.find(s => s.id === id);
    if (existing) {
      existing.name = newName.trim();
      existing.updatedAt = Date.now();
      await AsyncStorage.setItem(key, JSON.stringify(raw));
      this.triggerAutoSync();
    }
  },

  async deleteSubSupplier(id: string, supplierId?: string): Promise<void> {
    const sId = supplierId || currentSupplierId || (await this.getSupplier())?.id;
    const key = getScopedKey(STORAGE_KEYS.SUB_SUPPLIERS, sId);
    const raw = await this.getRawSubSuppliers(sId);
    const existing = raw.find(s => s.id === id);
    if (existing) {
      existing.isDeleted = true;
      existing.updatedAt = Date.now();
      await AsyncStorage.setItem(key, JSON.stringify(raw));
      this.triggerAutoSync();
    }
  },

  // --- Milk Inward Entries (Purchase from Sub-Suppliers) ---
  async getRawMilkInwardEntries(supplierId?: string): Promise<MilkInwardEntry[]> {
    const key = getScopedKey(STORAGE_KEYS.MILK_INWARD_ENTRIES, supplierId);
    const data = await AsyncStorage.getItem(key);
    if (!data) return [];
    try {
      return JSON.parse(data);
    } catch {
      return [];
    }
  },

  async getMilkInwardEntries(supplierId?: string): Promise<MilkInwardEntry[]> {
    const raw = await this.getRawMilkInwardEntries(supplierId);
    return raw.filter(e => !e.isDeleted);
  },

  async saveMilkInwardEntry(entry: MilkInwardEntry): Promise<void> {
    const key = getScopedKey(STORAGE_KEYS.MILK_INWARD_ENTRIES, entry.supplierId);
    const raw = await this.getRawMilkInwardEntries(entry.supplierId);
    const updated: MilkInwardEntry = {
      ...entry,
      updatedAt: Date.now(),
      isDeleted: false
    };

    const existingIdx = raw.findIndex(e => e.id === entry.id);
    if (existingIdx >= 0) {
      raw[existingIdx] = updated;
    } else {
      raw.push(updated);
    }

    await AsyncStorage.setItem(key, JSON.stringify(raw));
    this.triggerAutoSync();
  },

  async saveMilkInwardEntriesBatch(newEntries: MilkInwardEntry[]): Promise<void> {
    if (newEntries.length === 0) return;
    const targetSupplierId = newEntries[0].supplierId;
    const key = getScopedKey(STORAGE_KEYS.MILK_INWARD_ENTRIES, targetSupplierId);
    const raw = await this.getRawMilkInwardEntries(targetSupplierId);
    const map = new Map<string, MilkInwardEntry>();

    raw.forEach(e => map.set(e.id, e));
    newEntries.forEach(e => {
      map.set(e.id, {
        ...e,
        updatedAt: Date.now(),
        isDeleted: false
      });
    });

    const merged = Array.from(map.values());
    await AsyncStorage.setItem(key, JSON.stringify(merged));
    this.triggerAutoSync();
  },

  async deleteMilkInwardEntry(id: string, supplierId?: string): Promise<void> {
    const sId = supplierId || currentSupplierId || (await this.getSupplier())?.id;
    const key = getScopedKey(STORAGE_KEYS.MILK_INWARD_ENTRIES, sId);
    const raw = await this.getRawMilkInwardEntries(sId);
    const existing = raw.find(e => e.id === id);
    if (existing) {
      existing.isDeleted = true;
      existing.updatedAt = Date.now();
      await AsyncStorage.setItem(key, JSON.stringify(raw));
      this.triggerAutoSync();
    }
  },

  // --- Sub-Supplier Outward Payments ---
  async getRawSubSupplierPayments(supplierId?: string): Promise<SubSupplierPayment[]> {
    const key = getScopedKey(STORAGE_KEYS.SUB_SUPPLIER_PAYMENTS, supplierId);
    const data = await AsyncStorage.getItem(key);
    if (!data) return [];
    try {
      return JSON.parse(data);
    } catch {
      return [];
    }
  },

  async getSubSupplierPayments(supplierId?: string): Promise<SubSupplierPayment[]> {
    const raw = await this.getRawSubSupplierPayments(supplierId);
    return raw.filter(p => !p.isDeleted);
  },

  async saveSubSupplierPayment(payment: SubSupplierPayment): Promise<void> {
    const key = getScopedKey(STORAGE_KEYS.SUB_SUPPLIER_PAYMENTS, payment.supplierId);
    const raw = await this.getRawSubSupplierPayments(payment.supplierId);
    const updated: SubSupplierPayment = {
      ...payment,
      updatedAt: Date.now(),
      isDeleted: false
    };

    const existingIdx = raw.findIndex(p => p.id === payment.id);
    if (existingIdx >= 0) {
      raw[existingIdx] = updated;
    } else {
      raw.push(updated);
    }

    await AsyncStorage.setItem(key, JSON.stringify(raw));
    this.triggerAutoSync();
  },

  async deleteSubSupplierPayment(id: string, supplierId?: string): Promise<void> {
    const sId = supplierId || currentSupplierId || (await this.getSupplier())?.id;
    const key = getScopedKey(STORAGE_KEYS.SUB_SUPPLIER_PAYMENTS, sId);
    const raw = await this.getRawSubSupplierPayments(sId);
    const existing = raw.find(p => p.id === id);
    if (existing) {
      existing.isDeleted = true;
      existing.updatedAt = Date.now();
      await AsyncStorage.setItem(key, JSON.stringify(raw));
      this.triggerAutoSync();
    }
  },

  // Language
  async getLanguage(): Promise<'en' | 'hi'> {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const local = window.localStorage.getItem(STORAGE_KEYS.LANGUAGE);
        if (local === 'en' || local === 'hi') return local;
      }
    } catch {
      // ignore
    }
    const lang = await AsyncStorage.getItem(STORAGE_KEYS.LANGUAGE);
    return (lang as 'en' | 'hi') || 'en';
  },

  async saveLanguage(lang: 'en' | 'hi'): Promise<void> {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(STORAGE_KEYS.LANGUAGE, lang);
      }
    } catch {
      // ignore
    }
    await AsyncStorage.setItem(STORAGE_KEYS.LANGUAGE, lang);
  },

  // Reset or clear data for current supplier
  async clearAllData(): Promise<void> {
    const custKey = getScopedKey(STORAGE_KEYS.CUSTOMERS);
    const entryKey = getScopedKey(STORAGE_KEYS.MILK_ENTRIES);
    const payKey = getScopedKey(STORAGE_KEYS.PAYMENTS);
    const subSuppKey = getScopedKey(STORAGE_KEYS.SUB_SUPPLIERS);
    const inwardKey = getScopedKey(STORAGE_KEYS.MILK_INWARD_ENTRIES);
    const subPayKey = getScopedKey(STORAGE_KEYS.SUB_SUPPLIER_PAYMENTS);

    await Promise.all([
      AsyncStorage.removeItem(custKey),
      AsyncStorage.removeItem(entryKey),
      AsyncStorage.removeItem(payKey),
      AsyncStorage.removeItem(subSuppKey),
      AsyncStorage.removeItem(inwardKey),
      AsyncStorage.removeItem(subPayKey)
    ]);
  },

  async clearAllCustomers(): Promise<void> {
    const custKey = getScopedKey(STORAGE_KEYS.CUSTOMERS);
    await AsyncStorage.removeItem(custKey);
  },

  // Storage inspection & backup export
  async getAllStorageData(): Promise<{
    supplier: Supplier | null;
    customers: Customer[];
    milkEntries: MilkEntry[];
    payments: Payment[];
    subSuppliers: SubSupplier[];
    milkInwardEntries: MilkInwardEntry[];
    subSupplierPayments: SubSupplierPayment[];
    language: string;
    exportedAt: string;
    storageInfo: {
      storageEngine: string;
      internalPath: string;
      persistence: string;
    };
  }> {
    const [supplier, customers, milkEntries, payments, subSuppliers, milkInwardEntries, subSupplierPayments, language] = await Promise.all([
      this.getSupplier(),
      this.getCustomers(),
      this.getMilkEntries(),
      this.getPayments(),
      this.getSubSuppliers(),
      this.getMilkInwardEntries(),
      this.getSubSupplierPayments(),
      this.getLanguage()
    ]);

    return {
      storageInfo: {
        storageEngine: 'AsyncStorage / SQLite Database (Multi-Supplier Isolated)',
        internalPath: `Scoped under: ${supplier?.id || 'unscoped'}`,
        persistence: 'Permanent offline-first storage on device with background Firebase cloud sync.'
      },
      supplier,
      customers,
      milkEntries,
      payments,
      subSuppliers,
      milkInwardEntries,
      subSupplierPayments,
      language,
      exportedAt: new Date().toISOString()
    };
  }
};
