import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Modal,
  TextInput,
  Alert,
  Keyboard
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useApp } from '../../context/AppContext';
import { StorageService } from '../../services/storageService';
import { CardSyncService } from '../../services/cardSyncService';
import { MilkEntry, MilkType, SessionType, Customer } from '../../types';
import { confirmAction, showAlert } from '../../utils/alertUtils';
import { formatToDisplayDate } from '../../utils/dateUtils';

export const DailyRegisterScreen = () => {
  const { t, customers, milkEntries, refreshMilkEntries, payments, supplier, requireAuth } = useApp();
  
  const [selectedDate, setSelectedDate] = useState(() => {
    return new Date().toISOString().split('T')[0];
  });

  const [activeSession, setActiveSession] = useState<SessionType>('Morning');
  const [searchFilter, setSearchFilter] = useState('');

  // Single Entry Modal State
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [session, setSession] = useState<SessionType>('Morning');
  const [milkType, setMilkType] = useState<MilkType>('cow');
  const [litres, setLitres] = useState('');
  const [rate, setRate] = useState('');
  const [notes, setNotes] = useState('');

  const changeDateBy = (days: number) => {
    const parts = selectedDate.split('-').map(Number);
    const current = new Date(parts[0], parts[1] - 1, parts[2]);
    current.setDate(current.getDate() + days);
    const y = current.getFullYear();
    const m = String(current.getMonth() + 1).padStart(2, '0');
    const d = String(current.getDate()).padStart(2, '0');
    setSelectedDate(`${y}-${m}-${d}`);
  };


  const { sessionEntriesMap, stats } = useMemo(() => {
    const map = new Map<string, MilkEntry>();
    let cowQty = 0;
    let buffaloQty = 0;
    let totalAmt = 0;
    let count = 0;

    for (let i = 0; i < milkEntries.length; i++) {
      const e = milkEntries[i];
      if (!e.isDeleted && e.date === selectedDate && e.session === activeSession) {
        map.set(e.customerId, e);
        if (e.milkType === 'cow') cowQty += e.quantityLitres;
        else buffaloQty += e.quantityLitres;
        totalAmt += e.amount;
        count++;
      }
    }

    return {
      sessionEntriesMap: map,
      stats: {
        cowQty,
        buffaloQty,
        totalQty: cowQty + buffaloQty,
        totalLitres: cowQty + buffaloQty,
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

  const handleDeleteEntry = (entry: MilkEntry, customerName: string) => {
    requireAuth(() => {
      confirmAction(
        'एंट्री हटाएं (Delete Delivery)',
        `क्या आप ${customerName} की ${activeSession} की डिलीवरी एंट्री हटाना चाहते हैं?`,
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
        '🗑️ हटाएं (Delete)',
        'रद्द करें (Cancel)',
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
        amount: customer.defaultLitres * customer.ratePerLitre,
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
      const unrecordedCustomers = customers.filter(c => !sessionEntriesMap.has(c.id));
      if (unrecordedCustomers.length === 0) {
        showAlert('सबका दूध दर्ज है (All Recorded)', `सभी ${customers.length} ग्राहकों का ${activeSession} का दूध पहले से दर्ज किया जा चुका है!`);
        return;
      }

      const sessionLabel = activeSession === 'Morning' ? '🌅 सुबह (Morning)' : activeSession === 'Evening' ? '🌇 शाम (Evening)' : '🕒 कस्टम (Custom)';

      confirmAction(
        'सभी का दूध मार्क करें (Mark All Deliveries)',
        `क्या आप शेष सभी ${unrecordedCustomers.length} ग्राहकों का डिफ़ॉल्ट दूध दर्ज करना चाहते हैं?\n• कुल शेष ग्राहक: ${unrecordedCustomers.length} लोग\n• समय (Session): ${sessionLabel}\n• तारीख (Date): ${formatToDisplayDate(selectedDate)}`,
        async () => {

          const newEntries: MilkEntry[] = unrecordedCustomers.map(c => ({
            id: `entry_${selectedDate}_${activeSession}_${c.id}_${Date.now()}`,
            supplierId: supplier?.id || 'supp_default',
            customerId: c.id,
            customerName: c.name,
            date: selectedDate,
            session: activeSession,
            milkType: c.milkType,
            quantityLitres: c.defaultLitres,
            ratePerLitre: c.ratePerLitre,
            amount: c.defaultLitres * c.ratePerLitre,
            isPaid: false,
            createdAt: Date.now()
          }));
          await StorageService.saveMilkEntriesBatch(newEntries);
          await refreshMilkEntries();
          CardSyncService.syncAllCards(supplier, customers, [...milkEntries, ...newEntries], payments);
        },
        `✓ सभी दर्ज करें (${unrecordedCustomers.length})`,
        'रद्द करें (Cancel)',
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
        Alert.alert('Validation Error', 'Please enter a valid milk quantity.');
        return;
      }

      const existing = sessionEntriesMap.get(selectedCustomer.id);
      const entry: MilkEntry = {
        id: existing ? existing.id : `entry_${selectedDate}_${session}_${selectedCustomer.id}_${Date.now()}`,
        supplierId: supplier?.id || 'supp_default',
        customerId: selectedCustomer.id,
        customerName: selectedCustomer.name,
        date: selectedDate,
        session: session,
        milkType: milkType,
        quantityLitres: qty,
        ratePerLitre: rateVal,
        amount: qty * rateVal,
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

  return (
    <SafeAreaView style={styles.safeArea} edges={['left', 'right']}>
      <View style={styles.container}>
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
        <View style={styles.kpiBanner}>
          <View style={styles.kpiCol}>
            <Text style={styles.kpiLabel}>Delivered</Text>
            <Text style={styles.kpiValue}>{stats.count} / {customers.length}</Text>
          </View>
          <View style={styles.kpiDivider} />
          <View style={styles.kpiCol}>
            <Text style={styles.kpiLabel}>Total Milk</Text>
            <Text style={styles.kpiValue}>{stats.totalLitres.toFixed(1)} L</Text>
            <Text style={styles.kpiSub}>🐄 {stats.cowQty.toFixed(1)}L | 🐃 {stats.buffaloQty.toFixed(1)}L</Text>
          </View>
          <View style={styles.kpiDivider} />
          <View style={styles.kpiCol}>
            <Text style={styles.kpiLabel}>Session Total</Text>
            <Text style={[styles.kpiValue, { color: '#059669' }]}>₹{stats.totalAmt.toFixed(0)}</Text>
          </View>
        </View>

        {/* Fast Action Row: Search & "Mark All" Bulk Fill Button */}
        <View style={styles.fastActionRow}>
          <TextInput
            style={styles.searchInput}
            placeholder={`Search ${customers.length} customers...`}
            placeholderTextColor="#94a3b8"
            value={searchFilter}
            onChangeText={setSearchFilter}
          />
          <TouchableOpacity
            style={styles.bulkFillBtn}
            onPress={handleBulkFillAll}
            activeOpacity={0.8}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          >
            <Text style={styles.bulkFillBtnText}>⚡ Mark All</Text>
          </TouchableOpacity>
        </View>

        {/* Customer Register List */}
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

            return (
              <View style={[styles.rowCard, isDelivered && styles.rowCardDelivered]}>
                {/* Index & Customer Info */}
                <View style={styles.rowLeft}>
                  <View style={[styles.indexBadge, isDelivered && styles.indexBadgeDelivered]}>
                    <Text style={[styles.indexText, isDelivered && styles.indexTextDelivered]}>
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

                {/* Status and Action Buttons */}
                <View style={styles.rowRight}>
                  {isDelivered ? (
                    <View style={styles.deliveredBox}>
                      <View style={{ alignItems: 'flex-end', marginRight: 8 }}>
                        <Text style={styles.deliveredQty}>{entry.quantityLitres} L</Text>
                        <Text style={styles.deliveredAmount}>₹{entry.amount.toFixed(0)}</Text>
                      </View>

                      {/* Paid Toggle Button */}
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

                      {/* Edit Button */}
                      <TouchableOpacity
                        style={styles.editIconBtn}
                        onPress={() => openCustomEntryModal(item)}
                        activeOpacity={0.7}
                        hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
                      >
                        <Text style={styles.editIconText}>✏️</Text>
                      </TouchableOpacity>

                      {/* Delete Entry Button */}
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
                      {/* One-Tap Mark Delivery Button */}
                      <TouchableOpacity
                        style={styles.quickAddBtn}
                        onPress={() => handleQuickAddDefault(item)}
                        activeOpacity={0.7}
                        hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                      >
                        <Text style={styles.quickAddBtnText}>+ {item.defaultLitres}L</Text>
                      </TouchableOpacity>

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
              <Text style={styles.emptyText}>No matching customers found.</Text>
            </View>
          }
        />

        {/* Detailed Entry Modal */}
        <Modal visible={modalVisible} animationType="slide" transparent>
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>
                {selectedCustomer?.name} — {session} ({formatToDisplayDate(selectedDate)})
              </Text>

              {/* Milk Type */}
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
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#f8fafc' },
  container: { flex: 1, padding: 14 },
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
  indexText: { fontSize: 11, fontWeight: 'bold', color: '#64748b' },
  indexTextDelivered: { color: '#16a34a' },
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
  modalDeleteBtnText: { color: '#dc2626', fontWeight: 'bold', fontSize: 13 }
});
