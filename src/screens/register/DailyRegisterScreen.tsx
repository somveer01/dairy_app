import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Modal,
  TextInput,
  Keyboard,
  BackHandler
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useApp } from '../../context/AppContext';
import { StorageService } from '../../services/storageService';
import { CardSyncService } from '../../services/cardSyncService';
import { MilkEntry, MilkInwardEntry, MilkType, SessionType, Customer, SubSupplier } from '../../types';
import { confirmAction, showAlert } from '../../utils/alertUtils';
import { formatToDisplayDate, toLocalIso } from '../../utils/dateUtils';

export const DailyRegisterScreen = () => {
  const {
    t,
    lang,
    customers,
    milkEntries,
    refreshMilkEntries,
    payments,
    subSuppliers,
    refreshSubSuppliers,
    milkInwardEntries,
    refreshMilkInwardEntries,
    supplier,
    requireAuth
  } = useApp();

  const [registerMode, setRegisterMode] = useState<'delivery' | 'procurement'>('delivery');
  const [selectedDate, setSelectedDate] = useState(() => toLocalIso(new Date()));
  const [activeSession, setActiveSession] = useState<SessionType>('Morning');
  const [searchFilter, setSearchFilter] = useState('');

  // Single Customer Entry Modal State
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [session, setSession] = useState<SessionType>('Morning');
  const [milkType, setMilkType] = useState<MilkType>('cow');
  const [litres, setLitres] = useState('');
  const [rate, setRate] = useState('');
  const [notes, setNotes] = useState('');

  // Add-on Dairy Products Modal State
  const [addonModalVisible, setAddonModalVisible] = useState(false);
  const [addonCustomer, setAddonCustomer] = useState<Customer | null>(null);
  const [paneerQty, setPaneerQty] = useState('');
  const [curdQty, setCurdQty] = useState('');
  const [gheeQty, setGheeQty] = useState('');
  const [butterMilkQty, setButterMilkQty] = useState('');

  // Sub-Supplier Inward Entry Modal State
  const [subModalVisible, setSubModalVisible] = useState(false);
  const [selectedSubSupplier, setSelectedSubSupplier] = useState<SubSupplier | null>(null);
  const [subSession, setSubSession] = useState<SessionType>('Morning');
  const [subMilkType, setSubMilkType] = useState<MilkType>('cow');
  const [subLitres, setSubLitres] = useState('');
  const [subRate, setSubRate] = useState('');
  const [subNotes, setSubNotes] = useState('');

  const productRates = useMemo(() => {
    const defaultRates: Record<string, number> = {
      prod_paneer: 360,
      prod_curd: 70,
      prod_ghee: 700,
      prod_buttermilk: 20
    };
    if (supplier?.settings?.customProducts) {
      supplier.settings.customProducts.forEach(p => {
        defaultRates[p.id] = p.defaultRate;
      });
    }
    return defaultRates;
  }, [supplier?.settings?.customProducts]);

  const changeDateBy = (days: number) => {
    const parts = selectedDate.split('-').map(Number);
    const current = new Date(parts[0], parts[1] - 1, parts[2], 12, 0, 0);
    current.setDate(current.getDate() + days);
    setSelectedDate(toLocalIso(current));
  };

  // Hardware/gesture Back button handler for modals and sub-modes
  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        // Step 1: Close any open modal
        if (modalVisible) {
          setModalVisible(false);
          return true;
        }
        if (addonModalVisible) {
          setAddonModalVisible(false);
          return true;
        }
        if (subModalVisible) {
          setSubModalVisible(false);
          return true;
        }

        // Step 2: If in inward procurement mode, revert to customer delivery mode
        if (registerMode === 'procurement') {
          setRegisterMode('delivery');
          return true;
        }

        // Step 3: Default behavior (return to DashboardTab)
        return false;
      };

      const sub = BackHandler.addEventListener('hardwareBackPress', onBackPress);
      return () => sub.remove();
    }, [modalVisible, addonModalVisible, subModalVisible, registerMode])
  );

  // --- CUSTOMER DELIVERY DATA & STATS ---
  const { sessionEntriesMap, stats } = useMemo(() => {
    const map = new Map<string, MilkEntry>();
    let cowQty = 0;
    let buffaloQty = 0;
    let packetQty = 0;
    let totalAmt = 0;
    let count = 0;

    for (let i = 0; i < milkEntries.length; i++) {
      const e = milkEntries[i];
      if (!e.isDeleted && e.date === selectedDate && e.session === activeSession) {
        map.set(e.customerId, e);
        if (e.isPacketMilk || (e.milkType && e.milkType.startsWith('packet'))) {
          packetQty += e.quantityLitres;
        } else if (e.milkType === 'cow') {
          cowQty += e.quantityLitres;
        } else {
          buffaloQty += e.quantityLitres;
        }

        let dayAmt = e.totalDayAmount != null ? e.totalDayAmount : e.amount;
        if (e.totalDayAmount == null && e.addons && Array.isArray(e.addons)) {
          let addonTotal = 0;
          for (const a of e.addons) addonTotal += (a.totalAmount || 0);
          dayAmt = e.amount + addonTotal;
        }
        totalAmt += dayAmt;
        count++;
      }
    }

    return {
      sessionEntriesMap: map,
      stats: {
        cowQty,
        buffaloQty,
        packetQty,
        totalQty: cowQty + buffaloQty + packetQty,
        totalLitres: cowQty + buffaloQty + packetQty,
        totalAmt,
        count
      }
    };
  }, [milkEntries, selectedDate, activeSession]);

  const filteredCustomers = useMemo(() => {
    let list = customers.filter(c => !c.isDeleted);
    if (searchFilter.trim()) {
      const q = searchFilter.trim().toLowerCase();
      list = list.filter(
        c => c.name.toLowerCase().includes(q) || c.phone.includes(q)
      );
    }
    return list;
  }, [customers, searchFilter]);

  // --- SUB-SUPPLIER INWARD DATA & STATS ---
  const { inwardEntriesMap, inwardStats } = useMemo(() => {
    const map = new Map<string, MilkInwardEntry>();
    let cowQty = 0;
    let buffaloQty = 0;
    let totalAmt = 0;
    let count = 0;

    for (let i = 0; i < milkInwardEntries.length; i++) {
      const e = milkInwardEntries[i];
      if (!e.isDeleted && e.date === selectedDate && e.session === activeSession) {
        map.set(e.subSupplierId, e);
        if (e.milkType === 'cow') cowQty += e.quantityLitres;
        else buffaloQty += e.quantityLitres;
        totalAmt += e.amount;
        count++;
      }
    }

    return {
      inwardEntriesMap: map,
      inwardStats: {
        cowQty,
        buffaloQty,
        totalQty: cowQty + buffaloQty,
        totalLitres: cowQty + buffaloQty,
        totalAmt,
        count
      }
    };
  }, [milkInwardEntries, selectedDate, activeSession]);

  const filteredSubSuppliers = useMemo(() => {
    let list = subSuppliers.filter(s => !s.isDeleted);
    if (searchFilter.trim()) {
      const q = searchFilter.trim().toLowerCase();
      list = list.filter(
        s => s.name.toLowerCase().includes(q) || s.phone.includes(q)
      );
    }
    return list;
  }, [subSuppliers, searchFilter]);

  // --- CUSTOMER DELIVERY ACTIONS ---
  const handleDeleteEntry = (entry: MilkEntry, customerName: string) => {
    requireAuth(() => {
      confirmAction(
        lang === 'hi' ? 'एंट्री हटाएं (Delete Delivery)' : 'Delete Delivery',
        lang === 'hi'
          ? `क्या आप ${customerName} की ${activeSession} की डिलीवरी एंट्री हटाना चाहते हैं?`
          : `Delete delivery entry for ${customerName} (${activeSession})?`,
        async () => {
          await StorageService.deleteMilkEntry(entry.id, supplier?.id);
          await refreshMilkEntries();
          CardSyncService.syncCustomerCard(
            entry.customerId,
            supplier,
            customers.filter(c => !c.isDeleted),
            milkEntries.filter(e => e.id !== entry.id && !e.isDeleted),
            payments.filter(p => !p.isDeleted)
          );
        },
        lang === 'hi' ? '🗑️ हटाएं (Delete)' : 'Delete',
        lang === 'hi' ? 'रद्द करें (Cancel)' : 'Cancel',
        true
      );
    });
  };

  const handleQuickAddDefault = async (customer: Customer) => {
    requireAuth(async () => {
      const existing = sessionEntriesMap.get(customer.id);
      if (existing) {
        handleDeleteEntry(existing, customer.name);
        return;
      }

      const milkAmt = customer.defaultLitres * customer.ratePerLitre;
      const newEntry: MilkEntry = {
        id: `entry_${selectedDate}_${activeSession}_${customer.id}_${Date.now()}`,
        supplierId: supplier?.id || 'supp_default',
        customerId: customer.id,
        customerName: customer.name,
        date: selectedDate,
        session: activeSession,
        milkType: customer.milkType,
        quantityLitres: customer.defaultLitres,
        ratePerLitre: customer.ratePerLitre,
        amount: milkAmt,
        totalDayAmount: milkAmt,
        isPacketMilk: customer.isPacketMilk,
        packetBrand: customer.packetBrand,
        packetVariant: customer.packetVariant,
        isPaid: false,
        createdAt: Date.now()
      };

      await StorageService.saveMilkEntry(newEntry);
      await refreshMilkEntries();
      CardSyncService.syncCustomerCard(customer.id, supplier, customers, [...milkEntries, newEntry], payments);
    });
  };

  const handleBulkFillAll = () => {
    Keyboard.dismiss();
    requireAuth(() => {
      const activeCusts = customers.filter(c => !c.isDeleted);
      const unrecordedCustomers = activeCusts.filter(c => !sessionEntriesMap.has(c.id));
      if (unrecordedCustomers.length === 0) {
        showAlert(
          lang === 'hi' ? 'सबका दूध दर्ज है (All Recorded)' : 'All Recorded',
          lang === 'hi'
            ? `सभी ${activeCusts.length} ग्राहकों का ${activeSession} का दूध पहले से दर्ज किया जा चुका है!`
            : `All ${activeCusts.length} customers are already recorded for ${activeSession}!`
        );
        return;
      }

      const sessionLabel = activeSession === 'Morning' ? '🌅 सुबह (Morning)' : activeSession === 'Evening' ? '🌇 शाम (Evening)' : '🕒 कस्टम (Custom)';

      confirmAction(
        lang === 'hi' ? 'सभी का दूध मार्क करें (Mark All Deliveries)' : 'Mark All Deliveries',
        lang === 'hi'
          ? `क्या आप शेष सभी ${unrecordedCustomers.length} ग्राहकों का डिफ़ॉल्ट दूध दर्ज करना चाहते हैं?\n• कुल शेष ग्राहक: ${unrecordedCustomers.length} लोग\n• समय (Session): ${sessionLabel}\n• तारीख (Date): ${formatToDisplayDate(selectedDate)}`
          : `Record default delivery for all ${unrecordedCustomers.length} customers?\n• Session: ${sessionLabel}\n• Date: ${formatToDisplayDate(selectedDate)}`,
        async () => {
          const newEntries: MilkEntry[] = unrecordedCustomers.map(c => {
            const milkAmt = c.defaultLitres * c.ratePerLitre;
            return {
              id: `entry_${selectedDate}_${activeSession}_${c.id}_${Date.now()}_${Math.random().toString(36).substring(7)}`,
              supplierId: supplier?.id || 'supp_default',
              customerId: c.id,
              customerName: c.name,
              date: selectedDate,
              session: activeSession,
              milkType: c.milkType,
              quantityLitres: c.defaultLitres,
              ratePerLitre: c.ratePerLitre,
              amount: milkAmt,
              totalDayAmount: milkAmt,
              isPacketMilk: c.isPacketMilk,
              packetBrand: c.packetBrand,
              packetVariant: c.packetVariant,
              isPaid: false,
              createdAt: Date.now()
            };
          });
          await StorageService.saveMilkEntriesBatch(newEntries);
          await refreshMilkEntries();
          CardSyncService.syncAllCards(supplier, customers, [...milkEntries, ...newEntries], payments);
        },
        lang === 'hi' ? `✓ सभी दर्ज करें (${unrecordedCustomers.length})` : `✓ Record All (${unrecordedCustomers.length})`,
        lang === 'hi' ? 'रद्द करें (Cancel)' : 'Cancel',
        false
      );
    });
  };

  const openCustomEntryModal = (cust: Customer) => {
    Keyboard.dismiss();
    requireAuth(() => {
      const existing = sessionEntriesMap.get(cust.id);
      setSelectedCustomer(cust);
      setSession(activeSession);
      setMilkType(existing ? existing.milkType : cust.milkType);
      setLitres(existing ? existing.quantityLitres.toString() : cust.defaultLitres.toString());
      setRate(existing ? existing.ratePerLitre.toString() : cust.ratePerLitre.toString());
      setNotes(existing?.notes || '');
      setModalVisible(true);
    });
  };

  const handleSaveModalEntry = async () => {
    Keyboard.dismiss();
    requireAuth(async () => {
      if (!selectedCustomer) return;
      const qty = parseFloat(litres) || 0;
      const rateVal = parseFloat(rate) || 0;

      if (qty <= 0) {
        showAlert(lang === 'hi' ? 'अमान्य मात्रा' : 'Validation Error', lang === 'hi' ? 'कृपया दूध की सही मात्रा दर्ज करें।' : 'Please enter a valid milk quantity.');
        return;
      }

      const existing = sessionEntriesMap.get(selectedCustomer.id);
      const milkAmt = qty * rateVal;
      let addonAmt = 0;
      if (existing?.addons) {
        for (const a of existing.addons) addonAmt += (a.totalAmount || 0);
      }

      const entry: MilkEntry = {
        id: existing ? existing.id : `entry_${selectedDate}_${session}_${selectedCustomer.id}_${Date.now()}`,
        supplierId: supplier?.id || 'supp_default',
        customerId: selectedCustomer.id,
        customerName: selectedCustomer.name,
        date: selectedDate,
        session: session,
        milkType: selectedCustomer.isPacketMilk ? selectedCustomer.milkType : milkType,
        quantityLitres: qty,
        ratePerLitre: rateVal,
        amount: milkAmt,
        totalDayAmount: milkAmt + addonAmt,
        isPacketMilk: selectedCustomer.isPacketMilk,
        packetBrand: selectedCustomer.packetBrand,
        packetVariant: selectedCustomer.packetVariant,
        addons: existing?.addons,
        isPaid: existing ? existing.isPaid : false,
        notes: notes.trim(),
        createdAt: existing ? existing.createdAt : Date.now()
      };

      await StorageService.saveMilkEntry(entry);
      await refreshMilkEntries();
      CardSyncService.syncCustomerCard(selectedCustomer.id, supplier, customers, [...milkEntries.filter(e => e.id !== entry.id), entry], payments);
      setModalVisible(false);
    });
  };

  const openAddonModal = (cust: Customer) => {
    Keyboard.dismiss();
    setAddonCustomer(cust);
    const existing = sessionEntriesMap.get(cust.id);
    let pQty = '';
    let cQty = '';
    let gQty = '';
    let bQty = '';
    if (existing?.addons) {
      for (const a of existing.addons) {
        if (a.productId === 'prod_paneer') pQty = a.quantity > 0 ? a.quantity.toString() : '';
        if (a.productId === 'prod_curd') cQty = a.quantity > 0 ? a.quantity.toString() : '';
        if (a.productId === 'prod_ghee') gQty = a.quantity > 0 ? a.quantity.toString() : '';
        if (a.productId === 'prod_buttermilk') bQty = a.quantity > 0 ? a.quantity.toString() : '';
      }
    }
    setPaneerQty(pQty);
    setCurdQty(cQty);
    setGheeQty(gQty);
    setButterMilkQty(bQty);
    setAddonModalVisible(true);
  };

  const handleSaveAddons = async () => {
    Keyboard.dismiss();
    if (!addonCustomer) return;
    requireAuth(async () => {
      const existing = sessionEntriesMap.get(addonCustomer.id);
      const newAddons: import('../../types').DairyEntryAddon[] = [];
      let totalAddonsAmount = 0;

      const pQ = parseFloat(paneerQty) || 0;
      if (pQ > 0) {
        const rateP = productRates.prod_paneer || 360;
        const amt = pQ * rateP;
        newAddons.push({
          productId: 'prod_paneer',
          productName: 'पनीर (Paneer)',
          quantity: pQ,
          unit: 'kg',
          rate: rateP,
          totalAmount: amt
        });
        totalAddonsAmount += amt;
      }

      const cQ = parseFloat(curdQty) || 0;
      if (cQ > 0) {
        const rateC = productRates.prod_curd || 70;
        const amt = cQ * rateC;
        newAddons.push({
          productId: 'prod_curd',
          productName: 'दही (Curd)',
          quantity: cQ,
          unit: 'kg',
          rate: rateC,
          totalAmount: amt
        });
        totalAddonsAmount += amt;
      }

      const gQ = parseFloat(gheeQty) || 0;
      if (gQ > 0) {
        const rateG = productRates.prod_ghee || 700;
        const amt = gQ * rateG;
        newAddons.push({
          productId: 'prod_ghee',
          productName: 'देसी घी (Ghee)',
          quantity: gQ,
          unit: 'kg',
          rate: rateG,
          totalAmount: amt
        });
        totalAddonsAmount += amt;
      }

      const bQ = parseFloat(butterMilkQty) || 0;
      if (bQ > 0) {
        const rateB = productRates.prod_buttermilk || 20;
        const amt = bQ * rateB;
        newAddons.push({
          productId: 'prod_buttermilk',
          productName: 'छाछ (Buttermilk)',
          quantity: bQ,
          unit: 'pkt',
          rate: rateB,
          totalAmount: amt
        });
        totalAddonsAmount += amt;
      }

      const milkAmt = existing ? existing.amount : 0;
      const totalDayAmt = milkAmt + totalAddonsAmount;

      const entry: MilkEntry = {
        id: existing ? existing.id : `entry_${selectedDate}_${activeSession}_${addonCustomer.id}_${Date.now()}`,
        supplierId: supplier?.id || 'supp_default',
        customerId: addonCustomer.id,
        customerName: addonCustomer.name,
        date: selectedDate,
        session: activeSession,
        milkType: existing ? existing.milkType : addonCustomer.milkType,
        quantityLitres: existing ? existing.quantityLitres : 0,
        ratePerLitre: existing ? existing.ratePerLitre : addonCustomer.ratePerLitre,
        amount: milkAmt,
        totalDayAmount: totalDayAmt,
        isPacketMilk: addonCustomer.isPacketMilk,
        packetBrand: addonCustomer.packetBrand,
        packetVariant: addonCustomer.packetVariant,
        addons: newAddons,
        isPaid: existing ? existing.isPaid : false,
        notes: existing?.notes || '',
        createdAt: existing ? existing.createdAt : Date.now()
      };

      await StorageService.saveMilkEntry(entry);
      await refreshMilkEntries();
      CardSyncService.syncCustomerCard(addonCustomer.id, supplier, customers, [...milkEntries.filter(e => e.id !== entry.id), entry], payments);
      setAddonModalVisible(false);
    });
  };

  const togglePaidStatus = async (entry: MilkEntry) => {
    requireAuth(async () => {
      const updated: MilkEntry = {
        ...entry,
        isPaid: !entry.isPaid
      };
      await StorageService.saveMilkEntry(updated);
      await refreshMilkEntries();
      CardSyncService.syncCustomerCard(entry.customerId, supplier, customers, [...milkEntries.filter(e => e.id !== entry.id), updated], payments);
    });
  };

  // --- SUB-SUPPLIER INWARD MILK ACTIONS ---
  const handleDeleteInwardEntry = (entry: MilkInwardEntry, subName: string) => {
    requireAuth(() => {
      confirmAction(
        lang === 'hi' ? 'आवक एंट्री हटाएं (Delete Inward)' : 'Delete Inward Entry',
        lang === 'hi'
          ? `क्या आप ${subName} की ${activeSession} की आवक एंट्री हटाना चाहते हैं?`
          : `Delete inward entry for ${subName} (${activeSession})?`,
        async () => {
          await StorageService.deleteMilkInwardEntry(entry.id, supplier?.id);
          await refreshMilkInwardEntries();
        },
        lang === 'hi' ? '🗑️ हटाएं (Delete)' : 'Delete',
        lang === 'hi' ? 'रद्द करें (Cancel)' : 'Cancel',
        true
      );
    });
  };

  const handleQuickAddSubDefault = async (sub: SubSupplier) => {
    requireAuth(async () => {
      const existing = inwardEntriesMap.get(sub.id);
      if (existing) {
        handleDeleteInwardEntry(existing, sub.name);
        return;
      }

      const newEntry: MilkInwardEntry = {
        id: `inward_${selectedDate}_${activeSession}_${sub.id}_${Date.now()}`,
        supplierId: supplier?.id || 'supp_default',
        subSupplierId: sub.id,
        subSupplierName: sub.name,
        date: selectedDate,
        session: activeSession,
        milkType: sub.milkType,
        quantityLitres: sub.defaultLitres,
        ratePerLitre: sub.ratePerLitre,
        amount: sub.defaultLitres * sub.ratePerLitre,
        isPaid: false,
        createdAt: Date.now()
      };

      await StorageService.saveMilkInwardEntry(newEntry);
      await refreshMilkInwardEntries();
    });
  };

  const handleBulkFillAllInward = () => {
    Keyboard.dismiss();
    requireAuth(() => {
      const activeSubs = subSuppliers.filter(s => !s.isDeleted);
      const unrecordedSubs = activeSubs.filter(s => !inwardEntriesMap.has(s.id));
      if (unrecordedSubs.length === 0) {
        showAlert(
          lang === 'hi' ? 'सबका दूध दर्ज है' : 'All Recorded',
          lang === 'hi'
            ? `सभी ${activeSubs.length} विक्रेताओं का ${activeSession} का दूध पहले से दर्ज किया जा चुका है!`
            : `All ${activeSubs.length} vendors already recorded for ${activeSession}!`
        );
        return;
      }

      const sessionLabel = activeSession === 'Morning' ? '🌅 सुबह (Morning)' : activeSession === 'Evening' ? '🌇 शाम (Evening)' : '🕒 कस्टम (Custom)';

      confirmAction(
        lang === 'hi' ? 'सभी विक्रेताओं का आवक दूध मार्क करें' : 'Mark All Inward Milk',
        lang === 'hi'
          ? `क्या आप शेष सभी ${unrecordedSubs.length} विक्रेताओं का डिफ़ॉल्ट आवक दूध दर्ज करना चाहते हैं?\n• कुल शेष विक्रेता: ${unrecordedSubs.length} लोग\n• समय: ${sessionLabel}\n• तारीख: ${formatToDisplayDate(selectedDate)}`
          : `Record default inward milk for all ${unrecordedSubs.length} vendors?\n• Session: ${sessionLabel}\n• Date: ${formatToDisplayDate(selectedDate)}`,
        async () => {
          const newEntries: MilkInwardEntry[] = unrecordedSubs.map(s => ({
            id: `inward_${selectedDate}_${activeSession}_${s.id}_${Date.now()}_${Math.random().toString(36).substring(7)}`,
            supplierId: supplier?.id || 'supp_default',
            subSupplierId: s.id,
            subSupplierName: s.name,
            date: selectedDate,
            session: activeSession,
            milkType: s.milkType,
            quantityLitres: s.defaultLitres,
            ratePerLitre: s.ratePerLitre,
            amount: s.defaultLitres * s.ratePerLitre,
            isPaid: false,
            createdAt: Date.now()
          }));
          await StorageService.saveMilkInwardEntriesBatch(newEntries);
          await refreshMilkInwardEntries();
        },
        lang === 'hi' ? `✓ सभी दर्ज करें (${unrecordedSubs.length})` : `✓ Record All (${unrecordedSubs.length})`,
        lang === 'hi' ? 'रद्द करें' : 'Cancel',
        false
      );
    });
  };

  const openCustomInwardModal = (sub: SubSupplier) => {
    Keyboard.dismiss();
    requireAuth(() => {
      const existing = inwardEntriesMap.get(sub.id);
      setSelectedSubSupplier(sub);
      setSubSession(activeSession);
      setSubMilkType(existing ? existing.milkType : sub.milkType);
      setSubLitres(existing ? existing.quantityLitres.toString() : sub.defaultLitres.toString());
      setSubRate(existing ? existing.ratePerLitre.toString() : sub.ratePerLitre.toString());
      setSubNotes(existing?.notes || '');
      setSubModalVisible(true);
    });
  };

  const handleSaveInwardModalEntry = async () => {
    Keyboard.dismiss();
    requireAuth(async () => {
      if (!selectedSubSupplier) return;
      const qty = parseFloat(subLitres) || 0;
      const rateVal = parseFloat(subRate) || 0;

      if (qty <= 0) {
        showAlert(lang === 'hi' ? 'अमान्य मात्रा' : 'Validation Error', lang === 'hi' ? 'कृपया दूध की सही मात्रा दर्ज करें।' : 'Please enter a valid milk quantity.');
        return;
      }

      const existing = inwardEntriesMap.get(selectedSubSupplier.id);
      const entry: MilkInwardEntry = {
        id: existing ? existing.id : `inward_${selectedDate}_${subSession}_${selectedSubSupplier.id}_${Date.now()}`,
        supplierId: supplier?.id || 'supp_default',
        subSupplierId: selectedSubSupplier.id,
        subSupplierName: selectedSubSupplier.name,
        date: selectedDate,
        session: subSession,
        milkType: subMilkType,
        quantityLitres: qty,
        ratePerLitre: rateVal,
        amount: qty * rateVal,
        isPaid: existing ? existing.isPaid : false,
        notes: subNotes.trim(),
        createdAt: existing ? existing.createdAt : Date.now()
      };

      await StorageService.saveMilkInwardEntry(entry);
      await refreshMilkInwardEntries();
      setSubModalVisible(false);
    });
  };

  const toggleInwardPaidStatus = async (entry: MilkInwardEntry) => {
    requireAuth(async () => {
      const updated: MilkInwardEntry = {
        ...entry,
        isPaid: !entry.isPaid
      };
      await StorageService.saveMilkInwardEntry(updated);
      await refreshMilkInwardEntries();
    });
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['left', 'right']}>
      <View style={styles.container}>
        {/* Register Mode Switcher: Deliveries (Sales) vs Procurement (Inward) */}
        <View style={styles.registerToggleRow}>
          <TouchableOpacity
            style={[styles.registerToggleBtn, registerMode === 'delivery' && styles.registerToggleBtnActive]}
            onPress={() => { setRegisterMode('delivery'); setSearchFilter(''); }}
            activeOpacity={0.8}
          >
            <Text style={[styles.registerToggleText, registerMode === 'delivery' && styles.registerToggleTextActive]}>
              📤 {lang === 'hi' ? 'दूध बिक्री (Deliveries)' : 'Deliveries (Sales)'} ({customers.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.registerToggleBtn, registerMode === 'procurement' && styles.registerToggleBtnActive]}
            onPress={() => { setRegisterMode('procurement'); setSearchFilter(''); }}
            activeOpacity={0.8}
          >
            <Text style={[styles.registerToggleText, registerMode === 'procurement' && styles.registerToggleTextActive]}>
              📥 {lang === 'hi' ? 'दूध खरीद (आवक)' : 'Procurement (Inward)'} ({subSuppliers.length})
            </Text>
          </TouchableOpacity>
        </View>

        {/* Date Selector Header */}
        <View style={styles.dateHeader}>
          <TouchableOpacity
            onPress={() => changeDateBy(-1)}
            style={styles.dateNavBtn}
            activeOpacity={0.7}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Text style={styles.dateNavText}>◀ Prev</Text>
          </TouchableOpacity>

          <View style={styles.dateDisplay}>
            <Text style={styles.dateText}>{formatToDisplayDate(selectedDate)}</Text>
          </View>

          <TouchableOpacity
            onPress={() => changeDateBy(1)}
            style={styles.dateNavBtn}
            activeOpacity={0.7}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Text style={styles.dateNavText}>Next ▶</Text>
          </TouchableOpacity>
        </View>

        {/* Session Switcher */}
        <View style={styles.sessionToggleRow}>
          <TouchableOpacity
            style={[styles.sessionTab, activeSession === 'Morning' && styles.sessionTabActive]}
            onPress={() => setActiveSession('Morning')}
            activeOpacity={0.7}
            hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
          >
            <Text style={[styles.sessionTabText, activeSession === 'Morning' && styles.sessionTabTextActive]}>
              🌅 Morning (सुबह)
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.sessionTab, activeSession === 'Evening' && styles.sessionTabActive]}
            onPress={() => setActiveSession('Evening')}
            activeOpacity={0.7}
            hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
          >
            <Text style={[styles.sessionTabText, activeSession === 'Evening' && styles.sessionTabTextActive]}>
              🌇 Evening (शाम)
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.sessionTab, activeSession === 'Custom' && styles.sessionTabActive]}
            onPress={() => setActiveSession('Custom')}
            activeOpacity={0.7}
            hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
          >
            <Text style={[styles.sessionTabText, activeSession === 'Custom' && styles.sessionTabTextActive]}>
              🕒 Custom
            </Text>
          </TouchableOpacity>
        </View>

        {/* Session KPI Summary Banner */}
        {registerMode === 'delivery' ? (
          <View style={styles.kpiBanner}>
            <View style={styles.kpiCol}>
              <Text style={styles.kpiLabel}>Delivered</Text>
              <Text style={styles.kpiValue}>{stats.count} / {customers.length}</Text>
            </View>
            <View style={styles.kpiDivider} />
            <View style={styles.kpiCol}>
              <Text style={styles.kpiLabel}>Total Milk</Text>
              <Text style={styles.kpiValue}>{stats.totalLitres.toFixed(1)} L</Text>
              <Text style={styles.kpiSub}>
                🐄 {stats.cowQty.toFixed(1)}L | 🐃 {stats.buffaloQty.toFixed(1)}L{stats.packetQty > 0 ? ` | 📦 ${stats.packetQty.toFixed(1)}L` : ''}
              </Text>
            </View>
            <View style={styles.kpiDivider} />
            <View style={styles.kpiCol}>
              <Text style={styles.kpiLabel}>Session Total</Text>
              <Text style={[styles.kpiValue, { color: '#059669' }]}>₹{stats.totalAmt.toFixed(0)}</Text>
            </View>
          </View>
        ) : (
          <View style={[styles.kpiBanner, { borderColor: '#fed7aa', backgroundColor: '#fffaf5' }]}>
            <View style={styles.kpiCol}>
              <Text style={[styles.kpiLabel, { color: '#c2410c' }]}>{lang === 'hi' ? 'आवक प्राप्त' : 'Received'}</Text>
              <Text style={[styles.kpiValue, { color: '#c2410c' }]}>{inwardStats.count} / {subSuppliers.length}</Text>
            </View>
            <View style={[styles.kpiDivider, { backgroundColor: '#fed7aa' }]} />
            <View style={styles.kpiCol}>
              <Text style={[styles.kpiLabel, { color: '#c2410c' }]}>{lang === 'hi' ? 'कुल खरीद दूध' : 'Total Inward'}</Text>
              <Text style={[styles.kpiValue, { color: '#0f172a' }]}>{inwardStats.totalLitres.toFixed(1)} L</Text>
              <Text style={styles.kpiSub}>🐄 {inwardStats.cowQty.toFixed(1)}L | 🐃 {inwardStats.buffaloQty.toFixed(1)}L</Text>
            </View>
            <View style={[styles.kpiDivider, { backgroundColor: '#fed7aa' }]} />
            <View style={styles.kpiCol}>
              <Text style={[styles.kpiLabel, { color: '#c2410c' }]}>{lang === 'hi' ? 'खरीद लागत' : 'Purchase Cost'}</Text>
              <Text style={[styles.kpiValue, { color: '#ea580c' }]}>₹{inwardStats.totalAmt.toFixed(0)}</Text>
            </View>
          </View>
        )}

        {/* Fast Action Row: Search & "Mark All" Bulk Fill Button */}
        <View style={styles.fastActionRow}>
          <TextInput
            style={styles.searchInput}
            placeholder={
              registerMode === 'delivery'
                ? (lang === 'hi' ? `ग्राहक खोजें (${customers.length})...` : `Search ${customers.length} customers...`)
                : (lang === 'hi' ? `विक्रेता / किसान खोजें (${subSuppliers.length})...` : `Search ${subSuppliers.length} vendors...`)
            }
            placeholderTextColor="#94a3b8"
            value={searchFilter}
            onChangeText={setSearchFilter}
          />
          <TouchableOpacity
            style={[styles.bulkFillBtn, registerMode === 'procurement' && { backgroundColor: '#ea580c' }]}
            onPress={registerMode === 'delivery' ? handleBulkFillAll : handleBulkFillAllInward}
            activeOpacity={0.8}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          >
            <Text style={styles.bulkFillBtnText}>⚡ {lang === 'hi' ? 'सबका मार्क करें' : 'Mark All'}</Text>
          </TouchableOpacity>
        </View>

        {/* Register List */}
        {registerMode === 'delivery' ? (
          <FlatList
            data={filteredCustomers}
            keyExtractor={item => item.id}
            contentContainerStyle={styles.listContent}
            keyboardShouldPersistTaps="always"
            keyboardDismissMode="on-drag"
            initialNumToRender={15}
            maxToRenderPerBatch={20}
            windowSize={10}
            removeClippedSubviews={true}
            renderItem={({ item, index }) => {
              const entry = sessionEntriesMap.get(item.id);
              const isDelivered = !!entry;
              const entryAddons = entry?.addons || [];
              const entryAddonsTotal = entryAddons.reduce((sum, a) => sum + (a.totalAmount || 0), 0);
              const displayAmt = entry
                ? (entry.totalDayAmount != null ? entry.totalDayAmount : (entry.amount + entryAddonsTotal))
                : 0;

              return (
                <View style={[styles.rowCard, isDelivered && styles.rowCardDelivered]}>
                  <View style={styles.rowLeft}>
                    <View style={[styles.indexBadge, isDelivered && styles.indexBadgeDelivered]}>
                      <Text style={[styles.indexText, isDelivered && styles.indexTextDelivered]}>
                        {index + 1}
                      </Text>
                    </View>
                    <View style={{ flex: 1, marginLeft: 10 }}>
                      <Text style={styles.rowCustName} numberOfLines={1}>{item.name}</Text>
                      <Text style={styles.rowCustSub}>
                        {item.isPacketMilk
                          ? `📦 ${item.packetBrand || 'Packet'} (${item.packetVariant || 'Milk'}) • ${item.defaultLitres}L @ ₹${item.ratePerLitre}`
                          : `${item.milkType === 'cow' ? '🐄 Cow' : '🐃 Buffalo'} • ${item.defaultLitres}L @ ₹${item.ratePerLitre}`}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.rowRight}>
                    {isDelivered ? (
                      <View style={styles.deliveredBox}>
                        <View style={{ alignItems: 'flex-end', marginRight: 8 }}>
                          <Text style={styles.deliveredQty}>{entry.quantityLitres} L</Text>
                          <Text style={styles.deliveredAmount}>₹{displayAmt.toFixed(0)}</Text>
                        </View>

                        {supplier?.settings?.enableDairyAddons && (
                          <TouchableOpacity
                            style={[styles.addonBadgeBtn, entryAddonsTotal > 0 && styles.addonBadgeBtnActive]}
                            onPress={() => openAddonModal(item)}
                            activeOpacity={0.7}
                            hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                          >
                            <Text style={[styles.addonBadgeText, entryAddonsTotal > 0 && styles.addonBadgeTextActive]}>
                              {entryAddonsTotal > 0 ? `🧀 ₹${entryAddonsTotal}` : '+ 🧀'}
                            </Text>
                          </TouchableOpacity>
                        )}

                        <TouchableOpacity
                          style={[styles.paidBtn, entry.isPaid ? styles.paidBtnActive : styles.paidBtnPending]}
                          onPress={() => togglePaidStatus(entry)}
                          activeOpacity={0.7}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <Text style={[styles.paidBtnText, entry.isPaid ? styles.paidBtnTextActive : styles.paidBtnTextPending]}>
                            {entry.isPaid ? '✓' : '₹'}
                          </Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={styles.editIconBtn}
                          onPress={() => openCustomEntryModal(item)}
                          activeOpacity={0.7}
                          hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
                        >
                          <Text style={styles.editIconText}>✏️</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={styles.deleteIconBtn}
                          onPress={() => handleDeleteEntry(entry, item.name)}
                          activeOpacity={0.7}
                          hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
                        >
                          <Text style={styles.deleteIconText}>🗑️</Text>
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <View style={styles.undeliveredBox}>
                        <TouchableOpacity
                          style={styles.quickAddBtn}
                          onPress={() => handleQuickAddDefault(item)}
                          activeOpacity={0.7}
                          hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                        >
                          <Text style={styles.quickAddBtnText}>+ {item.defaultLitres}L</Text>
                        </TouchableOpacity>

                        {supplier?.settings?.enableDairyAddons && (
                          <TouchableOpacity
                            style={styles.addonQuickBtn}
                            onPress={() => openAddonModal(item)}
                            activeOpacity={0.7}
                            hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                          >
                            <Text style={styles.addonQuickBtnText}>+ 🧀</Text>
                          </TouchableOpacity>
                        )}

                        <TouchableOpacity
                          style={styles.customQtyBtn}
                          onPress={() => openCustomEntryModal(item)}
                          activeOpacity={0.7}
                          hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                        >
                          <Text style={styles.customQtyBtnText}>Edit</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                </View>
              );
            }}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyEmoji}>👥</Text>
                <Text style={styles.emptyText}>
                  {lang === 'hi' ? 'कोई ग्राहक नहीं मिला।' : 'No matching customers found.'}
                </Text>
              </View>
            }
          />
        ) : (
          <FlatList
            data={filteredSubSuppliers}
            keyExtractor={item => item.id}
            contentContainerStyle={styles.listContent}
            keyboardShouldPersistTaps="always"
            keyboardDismissMode="on-drag"
            initialNumToRender={15}
            maxToRenderPerBatch={20}
            windowSize={10}
            removeClippedSubviews={true}
            renderItem={({ item, index }) => {
              const inwardEntry = inwardEntriesMap.get(item.id);
              const isInwardLogged = !!inwardEntry;

              return (
                <View style={[styles.rowCard, isInwardLogged && styles.rowCardInward]}>
                  <View style={styles.rowLeft}>
                    <View style={[styles.indexBadge, isInwardLogged && styles.indexBadgeInward]}>
                      <Text style={[styles.indexText, isInwardLogged && styles.indexTextInward]}>
                        {index + 1}
                      </Text>
                    </View>
                    <View style={{ flex: 1, marginLeft: 10 }}>
                      <Text style={styles.rowCustName} numberOfLines={1}>{item.name}</Text>
                      <Text style={styles.rowCustSub}>
                        {item.milkType === 'cow' ? '🐄 Cow' : '🐃 Buffalo'} • {item.defaultLitres}L @ ₹{item.ratePerLitre}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.rowRight}>
                    {isInwardLogged ? (
                      <View style={styles.deliveredBox}>
                        <View style={{ alignItems: 'flex-end', marginRight: 8 }}>
                          <Text style={[styles.deliveredQty, { color: '#ea580c' }]}>{inwardEntry.quantityLitres} L</Text>
                          <Text style={styles.deliveredAmount}>₹{inwardEntry.amount.toFixed(0)}</Text>
                        </View>

                        <TouchableOpacity
                          style={[styles.paidBtn, inwardEntry.isPaid ? styles.paidBtnActive : styles.paidBtnPending]}
                          onPress={() => toggleInwardPaidStatus(inwardEntry)}
                          activeOpacity={0.7}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <Text style={[styles.paidBtnText, inwardEntry.isPaid ? styles.paidBtnTextActive : styles.paidBtnTextPending]}>
                            {inwardEntry.isPaid ? '✓' : '₹'}
                          </Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={styles.editIconBtn}
                          onPress={() => openCustomInwardModal(item)}
                          activeOpacity={0.7}
                          hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
                        >
                          <Text style={styles.editIconText}>✏️</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={styles.deleteIconBtn}
                          onPress={() => handleDeleteInwardEntry(inwardEntry, item.name)}
                          activeOpacity={0.7}
                          hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
                        >
                          <Text style={styles.deleteIconText}>🗑️</Text>
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <View style={styles.undeliveredBox}>
                        <TouchableOpacity
                          style={[styles.quickAddBtn, { backgroundColor: '#ea580c' }]}
                          onPress={() => handleQuickAddSubDefault(item)}
                          activeOpacity={0.7}
                          hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                        >
                          <Text style={styles.quickAddBtnText}>+ {item.defaultLitres}L</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={styles.customQtyBtn}
                          onPress={() => openCustomInwardModal(item)}
                          activeOpacity={0.7}
                          hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                        >
                          <Text style={styles.customQtyBtnText}>Edit</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                </View>
              );
            }}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyEmoji}>🚜</Text>
                <Text style={styles.emptyText}>
                  {lang === 'hi'
                    ? 'कोई विक्रेता / किसान नहीं मिला। ग्राहक मेनू से नया विक्रेता जोड़ें!'
                    : 'No vendors / farmers found. Add vendors from Customers screen!'}
                </Text>
              </View>
            }
          />
        )}

        {/* Detailed Customer Delivery Entry Modal */}
        <Modal
          visible={modalVisible}
          animationType="slide"
          transparent
          onRequestClose={() => setModalVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>
                {selectedCustomer?.name} — {session} ({formatToDisplayDate(selectedDate)})
              </Text>

              {selectedCustomer?.isPacketMilk ? (
                <View style={{ marginBottom: 10, padding: 8, backgroundColor: '#eff6ff', borderRadius: 8, borderWidth: 1, borderColor: '#bfdbfe' }}>
                  <Text style={{ fontSize: 13, fontWeight: 'bold', color: '#1e40af' }}>
                    📦 {selectedCustomer.packetBrand || 'Packet'} ({selectedCustomer.packetVariant || 'Milk'})
                  </Text>
                </View>
              ) : (
                <>
                  <Text style={styles.label}>{t.selectMilkType} *</Text>
                  <View style={styles.typeSelectorRow}>
                    <TouchableOpacity
                      style={[styles.typeOption, milkType === 'cow' && styles.typeOptionSelectedCow]}
                      onPress={() => setMilkType('cow')}
                      activeOpacity={0.7}
                      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                    >
                      <Text style={styles.typeOptionText}>🐄 {t.cowMilk}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.typeOption, milkType === 'buffalo' && styles.typeOptionSelectedBuffalo]}
                      onPress={() => setMilkType('buffalo')}
                      activeOpacity={0.7}
                      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                    >
                      <Text style={styles.typeOptionText}>🐃 {t.buffaloMilk}</Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}

              <View style={styles.rowTwoInputs}>
                <View style={{ flex: 1, marginRight: 8 }}>
                  <Text style={styles.label}>{t.litres}</Text>
                  <TextInput
                    style={styles.modalInput}
                    placeholder="e.g. 2.0"
                    placeholderTextColor="#94a3b8"
                    keyboardType="decimal-pad"
                    value={litres}
                    onChangeText={setLitres}
                  />
                </View>
                <View style={{ flex: 1, marginLeft: 8 }}>
                  <Text style={styles.label}>{t.ratePerLitre}</Text>
                  <TextInput
                    style={styles.modalInput}
                    placeholder="e.g. 55"
                    placeholderTextColor="#94a3b8"
                    keyboardType="numeric"
                    value={rate}
                    onChangeText={setRate}
                  />
                </View>
              </View>

              <Text style={styles.label}>Notes / Remarks (विवरण)</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="Optional remark"
                placeholderTextColor="#94a3b8"
                value={notes}
                onChangeText={setNotes}
              />

              <View style={styles.modalButtonRow}>
                {selectedCustomer && sessionEntriesMap.has(selectedCustomer.id) && (
                  <TouchableOpacity
                    style={styles.modalDeleteBtn}
                    onPress={() => {
                      const existing = sessionEntriesMap.get(selectedCustomer.id);
                      if (existing) {
                        setModalVisible(false);
                        handleDeleteEntry(existing, selectedCustomer.name);
                      }
                    }}
                    activeOpacity={0.7}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Text style={styles.modalDeleteBtnText}>🗑️ {t.deletePrompt || 'Delete'}</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={styles.modalCancelBtn}
                  onPress={() => setModalVisible(false)}
                  activeOpacity={0.7}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={styles.modalCancelBtnText}>{t.cancel}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.modalSaveBtn}
                  onPress={handleSaveModalEntry}
                  activeOpacity={0.8}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={styles.modalSaveBtnText}>{t.save}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* Modal: Dairy Add-on Products (Paneer, Curd, Ghee, Buttermilk) */}
        <Modal
          visible={addonModalVisible}
          animationType="slide"
          transparent
          onRequestClose={() => setAddonModalVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>
                🧀 {addonCustomer?.name} — {lang === 'hi' ? 'डेयरी उत्पाद' : 'Dairy Products'}
              </Text>
              <Text style={{ fontSize: 12, color: '#64748b', marginBottom: 12 }}>
                {activeSession} • {formatToDisplayDate(selectedDate)}
              </Text>

              {/* Paneer Input */}
              <View style={styles.addonInputRow}>
                <View style={{ flex: 1.4 }}>
                  <Text style={styles.addonProdTitle}>🧀 पनीर (Paneer)</Text>
                  <Text style={styles.addonProdRate}>₹{productRates.prod_paneer || 360} / kg</Text>
                </View>
                <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <TextInput
                    style={styles.addonNumberInput}
                    placeholder="0.0"
                    placeholderTextColor="#94a3b8"
                    keyboardType="decimal-pad"
                    value={paneerQty}
                    onChangeText={setPaneerQty}
                  />
                  <Text style={styles.addonUnitText}>kg</Text>
                </View>
                <Text style={styles.addonSubtotalText}>
                  ₹{((parseFloat(paneerQty) || 0) * (productRates.prod_paneer || 360)).toFixed(0)}
                </Text>
              </View>

              {/* Curd / Dahi Input */}
              <View style={styles.addonInputRow}>
                <View style={{ flex: 1.4 }}>
                  <Text style={styles.addonProdTitle}>🥣 ताजा दही (Curd)</Text>
                  <Text style={styles.addonProdRate}>₹{productRates.prod_curd || 70} / kg</Text>
                </View>
                <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <TextInput
                    style={styles.addonNumberInput}
                    placeholder="0.0"
                    placeholderTextColor="#94a3b8"
                    keyboardType="decimal-pad"
                    value={curdQty}
                    onChangeText={setCurdQty}
                  />
                  <Text style={styles.addonUnitText}>kg</Text>
                </View>
                <Text style={styles.addonSubtotalText}>
                  ₹{((parseFloat(curdQty) || 0) * (productRates.prod_curd || 70)).toFixed(0)}
                </Text>
              </View>

              {/* Desi Ghee Input */}
              <View style={styles.addonInputRow}>
                <View style={{ flex: 1.4 }}>
                  <Text style={styles.addonProdTitle}>🧈 देसी घी (Ghee)</Text>
                  <Text style={styles.addonProdRate}>₹{productRates.prod_ghee || 700} / kg</Text>
                </View>
                <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <TextInput
                    style={styles.addonNumberInput}
                    placeholder="0.0"
                    placeholderTextColor="#94a3b8"
                    keyboardType="decimal-pad"
                    value={gheeQty}
                    onChangeText={setGheeQty}
                  />
                  <Text style={styles.addonUnitText}>kg</Text>
                </View>
                <Text style={styles.addonSubtotalText}>
                  ₹{((parseFloat(gheeQty) || 0) * (productRates.prod_ghee || 700)).toFixed(0)}
                </Text>
              </View>

              {/* Buttermilk / Chhachh Input */}
              <View style={styles.addonInputRow}>
                <View style={{ flex: 1.4 }}>
                  <Text style={styles.addonProdTitle}>🥛 छाछ (Buttermilk)</Text>
                  <Text style={styles.addonProdRate}>₹{productRates.prod_buttermilk || 20} / pkt</Text>
                </View>
                <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <TextInput
                    style={styles.addonNumberInput}
                    placeholder="0"
                    placeholderTextColor="#94a3b8"
                    keyboardType="numeric"
                    value={butterMilkQty}
                    onChangeText={setButterMilkQty}
                  />
                  <Text style={styles.addonUnitText}>pkt</Text>
                </View>
                <Text style={styles.addonSubtotalText}>
                  ₹{((parseFloat(butterMilkQty) || 0) * (productRates.prod_buttermilk || 20)).toFixed(0)}
                </Text>
              </View>

              {/* Total Addons Summary */}
              <View style={styles.addonTotalBar}>
                <Text style={styles.addonTotalBarLabel}>{lang === 'hi' ? 'उत्पाद कुल जोड़:' : 'Total Addons:'}</Text>
                <Text style={styles.addonTotalBarValue}>
                  ₹{(
                    (parseFloat(paneerQty) || 0) * (productRates.prod_paneer || 360) +
                    (parseFloat(curdQty) || 0) * (productRates.prod_curd || 70) +
                    (parseFloat(gheeQty) || 0) * (productRates.prod_ghee || 700) +
                    (parseFloat(butterMilkQty) || 0) * (productRates.prod_buttermilk || 20)
                  ).toFixed(0)}
                </Text>
              </View>

              <View style={styles.modalButtonRow}>
                <TouchableOpacity
                  style={styles.modalCancelBtn}
                  onPress={() => setAddonModalVisible(false)}
                  activeOpacity={0.7}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={styles.modalCancelBtnText}>{t.cancel}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.modalSaveBtn}
                  onPress={handleSaveAddons}
                  activeOpacity={0.8}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={styles.modalSaveBtnText}>{lang === 'hi' ? 'सुरक्षित करें ✓' : 'Save Addons ✓'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* Detailed Sub-Supplier Inward Milk Entry Modal */}
        <Modal
          visible={subModalVisible}
          animationType="slide"
          transparent
          onRequestClose={() => setSubModalVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>
                🚜 {selectedSubSupplier?.name} — {subSession} ({formatToDisplayDate(selectedDate)})
              </Text>

              <Text style={styles.label}>{lang === 'hi' ? 'दूध का प्रकार *' : 'Milk Type *'}</Text>
              <View style={styles.typeSelectorRow}>
                <TouchableOpacity
                  style={[styles.typeOption, subMilkType === 'cow' && styles.typeOptionSelectedCow]}
                  onPress={() => setSubMilkType('cow')}
                  activeOpacity={0.7}
                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                >
                  <Text style={styles.typeOptionText}>🐄 {t.cowMilk}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.typeOption, subMilkType === 'buffalo' && styles.typeOptionSelectedBuffalo]}
                  onPress={() => setSubMilkType('buffalo')}
                  activeOpacity={0.7}
                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                >
                  <Text style={styles.typeOptionText}>🐃 {t.buffaloMilk}</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.rowTwoInputs}>
                <View style={{ flex: 1, marginRight: 8 }}>
                  <Text style={styles.label}>{lang === 'hi' ? 'खरीद मात्रा (L)' : 'Inward Litres (L)'}</Text>
                  <TextInput
                    style={styles.modalInput}
                    placeholder="e.g. 5.0"
                    placeholderTextColor="#94a3b8"
                    keyboardType="decimal-pad"
                    value={subLitres}
                    onChangeText={setSubLitres}
                  />
                </View>
                <View style={{ flex: 1, marginLeft: 8 }}>
                  <Text style={styles.label}>{lang === 'hi' ? 'खरीद भाव (₹/L)' : 'Purchase Rate (₹/L)'}</Text>
                  <TextInput
                    style={styles.modalInput}
                    placeholder="e.g. 45"
                    placeholderTextColor="#94a3b8"
                    keyboardType="numeric"
                    value={subRate}
                    onChangeText={setSubRate}
                  />
                </View>
              </View>

              <Text style={styles.label}>{lang === 'hi' ? 'विवरण / नोट्स' : 'Notes / Remarks'}</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="Optional remark / कोई विशेष टिप्पणी"
                placeholderTextColor="#94a3b8"
                value={subNotes}
                onChangeText={setSubNotes}
              />

              <View style={styles.modalButtonRow}>
                {selectedSubSupplier && inwardEntriesMap.has(selectedSubSupplier.id) && (
                  <TouchableOpacity
                    style={styles.modalDeleteBtn}
                    onPress={() => {
                      const existing = inwardEntriesMap.get(selectedSubSupplier.id);
                      if (existing) {
                        setSubModalVisible(false);
                        handleDeleteInwardEntry(existing, selectedSubSupplier.name);
                      }
                    }}
                    activeOpacity={0.7}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Text style={styles.modalDeleteBtnText}>🗑️ {t.deletePrompt || 'Delete'}</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={styles.modalCancelBtn}
                  onPress={() => setSubModalVisible(false)}
                  activeOpacity={0.7}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={styles.modalCancelBtnText}>{t.cancel}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalSaveBtn, { backgroundColor: '#ea580c' }]}
                  onPress={handleSaveInwardModalEntry}
                  activeOpacity={0.8}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={styles.modalSaveBtnText}>{t.save}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#f8fafc' },
  container: { flex: 1, padding: 14 },
  registerToggleRow: {
    flexDirection: 'row',
    backgroundColor: '#e2e8f0',
    borderRadius: 10,
    padding: 3,
    marginBottom: 10
  },
  registerToggleBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8
  },
  registerToggleBtnActive: {
    backgroundColor: '#ffffff',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2
  },
  registerToggleText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#64748b'
  },
  registerToggleTextActive: {
    color: '#0f172a',
    fontWeight: '700'
  },
  dateHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 10
  },
  dateNavBtn: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 8, backgroundColor: '#f1f5f9' },
  dateNavText: { fontSize: 13, fontWeight: 'bold', color: '#0284c7' },
  dateDisplay: { alignItems: 'center' },
  dateText: { fontSize: 16, fontWeight: 'bold', color: '#0f172a' },
  sessionToggleRow: {
    flexDirection: 'row',
    backgroundColor: '#e2e8f0',
    borderRadius: 10,
    padding: 3,
    marginBottom: 10
  },
  sessionTab: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 8 },
  sessionTabActive: { backgroundColor: '#ffffff', elevation: 2 },
  sessionTabText: { fontSize: 11, color: '#64748b', fontWeight: '600' },
  sessionTabTextActive: { color: '#0284c7', fontWeight: 'bold' },
  kpiBanner: {
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 10,
    alignItems: 'center'
  },
  kpiCol: { flex: 1, alignItems: 'center' },
  kpiDivider: { width: 1, height: 32, backgroundColor: '#e2e8f0' },
  kpiLabel: { fontSize: 10, color: '#64748b', fontWeight: '600', textTransform: 'uppercase' },
  kpiValue: { fontSize: 15, fontWeight: 'bold', color: '#0f172a', marginTop: 2 },
  kpiSub: { fontSize: 9, color: '#94a3b8', marginTop: 1 },
  fastActionRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  searchInput: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    color: '#0f172a'
  },
  bulkFillBtn: {
    backgroundColor: '#059669',
    paddingHorizontal: 16,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center'
  },
  bulkFillBtnText: { color: '#ffffff', fontWeight: 'bold', fontSize: 13 },
  listContent: { paddingBottom: 30 },
  rowCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0'
  },
  rowCardDelivered: {
    borderColor: '#bbf7d0',
    backgroundColor: '#f0fdf4'
  },
  rowCardInward: {
    borderColor: '#fed7aa',
    backgroundColor: '#fffaf5'
  },
  rowLeft: { flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 10 },
  indexBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center'
  },
  indexBadgeDelivered: { backgroundColor: '#dcfce7' },
  indexBadgeInward: { backgroundColor: '#ffedd5' },
  indexText: { fontSize: 11, fontWeight: 'bold', color: '#64748b' },
  indexTextDelivered: { color: '#16a34a' },
  indexTextInward: { color: '#ea580c' },
  rowCustName: { fontSize: 14, fontWeight: '700', color: '#0f172a' },
  rowCustSub: { fontSize: 11, color: '#64748b', marginTop: 2 },
  rowRight: { flexDirection: 'row', alignItems: 'center' },
  undeliveredBox: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  quickAddBtn: {
    backgroundColor: '#0284c7',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8
  },
  quickAddBtnText: { color: '#ffffff', fontWeight: 'bold', fontSize: 12 },
  customQtyBtn: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#cbd5e1'
  },
  customQtyBtnText: { fontSize: 11, color: '#475569', fontWeight: '600' },
  deliveredBox: { flexDirection: 'row', alignItems: 'center' },
  deliveredQty: { fontSize: 13, fontWeight: 'bold', color: '#059669' },
  deliveredAmount: { fontSize: 11, color: '#64748b', fontWeight: '600' },
  paidBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 6
  },
  paidBtnActive: { backgroundColor: '#22c55e' },
  paidBtnPending: { backgroundColor: '#fef08a' },
  paidBtnText: { fontSize: 12, fontWeight: 'bold' },
  paidBtnTextActive: { color: '#ffffff' },
  paidBtnTextPending: { color: '#854d0e' },
  editIconBtn: { padding: 8, marginLeft: 2 },
  editIconText: { fontSize: 14 },
  deleteIconBtn: {
    padding: 8,
    marginLeft: 2,
    borderRadius: 8,
    backgroundColor: '#fef2f2'
  },
  deleteIconText: { fontSize: 14 },
  emptyContainer: { alignItems: 'center', marginTop: 50 },
  emptyEmoji: { fontSize: 36, marginBottom: 8 },
  emptyText: { color: '#94a3b8', fontSize: 14 },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 20
  },
  modalContent: { backgroundColor: '#ffffff', borderRadius: 16, padding: 20 },
  modalTitle: { fontSize: 16, fontWeight: 'bold', color: '#0f172a', marginBottom: 12 },
  label: { fontSize: 12, fontWeight: '600', color: '#475569', marginBottom: 4, marginTop: 8 },
  typeSelectorRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  typeOption: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    alignItems: 'center',
    backgroundColor: '#f8fafc'
  },
  typeOptionSelectedCow: { backgroundColor: '#fef3c7', borderColor: '#d97706' },
  typeOptionSelectedBuffalo: { backgroundColor: '#e0e7ff', borderColor: '#4338ca' },
  typeOptionText: { fontSize: 12, fontWeight: 'bold', color: '#1e293b' },
  rowTwoInputs: { flexDirection: 'row', marginTop: 6 },
  modalInput: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    backgroundColor: '#f8fafc',
    color: '#0f172a'
  },
  modalButtonRow: { flexDirection: 'row', gap: 10, marginTop: 18 },
  modalCancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    backgroundColor: '#f1f5f9'
  },
  modalCancelBtnText: { color: '#475569', fontWeight: '600' },
  modalSaveBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    backgroundColor: '#0284c7'
  },
  modalSaveBtnText: { color: '#ffffff', fontWeight: 'bold' },
  modalDeleteBtn: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 8,
    alignItems: 'center',
    backgroundColor: '#fee2e2',
    borderWidth: 1,
    borderColor: '#fca5a5'
  },
  modalDeleteBtnText: { color: '#dc2626', fontWeight: 'bold', fontSize: 13 },

  // Dairy Add-on Styles
  addonBadgeBtn: {
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    marginRight: 6
  },
  addonBadgeBtnActive: {
    backgroundColor: '#fef3c7',
    borderColor: '#f59e0b'
  },
  addonBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748b'
  },
  addonBadgeTextActive: {
    color: '#b45309'
  },
  addonQuickBtn: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#fef3c7',
    borderWidth: 1,
    borderColor: '#fde68a',
    marginRight: 6
  },
  addonQuickBtnText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#92400e'
  },
  addonInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9'
  },
  addonProdTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0f172a'
  },
  addonProdRate: {
    fontSize: 11,
    color: '#64748b'
  },
  addonNumberInput: {
    width: 60,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 5,
    fontSize: 13,
    fontWeight: '700',
    color: '#0f172a',
    textAlign: 'center'
  },
  addonUnitText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b'
  },
  addonSubtotalText: {
    flex: 0.8,
    fontSize: 13,
    fontWeight: '800',
    color: '#059669',
    textAlign: 'right'
  },
  addonTotalBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#ecfdf5',
    borderWidth: 1,
    borderColor: '#a7f3d0',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 12
  },
  addonTotalBarLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#065f46'
  },
  addonTotalBarValue: {
    fontSize: 16,
    fontWeight: '800',
    color: '#059669'
  }
});
