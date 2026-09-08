import AsyncStorage from '@react-native-async-storage/async-storage';
import { Customer, MilkEntry, Payment, Supplier } from '../types';

const STORAGE_KEYS = {
  SUPPLIER: '@dairy_supplier',
  CUSTOMERS: '@dairy_customers',
  MILK_ENTRIES: '@dairy_milk_entries',
  PAYMENTS: '@dairy_payments',
  LANGUAGE: '@dairy_lang'
};

export const StorageService = {
  // Supplier
  async getSupplier(): Promise<Supplier | null> {
    const data = await AsyncStorage.getItem(STORAGE_KEYS.SUPPLIER);
    if (!data) {
      const defaultSupplier: Supplier = {
        id: 'supp_1',
        name: 'My Dairy',
        phone: '',
        businessName: 'Fresh Milk Dairy',
        createdAt: Date.now()
      };
      await AsyncStorage.setItem(STORAGE_KEYS.SUPPLIER, JSON.stringify(defaultSupplier));
      return defaultSupplier;
    }
    return JSON.parse(data);
  },

  async saveSupplier(supplier: Supplier): Promise<void> {
    await AsyncStorage.setItem(STORAGE_KEYS.SUPPLIER, JSON.stringify(supplier));
  },

  // Customers - Clean real data only (no dummy customers)
  async getCustomers(): Promise<Customer[]> {
    const data = await AsyncStorage.getItem(STORAGE_KEYS.CUSTOMERS);
    if (!data) return [];
    try {
      const parsed: Customer[] = JSON.parse(data);
      // Auto-purge any residual default or mock customers
      const clean = parsed.filter(c =>
        c.id !== 'cust_1' &&
        c.id !== 'cust_2' &&
        !c.id.startsWith('mock_cust_') &&
        c.name !== 'Ramesh Sharma' &&
        c.name !== 'Suresh Patel'
      );
      if (clean.length !== parsed.length) {
        await AsyncStorage.setItem(STORAGE_KEYS.CUSTOMERS, JSON.stringify(clean));
      }
      return clean;
    } catch {
      return [];
    }
  },

  async saveCustomer(customer: Customer): Promise<void> {
    const customers = await this.getCustomers();
    const existingIndex = customers.findIndex(c => c.id === customer.id);
    if (existingIndex >= 0) {
      customers[existingIndex] = customer;
    } else {
      customers.push(customer);
    }
    await AsyncStorage.setItem(STORAGE_KEYS.CUSTOMERS, JSON.stringify(customers));
  },

  async saveCustomersBatch(newCustomers: Customer[]): Promise<void> {
    const customers = await this.getCustomers();
    const map = new Map<string, Customer>();
    customers.forEach(c => map.set(c.id, c));
    newCustomers.forEach(c => map.set(c.id, c));
    const merged = Array.from(map.values());
    await AsyncStorage.setItem(STORAGE_KEYS.CUSTOMERS, JSON.stringify(merged));
  },

  async deleteCustomer(id: string): Promise<void> {
    const customers = await this.getCustomers();
    const filtered = customers.filter(c => c.id !== id);
    await AsyncStorage.setItem(STORAGE_KEYS.CUSTOMERS, JSON.stringify(filtered));
  },

  // Milk Entries - Clean real entries only (no dummy deliveries)
  async getMilkEntries(): Promise<MilkEntry[]> {
    const data = await AsyncStorage.getItem(STORAGE_KEYS.MILK_ENTRIES);
    if (!data) return [];
    try {
      const parsed: MilkEntry[] = JSON.parse(data);
      const clean = parsed.filter(e =>
        e.id !== 'entry_1' &&
        e.id !== 'entry_2' &&
        !e.id.startsWith('mock_entry_') &&
        e.customerId !== 'cust_1' &&
        e.customerId !== 'cust_2' &&
        e.customerName !== 'Ramesh Sharma' &&
        e.customerName !== 'Suresh Patel'
      );
      if (clean.length !== parsed.length) {
        await AsyncStorage.setItem(STORAGE_KEYS.MILK_ENTRIES, JSON.stringify(clean));
      }
      return clean;
    } catch {
      return [];
    }
  },

  async saveMilkEntry(entry: MilkEntry): Promise<void> {
    const entries = await this.getMilkEntries();
    const idx = entries.findIndex(e => e.id === entry.id);
    if (idx >= 0) {
      entries[idx] = entry;
    } else {
      entries.push(entry);
    }
    await AsyncStorage.setItem(STORAGE_KEYS.MILK_ENTRIES, JSON.stringify(entries));
  },

  async saveMilkEntriesBatch(newEntries: MilkEntry[]): Promise<void> {
    const entries = await this.getMilkEntries();
    const map = new Map<string, MilkEntry>();
    entries.forEach(e => map.set(e.id, e));
    newEntries.forEach(e => map.set(e.id, e));
    const merged = Array.from(map.values());
    await AsyncStorage.setItem(STORAGE_KEYS.MILK_ENTRIES, JSON.stringify(merged));
  },

  async deleteMilkEntry(id: string): Promise<void> {
    const entries = await this.getMilkEntries();
    const filtered = entries.filter(e => e.id !== id);
    await AsyncStorage.setItem(STORAGE_KEYS.MILK_ENTRIES, JSON.stringify(filtered));
  },

  // Payments
  async getPayments(): Promise<Payment[]> {
    const data = await AsyncStorage.getItem(STORAGE_KEYS.PAYMENTS);
    return data ? JSON.parse(data) : [];
  },

  async savePayment(payment: Payment): Promise<void> {
    const payments = await this.getPayments();
    payments.push(payment);
    await AsyncStorage.setItem(STORAGE_KEYS.PAYMENTS, JSON.stringify(payments));
  },

  async savePaymentsBatch(newPayments: Payment[]): Promise<void> {
    const payments = await this.getPayments();
    const merged = [...payments, ...newPayments];
    await AsyncStorage.setItem(STORAGE_KEYS.PAYMENTS, JSON.stringify(merged));
  },

  async deletePayment(id: string): Promise<void> {
    const payments = await this.getPayments();
    const filtered = payments.filter(p => p.id !== id);
    await AsyncStorage.setItem(STORAGE_KEYS.PAYMENTS, JSON.stringify(filtered));
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


  // Reset or seed fresh data
  async clearAllData(): Promise<void> {
    await AsyncStorage.setItem(STORAGE_KEYS.CUSTOMERS, JSON.stringify([]));
    await AsyncStorage.setItem(STORAGE_KEYS.MILK_ENTRIES, JSON.stringify([]));
    await AsyncStorage.setItem(STORAGE_KEYS.PAYMENTS, JSON.stringify([]));
    await AsyncStorage.removeItem(STORAGE_KEYS.CUSTOMERS);
    await AsyncStorage.removeItem(STORAGE_KEYS.MILK_ENTRIES);
    await AsyncStorage.removeItem(STORAGE_KEYS.PAYMENTS);
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        window.localStorage.removeItem(STORAGE_KEYS.CUSTOMERS);
        window.localStorage.removeItem(STORAGE_KEYS.MILK_ENTRIES);
        window.localStorage.removeItem(STORAGE_KEYS.PAYMENTS);
      } catch {
        // ignore
      }
    }
  },

  async clearAllCustomers(): Promise<void> {
    await AsyncStorage.setItem(STORAGE_KEYS.CUSTOMERS, JSON.stringify([]));
    await AsyncStorage.removeItem(STORAGE_KEYS.CUSTOMERS);
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        window.localStorage.removeItem(STORAGE_KEYS.CUSTOMERS);
      } catch {
        // ignore
      }
    }
  },

  // Storage inspection & backup export
  async getAllStorageData(): Promise<{
    supplier: Supplier | null;
    customers: Customer[];
    milkEntries: MilkEntry[];
    payments: Payment[];
    language: string;
    exportedAt: string;
    storageInfo: {
      storageEngine: string;
      internalPath: string;
      persistence: string;
    };
  }> {
    const [supplier, customers, milkEntries, payments, language] = await Promise.all([
      this.getSupplier(),
      this.getCustomers(),
      this.getMilkEntries(),
      this.getPayments(),
      this.getLanguage()
    ]);

    return {
      storageInfo: {
        storageEngine: 'AsyncStorage / SQLite Database',
        internalPath: 'Android sandboxed app storage (/data/data/<package>/databases/RKStorage)',
        persistence: 'Permanent offline-first storage on device. Retained on app close, reboot, and offline.'
      },
      supplier,
      customers,
      milkEntries,
      payments,
      language,
      exportedAt: new Date().toISOString()
    };
  }
};

