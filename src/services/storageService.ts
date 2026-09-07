import AsyncStorage from '@react-native-async-storage/async-storage';
import { Customer, MilkEntry, Payment, Supplier } from '../types';
import { generate50Customers } from './mockDataGenerator';

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
        id: 'supp_default_1',
        name: 'Om Dairy Supplier',
        phone: '9876543210',
        businessName: 'Om Fresh Dairy Farm',
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

  // Customers
  async getCustomers(): Promise<Customer[]> {
    const data = await AsyncStorage.getItem(STORAGE_KEYS.CUSTOMERS);
    if (!data) {
      const initialCustomers = generate50Customers('supp_default_1');
      await AsyncStorage.setItem(STORAGE_KEYS.CUSTOMERS, JSON.stringify(initialCustomers));
      return initialCustomers;
    }
    const parsed = JSON.parse(data);
    if (parsed.length < 50) {
      const full50 = generate50Customers('supp_default_1');
      await AsyncStorage.setItem(STORAGE_KEYS.CUSTOMERS, JSON.stringify(full50));
      return full50;
    }
    return parsed;
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

  // Milk Entries
  async getMilkEntries(): Promise<MilkEntry[]> {
    const data = await AsyncStorage.getItem(STORAGE_KEYS.MILK_ENTRIES);
    if (!data) {
      const today = new Date().toISOString().split('T')[0];
      const initialEntries: MilkEntry[] = [
        {
          id: 'entry_1',
          supplierId: 'supp_default_1',
          customerId: 'cust_1',
          customerName: 'Ramesh Sharma',
          date: today,
          session: 'Morning',
          milkType: 'cow',
          quantityLitres: 2.0,
          ratePerLitre: 55,
          amount: 110,
          isPaid: false,
          createdAt: Date.now()
        },
        {
          id: 'entry_2',
          supplierId: 'supp_default_1',
          customerId: 'cust_2',
          customerName: 'Suresh Patel',
          date: today,
          session: 'Morning',
          milkType: 'buffalo',
          quantityLitres: 1.5,
          ratePerLitre: 70,
          amount: 105,
          isPaid: false,
          createdAt: Date.now()
        }
      ];
      await AsyncStorage.setItem(STORAGE_KEYS.MILK_ENTRIES, JSON.stringify(initialEntries));
      return initialEntries;
    }
    return JSON.parse(data);
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

  // Language
  async getLanguage(): Promise<'en' | 'hi'> {
    const lang = await AsyncStorage.getItem(STORAGE_KEYS.LANGUAGE);
    return (lang as 'en' | 'hi') || 'en';
  },

  async saveLanguage(lang: 'en' | 'hi'): Promise<void> {
    await AsyncStorage.setItem(STORAGE_KEYS.LANGUAGE, lang);
  },

  // Reset or seed fresh data for testing
  async clearAllData(): Promise<void> {
    await AsyncStorage.removeItem(STORAGE_KEYS.CUSTOMERS);
    await AsyncStorage.removeItem(STORAGE_KEYS.MILK_ENTRIES);
    await AsyncStorage.removeItem(STORAGE_KEYS.PAYMENTS);
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

