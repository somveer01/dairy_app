import React, { createContext, useContext, useState, useEffect } from 'react';
import { translations, Language } from '../localization/i18n';
import { StorageService } from '../services/storageService';
import { Customer, MilkEntry, Payment, Supplier } from '../types';

interface AppContextType {
  lang: Language;
  t: typeof translations['en'];
  setLanguage: (lang: Language) => Promise<void>;
  supplier: Supplier | null;
  setSupplier: (supplier: Supplier | null) => void;
  customers: Customer[];
  refreshCustomers: () => Promise<void>;
  milkEntries: MilkEntry[];
  refreshMilkEntries: () => Promise<void>;
  payments: Payment[];
  refreshPayments: () => Promise<void>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [lang, setLangState] = useState<Language>(() => {
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        const stored = window.localStorage.getItem('@dairy_lang');
        if (stored === 'hi' || stored === 'en') return stored;
      } catch {
        // ignore
      }
    }
    return 'en';
  });
  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [milkEntries, setMilkEntries] = useState<MilkEntry[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);


  useEffect(() => {
    loadInitialData();
  }, []);

  const loadInitialData = async () => {
    const savedLang = await StorageService.getLanguage();
    setLangState(savedLang);

    const savedSupplier = await StorageService.getSupplier();
    setSupplier(savedSupplier);

    const custs = await StorageService.getCustomers();
    setCustomers(custs);

    const entries = await StorageService.getMilkEntries();
    setMilkEntries(entries);

    const pays = await StorageService.getPayments();
    setPayments(pays);
  };

  const setLanguage = async (newLang: Language) => {
    await StorageService.saveLanguage(newLang);
    setLangState(newLang);
  };

  const refreshCustomers = async () => {
    const custs = await StorageService.getCustomers();
    setCustomers(custs);
  };

  const refreshMilkEntries = async () => {
    const entries = await StorageService.getMilkEntries();
    setMilkEntries(entries);
  };

  const refreshPayments = async () => {
    const pays = await StorageService.getPayments();
    setPayments(pays);
  };

  return (
    <AppContext.Provider
      value={{
        lang,
        t: translations[lang],
        setLanguage,
        supplier,
        setSupplier,
        customers,
        refreshCustomers,
        milkEntries,
        refreshMilkEntries,
        payments,
        refreshPayments
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
