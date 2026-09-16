import React, { createContext, useContext, useState, useEffect } from 'react';
import { translations, Language } from '../localization/i18n';
import { StorageService } from '../services/storageService';
import { AutoSyncService } from '../services/autoSyncService';
import { SubscriptionService, SubscriptionStatusResult } from '../services/subscriptionService';
import { Customer, MilkEntry, Payment, Supplier, SubSupplier, MilkInwardEntry, SubSupplierPayment } from '../types';

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
  subSuppliers: SubSupplier[];
  refreshSubSuppliers: () => Promise<void>;
  milkInwardEntries: MilkInwardEntry[];
  refreshMilkInwardEntries: () => Promise<void>;
  subSupplierPayments: SubSupplierPayment[];
  refreshSubSupplierPayments: () => Promise<void>;
  isLoading: boolean;
  isAuthModalVisible: boolean;
  openAuthModal: () => void;
  closeAuthModal: () => void;
  isSubscriptionModalVisible: boolean;
  openSubscriptionModal: () => void;
  closeSubscriptionModal: () => void;
  subscriptionStatus: SubscriptionStatusResult;
  requireAuth: (onAuthorized: () => void) => boolean;
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

  const [supplier, setSupplierState] = useState<Supplier | null>(() => {
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        const stored = window.localStorage.getItem('@dairy_supplier');
        if (stored) {
          const parsed = JSON.parse(stored);
          if (parsed && parsed.id && parsed.phone && parsed.phone.length >= 10) {
            StorageService.setActiveSupplierId(parsed.id);
            return parsed;
          }
        }
      } catch {
        // ignore
      }
    }
    return null;
  });

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [milkEntries, setMilkEntries] = useState<MilkEntry[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [subSuppliers, setSubSuppliers] = useState<SubSupplier[]>([]);
  const [milkInwardEntries, setMilkInwardEntries] = useState<MilkInwardEntry[]>([]);
  const [subSupplierPayments, setSubSupplierPayments] = useState<SubSupplierPayment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthModalVisible, setIsAuthModalVisible] = useState(false);

  useEffect(() => {
    loadInitialData();
  }, []);

  const loadInitialData = async () => {
    try {
      const savedLang = await StorageService.getLanguage();
      setLangState(savedLang);

      let savedSupplier = await StorageService.getSupplier();
      if (savedSupplier && savedSupplier.phone && savedSupplier.phone.length >= 10) {
        if (!savedSupplier.subscription) {
          const sub = SubscriptionService.ensureSubscription(savedSupplier);
          savedSupplier = { ...savedSupplier, subscription: sub };
          await StorageService.saveSupplier(savedSupplier);
        }
        StorageService.setActiveSupplierId(savedSupplier.id);
        setSupplierState(savedSupplier);

        // Load data scoped to this authenticated supplier
        const [custs, entries, pays, subSupps, inward, subPays] = await Promise.all([
          StorageService.getCustomers(savedSupplier.id),
          StorageService.getMilkEntries(savedSupplier.id),
          StorageService.getPayments(savedSupplier.id),
          StorageService.getSubSuppliers(savedSupplier.id),
          StorageService.getMilkInwardEntries(savedSupplier.id),
          StorageService.getSubSupplierPayments(savedSupplier.id)
        ]);

        setCustomers(custs.filter(c => !c.isDeleted));
        setMilkEntries(entries.filter(e => !e.isDeleted));
        setPayments(pays.filter(p => !p.isDeleted));
        setSubSuppliers(subSupps.filter(s => !s.isDeleted));
        setMilkInwardEntries(inward.filter(i => !i.isDeleted));
        setSubSupplierPayments(subPays.filter(sp => !sp.isDeleted));

        // Trigger background sync on launch
        AutoSyncService.queueSync(savedSupplier, 1200);
      } else {
        // Incomplete profile or no phone - clear session, but allow access to local/demo data
        await StorageService.clearActiveSession();
        setSupplierState(null);
        // Load default/legacy customers, entries, and payments so guest mode is fully browsable
        const [custs, entries, pays, subSupps, inward, subPays] = await Promise.all([
          StorageService.getCustomers(),
          StorageService.getMilkEntries(),
          StorageService.getPayments(),
          StorageService.getSubSuppliers(),
          StorageService.getMilkInwardEntries(),
          StorageService.getSubSupplierPayments()
        ]);
        setCustomers(custs.filter(c => !c.isDeleted));
        setMilkEntries(entries.filter(e => !e.isDeleted));
        setPayments(pays.filter(p => !p.isDeleted));
        setSubSuppliers(subSupps.filter(s => !s.isDeleted));
        setMilkInwardEntries(inward.filter(i => !i.isDeleted));
        setSubSupplierPayments(subPays.filter(sp => !sp.isDeleted));
      }
    } finally {
      setIsLoading(false);
    }
  };

  const setSupplier = async (newSupplier: Supplier | null) => {
    if (!newSupplier) {
      await StorageService.clearActiveSession();
      setSupplierState(null);
      const [custs, entries, pays, subSupps, inward, subPays] = await Promise.all([
        StorageService.getCustomers(),
        StorageService.getMilkEntries(),
        StorageService.getPayments(),
        StorageService.getSubSuppliers(),
        StorageService.getMilkInwardEntries(),
        StorageService.getSubSupplierPayments()
      ]);
      setCustomers(custs.filter(c => !c.isDeleted));
      setMilkEntries(entries.filter(e => !e.isDeleted));
      setPayments(pays.filter(p => !p.isDeleted));
      setSubSuppliers(subSupps.filter(s => !s.isDeleted));
      setMilkInwardEntries(inward.filter(i => !i.isDeleted));
      setSubSupplierPayments(subPays.filter(sp => !sp.isDeleted));
      return;
    }

    let finalSupplier = newSupplier;
    if (!finalSupplier.subscription) {
      const sub = SubscriptionService.ensureSubscription(finalSupplier);
      finalSupplier = { ...finalSupplier, subscription: sub };
    }

    StorageService.setActiveSupplierId(finalSupplier.id);
    await StorageService.saveSupplier(finalSupplier);
    setSupplierState(finalSupplier);
    setIsAuthModalVisible(false);

    // Refresh records scoped to the new supplier
    const [custs, entries, pays, subSupps, inward, subPays] = await Promise.all([
      StorageService.getCustomers(finalSupplier.id),
      StorageService.getMilkEntries(finalSupplier.id),
      StorageService.getPayments(finalSupplier.id),
      StorageService.getSubSuppliers(finalSupplier.id),
      StorageService.getMilkInwardEntries(finalSupplier.id),
      StorageService.getSubSupplierPayments(finalSupplier.id)
    ]);

    setCustomers(custs.filter(c => !c.isDeleted));
    setMilkEntries(entries.filter(e => !e.isDeleted));
    setPayments(pays.filter(p => !p.isDeleted));
    setSubSuppliers(subSupps.filter(s => !s.isDeleted));
    setMilkInwardEntries(inward.filter(i => !i.isDeleted));
    setSubSupplierPayments(subPays.filter(sp => !sp.isDeleted));

    AutoSyncService.queueSync(finalSupplier, 500);
  };

  const [isSubscriptionModalVisible, setIsSubscriptionModalVisible] = useState(false);

  const subscriptionStatus = React.useMemo(() => {
    return SubscriptionService.getSubscriptionStatus(supplier);
  }, [supplier]);

  const openSubscriptionModal = () => setIsSubscriptionModalVisible(true);
  const closeSubscriptionModal = () => setIsSubscriptionModalVisible(false);

  const setLanguage = async (newLang: Language) => {
    await StorageService.saveLanguage(newLang);
    setLangState(newLang);
  };

  const refreshCustomers = async () => {
    const sId = supplier?.id || StorageService.getActiveSupplierId() || undefined;
    const custs = await StorageService.getCustomers(sId);
    setCustomers(custs.filter(c => !c.isDeleted));
  };

  const refreshMilkEntries = async () => {
    const sId = supplier?.id || StorageService.getActiveSupplierId() || undefined;
    const entries = await StorageService.getMilkEntries(sId);
    setMilkEntries(entries.filter(e => !e.isDeleted));
  };

  const refreshPayments = async () => {
    const sId = supplier?.id || StorageService.getActiveSupplierId() || undefined;
    const pays = await StorageService.getPayments(sId);
    setPayments(pays.filter(p => !p.isDeleted));
  };

  const refreshSubSuppliers = async () => {
    const sId = supplier?.id || StorageService.getActiveSupplierId() || undefined;
    const subSupps = await StorageService.getSubSuppliers(sId);
    setSubSuppliers(subSupps.filter(s => !s.isDeleted));
  };

  const refreshMilkInwardEntries = async () => {
    const sId = supplier?.id || StorageService.getActiveSupplierId() || undefined;
    const inward = await StorageService.getMilkInwardEntries(sId);
    setMilkInwardEntries(inward.filter(i => !i.isDeleted));
  };

  const refreshSubSupplierPayments = async () => {
    const sId = supplier?.id || StorageService.getActiveSupplierId() || undefined;
    const subPays = await StorageService.getSubSupplierPayments(sId);
    setSubSupplierPayments(subPays.filter(sp => !sp.isDeleted));
  };

  const openAuthModal = () => {
    setIsAuthModalVisible(true);
  };

  const closeAuthModal = () => {
    setIsAuthModalVisible(false);
  };

  const requireAuth = (onAuthorized: () => void): boolean => {
    const isAuthenticated = Boolean(
      supplier && supplier.id && supplier.phone && supplier.phone.length >= 10
    );
    if (!isAuthenticated) {
      setIsAuthModalVisible(true);
      return false;
    }

    // Check if subscription has expired and locked out
    if (subscriptionStatus.isLocked) {
      setIsSubscriptionModalVisible(true);
      return false;
    }

    onAuthorized();
    return true;
  };

  return (
    <AppContext.Provider
      value={{
        lang,
        t: translations[lang] || translations.en,
        setLanguage,
        supplier,
        setSupplier,
        customers,
        refreshCustomers,
        milkEntries,
        refreshMilkEntries,
        payments,
        refreshPayments,
        subSuppliers,
        refreshSubSuppliers,
        milkInwardEntries,
        refreshMilkInwardEntries,
        subSupplierPayments,
        refreshSubSupplierPayments,
        isLoading,
        isAuthModalVisible,
        openAuthModal,
        closeAuthModal,
        isSubscriptionModalVisible,
        openSubscriptionModal,
        closeSubscriptionModal,
        subscriptionStatus,
        requireAuth
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
