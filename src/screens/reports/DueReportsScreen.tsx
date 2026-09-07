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
import { WhatsAppService } from '../../services/whatsappService';
import { Customer, CustomerDueSummary, Payment } from '../../types';

type PeriodType = '10' | '20' | '30' | 'all';
type DueFilterType = 'all' | 'dueOnly' | 'paidOnly';

export const DueReportsScreen = () => {
  const { t, customers, milkEntries, payments, refreshPayments, supplier } = useApp();
  const [selectedPeriod, setSelectedPeriod] = useState<PeriodType>('30');
  const [searchQuery, setSearchQuery] = useState('');
  const [dueFilter, setDueFilter] = useState<DueFilterType>('all');
  
  // Payment Modal State
  const [paymentModalVisible, setPaymentModalVisible] = useState(false);
  const [paymentCustomer, setPaymentCustomer] = useState<Customer | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [payNotes, setPayNotes] = useState('');

  const cutoffDate = useMemo(() => {
    if (selectedPeriod === 'all') return '2000-01-01';
    const days = parseInt(selectedPeriod, 10);
    const d = new Date();
    d.setDate(d.getDate() - days);
    return d.toISOString().split('T')[0];
  }, [selectedPeriod]);

  // All calculated due summaries for the selected period
  const allDueSummaries: CustomerDueSummary[] = useMemo(() => {
    return customers.map(cust => {
      const custEntries = milkEntries.filter(
        e => e.customerId === cust.id && e.date >= cutoffDate
      );
      const custPayments = payments.filter(
        p => p.customerId === cust.id && p.date >= cutoffDate
      );

      let totalLitresCow = 0;
      let totalLitresBuffalo = 0;
      let totalBilled = 0;

      custEntries.forEach(entry => {
        if (entry.milkType === 'cow') totalLitresCow += entry.quantityLitres;
        if (entry.milkType === 'buffalo') totalLitresBuffalo += entry.quantityLitres;
        totalBilled += entry.amount;
      });

      const totalPaid = custPayments.reduce((sum, p) => sum + p.amountPaid, 0);
      const netDue = Math.max(0, totalBilled - totalPaid);
      const unpaidCount = custEntries.filter(e => !e.isPaid).length;

      return {
        customer: cust,
        totalLitresCow,
        totalLitresBuffalo,
        totalLitres: totalLitresCow + totalLitresBuffalo,
        totalAmountBilled: totalBilled,
        totalPaid,
        netDue,
        unpaidEntriesCount: unpaidCount
      };
    });
  }, [customers, milkEntries, payments, cutoffDate]);

  // Filtered by Search Query (Name/Phone/Address) and Due Status
  const filteredSummaries = useMemo(() => {
    return allDueSummaries.filter(item => {
      // 1. Search Query
      const query = searchQuery.trim().toLowerCase();
      if (query) {
        const matchName = item.customer.name.toLowerCase().includes(query);
        const matchPhone = item.customer.phone.includes(query);
        const matchAddress = item.customer.address ? item.customer.address.toLowerCase().includes(query) : false;
        if (!matchName && !matchPhone && !matchAddress) return false;
      }

      // 2. Due status filter
      if (dueFilter === 'dueOnly' && item.netDue <= 0) return false;
      if (dueFilter === 'paidOnly' && item.netDue > 0) return false;

      return true;
    });
  }, [allDueSummaries, searchQuery, dueFilter]);

  const totalPeriodDue = useMemo(() => {
    return allDueSummaries.reduce((sum, item) => sum + item.netDue, 0);
  }, [allDueSummaries]);

  const totalPeriodBilled = useMemo(() => {
    return allDueSummaries.reduce((sum, item) => sum + item.totalAmountBilled, 0);
  }, [allDueSummaries]);

  const totalPeriodPaid = useMemo(() => {
    return allDueSummaries.reduce((sum, item) => sum + item.totalPaid, 0);
  }, [allDueSummaries]);

  const openPayModal = (cust: Customer) => {
    Keyboard.dismiss();
    setPaymentCustomer(cust);
    setPayAmount('');
    setPayNotes('Lump sum milk bill payment');
    setPaymentModalVisible(true);
  };

  const handleSavePayment = async () => {
    Keyboard.dismiss();
    if (!paymentCustomer) return;
    const amountVal = parseFloat(payAmount);
    if (isNaN(amountVal) || amountVal <= 0) {
      Alert.alert('Invalid Amount', 'Please enter a valid payment amount.');
      return;
    }

    const newPayment: Payment = {
      id: 'pay_' + Date.now(),
      supplierId: supplier?.id || 'supp_default',
      customerId: paymentCustomer.id,
      customerName: paymentCustomer.name,
      date: new Date().toISOString().split('T')[0],
      amountPaid: amountVal,
      notes: payNotes.trim(),
      createdAt: Date.now()
    };

    await StorageService.savePayment(newPayment);
    await refreshPayments();
    setPaymentModalVisible(false);
    Alert.alert('Success', `Payment of ₹${amountVal} recorded for ${paymentCustomer.name}.`);
  };

  const handleShareWhatsApp = async (summary: CustomerDueSummary) => {
    Keyboard.dismiss();
    const periodName =
      selectedPeriod === '10'
        ? 'Last 10 Days'
        : selectedPeriod === '20'
        ? 'Last 20 Days'
        : selectedPeriod === '30'
        ? 'Last 30 Days (Month)'
        : 'All Time Outstanding';

    try {
      await WhatsAppService.sendBillViaWhatsApp(
        summary.customer.phone,
        summary,
        supplier?.businessName || 'Dairy Milk Seller',
        periodName
      );
    } catch (e) {
      Alert.alert('Error', 'Could not launch WhatsApp.');
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        {/* Period Selector Tabs */}
        <View style={styles.periodTabs}>
          <TouchableOpacity
            style={[styles.tab, selectedPeriod === '10' && styles.tabActive]}
            onPress={() => setSelectedPeriod('10')}
            activeOpacity={0.7}
            hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
          >
            <Text style={[styles.tabText, selectedPeriod === '10' && styles.tabTextActive]}>
              {t.last10Days}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tab, selectedPeriod === '20' && styles.tabActive]}
            onPress={() => setSelectedPeriod('20')}
            activeOpacity={0.7}
            hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
          >
            <Text style={[styles.tabText, selectedPeriod === '20' && styles.tabTextActive]}>
              {t.last20Days}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tab, selectedPeriod === '30' && styles.tabActive]}
            onPress={() => setSelectedPeriod('30')}
            activeOpacity={0.7}
            hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
          >
            <Text style={[styles.tabText, selectedPeriod === '30' && styles.tabTextActive]}>
              {t.last30Days}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tab, selectedPeriod === 'all' && styles.tabActive]}
            onPress={() => setSelectedPeriod('all')}
            activeOpacity={0.7}
            hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
          >
            <Text style={[styles.tabText, selectedPeriod === 'all' && styles.tabTextActive]}>
              All Dues
            </Text>
          </TouchableOpacity>
        </View>

        {/* Total Summary Banner with Billed, Received and Net Due */}
        <View style={styles.summaryBanner}>
          <View style={styles.bannerRow}>
            <View style={styles.bannerItem}>
              <Text style={styles.bannerSubLabel}>Total Billed</Text>
              <Text style={styles.bannerSubAmount}>₹{totalPeriodBilled.toFixed(0)}</Text>
            </View>
            <View style={styles.bannerItemDivider} />
            <View style={styles.bannerItem}>
              <Text style={styles.bannerSubLabel}>Total Paid</Text>
              <Text style={styles.bannerSubAmount}>₹{totalPeriodPaid.toFixed(0)}</Text>
            </View>
            <View style={styles.bannerItemDivider} />
            <View style={styles.bannerItem}>
              <Text style={styles.bannerSubLabel}>Net Due</Text>
              <Text style={[styles.bannerSubAmount, { color: '#fef08a' }]}>₹{totalPeriodDue.toFixed(0)}</Text>
            </View>
          </View>
        </View>

        {/* Search Bar with Clear Button to find any customer easily */}
        <View style={styles.searchRow}>
          <TextInput
            style={styles.searchInput}
            placeholder={`🔍 Search customer name or phone...`}
            placeholderTextColor="#94a3b8"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity
              style={styles.clearSearchBtn}
              onPress={() => setSearchQuery('')}
              activeOpacity={0.7}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.clearSearchText}>✕</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Quick Filter Chips: All, Has Due (बकाया), Fully Paid (चुकता) */}
        <View style={styles.filterChipsRow}>
          <TouchableOpacity
            style={[styles.filterChip, dueFilter === 'all' && styles.filterChipActive]}
            onPress={() => setDueFilter('all')}
            activeOpacity={0.7}
          >
            <Text style={[styles.filterChipText, dueFilter === 'all' && styles.filterChipTextActive]}>
              All ({allDueSummaries.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.filterChip, dueFilter === 'dueOnly' && styles.filterChipActiveDue]}
            onPress={() => setDueFilter('dueOnly')}
            activeOpacity={0.7}
          >
            <Text style={[styles.filterChipText, dueFilter === 'dueOnly' && styles.filterChipTextActiveDue]}>
              🔴 Pending Due ({allDueSummaries.filter(d => d.netDue > 0).length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.filterChip, dueFilter === 'paidOnly' && styles.filterChipActivePaid]}
            onPress={() => setDueFilter('paidOnly')}
            activeOpacity={0.7}
          >
            <Text style={[styles.filterChipText, dueFilter === 'paidOnly' && styles.filterChipTextActivePaid]}>
              ✓ Settled ({allDueSummaries.filter(d => d.netDue <= 0).length})
            </Text>
          </TouchableOpacity>
        </View>

        {/* List of Customer Due Summaries */}
        <FlatList
          data={filteredSummaries}
          keyExtractor={item => item.customer.id}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="always"
          keyboardDismissMode="on-drag"
          initialNumToRender={15}
          maxToRenderPerBatch={20}
          windowSize={10}
          removeClippedSubviews={true}
          renderItem={({ item, index }) => (
            <View style={styles.dueCard}>
              <View style={styles.cardHeader}>
                <View style={{ flex: 1, marginRight: 8 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Text style={styles.custIndex}>{index + 1}. </Text>
                    <Text style={styles.custName} numberOfLines={1}>{item.customer.name}</Text>
                  </View>
                  <Text style={styles.custPhone}>📞 {item.customer.phone}</Text>
                  {item.customer.address ? (
                    <Text style={styles.custAddress} numberOfLines={1}>📍 {item.customer.address}</Text>
                  ) : null}
                </View>

                <View style={styles.netDueBox}>
                  <Text style={styles.netDueLabel}>Net Due</Text>
                  <Text style={[styles.netDueAmount, item.netDue > 0 ? styles.dueRed : styles.dueGreen]}>
                    ₹{item.netDue.toFixed(2)}
                  </Text>
                </View>
              </View>

              {/* Quantities delivered */}
              <View style={styles.qtyRow}>
                {item.totalLitresCow > 0 && (
                  <Text style={styles.qtyTag}>🐄 Cow: {item.totalLitresCow.toFixed(1)} L</Text>
                )}
                {item.totalLitresBuffalo > 0 && (
                  <Text style={styles.qtyTag}>🐃 Buffalo: {item.totalLitresBuffalo.toFixed(1)} L</Text>
                )}
                <Text style={styles.qtyTagTotal}>Total: {item.totalLitres.toFixed(1)} L</Text>
              </View>

              {/* Billed vs Paid */}
              <View style={styles.finRow}>
                <Text style={styles.finText}>Billed: ₹{item.totalAmountBilled.toFixed(0)}</Text>
                <Text style={styles.finText}>Paid: ₹{item.totalPaid.toFixed(0)}</Text>
              </View>

              {/* Action Buttons: WhatsApp Share & Record Payment */}
              <View style={styles.cardActions}>
                <TouchableOpacity
                  style={styles.payBtn}
                  onPress={() => openPayModal(item.customer)}
                  activeOpacity={0.7}
                  hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                >
                  <Text style={styles.payBtnText}>💵 {t.recordPayment}</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.whatsappBtn}
                  onPress={() => handleShareWhatsApp(item)}
                  activeOpacity={0.8}
                  hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                >
                  <Text style={styles.whatsappBtnText}>💬 {t.shareWhatsApp}</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyEmoji}>🔍</Text>
              <Text style={styles.emptyText}>
                No customers found matching "{searchQuery}".
              </Text>
              <TouchableOpacity
                style={styles.resetSearchBtn}
                onPress={() => { setSearchQuery(''); setDueFilter('all'); }}
              >
                <Text style={styles.resetSearchText}>Show All Customers</Text>
              </TouchableOpacity>
            </View>
          }
        />

        {/* Record Payment Modal */}
        <Modal visible={paymentModalVisible} animationType="slide" transparent>
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>
                Record Payment — {paymentCustomer?.name}
              </Text>

              <Text style={styles.label}>Amount Paid (₹) *</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="e.g. 500"
                placeholderTextColor="#94a3b8"
                keyboardType="numeric"
                value={payAmount}
                onChangeText={setPayAmount}
              />

              <Text style={styles.label}>Notes</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="e.g. Google Pay / Cash"
                placeholderTextColor="#94a3b8"
                value={payNotes}
                onChangeText={setPayNotes}
              />

              <View style={styles.modalButtonRow}>
                <TouchableOpacity
                  style={styles.modalCancelBtn}
                  onPress={() => setPaymentModalVisible(false)}
                  activeOpacity={0.7}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={styles.modalCancelBtnText}>{t.cancel}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.modalSaveBtn}
                  onPress={handleSavePayment}
                  activeOpacity={0.8}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={styles.modalSaveBtnText}>Save Payment</Text>
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
  periodTabs: {
    flexDirection: 'row',
    backgroundColor: '#e2e8f0',
    borderRadius: 10,
    padding: 3,
    marginBottom: 10
  },
  tab: { flex: 1, paddingVertical: 9, alignItems: 'center', borderRadius: 8 },
  tabActive: { backgroundColor: '#ffffff', elevation: 2 },
  tabText: { fontSize: 11, color: '#64748b', fontWeight: '600' },
  tabTextActive: { color: '#0284c7', fontWeight: 'bold' },
  summaryBanner: {
    backgroundColor: '#0284c7',
    borderRadius: 14,
    padding: 12,
    marginBottom: 10
  },
  bannerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  bannerItem: { flex: 1, alignItems: 'center' },
  bannerItemDivider: { width: 1, height: 28, backgroundColor: 'rgba(255,255,255,0.25)' },
  bannerSubLabel: { color: '#e0f2fe', fontSize: 11, fontWeight: '600' },
  bannerSubAmount: { color: '#ffffff', fontSize: 16, fontWeight: 'bold', marginTop: 2 },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    marginBottom: 8,
    paddingHorizontal: 12
  },
  searchInput: {
    flex: 1,
    paddingVertical: 10,
    fontSize: 14,
    color: '#0f172a'
  },
  clearSearchBtn: { padding: 6 },
  clearSearchText: { fontSize: 14, color: '#94a3b8', fontWeight: 'bold' },
  filterChipsRow: { flexDirection: 'row', gap: 6, marginBottom: 10 },
  filterChip: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 16,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0'
  },
  filterChipActive: { backgroundColor: '#0284c7', borderColor: '#0284c7' },
  filterChipActiveDue: { backgroundColor: '#fee2e2', borderColor: '#ef4444' },
  filterChipActivePaid: { backgroundColor: '#dcfce7', borderColor: '#22c55e' },
  filterChipText: { fontSize: 11, color: '#64748b', fontWeight: '600' },
  filterChipTextActive: { color: '#ffffff', fontWeight: 'bold' },
  filterChipTextActiveDue: { color: '#dc2626', fontWeight: 'bold' },
  filterChipTextActivePaid: { color: '#16a34a', fontWeight: 'bold' },
  listContent: { paddingBottom: 30 },
  dueCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0'
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  custIndex: { fontSize: 14, fontWeight: 'bold', color: '#94a3b8' },
  custName: { fontSize: 16, fontWeight: 'bold', color: '#0f172a' },
  custPhone: { fontSize: 12, color: '#64748b', marginTop: 2 },
  custAddress: { fontSize: 11, color: '#94a3b8', marginTop: 1 },
  netDueBox: { alignItems: 'flex-end' },
  netDueLabel: { fontSize: 11, color: '#64748b' },
  netDueAmount: { fontSize: 18, fontWeight: 'bold', marginTop: 1 },
  dueRed: { color: '#dc2626' },
  dueGreen: { color: '#16a34a' },
  qtyRow: { flexDirection: 'row', gap: 6, marginVertical: 8, flexWrap: 'wrap' },
  qtyTag: {
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    fontSize: 11,
    color: '#334155'
  },
  qtyTagTotal: {
    backgroundColor: '#e0f2fe',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    fontSize: 11,
    color: '#0284c7',
    fontWeight: 'bold'
  },
  finRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9'
  },
  finText: { fontSize: 12, color: '#64748b' },
  cardActions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  payBtn: {
    flex: 1,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center'
  },
  payBtnText: { fontSize: 12, fontWeight: '600', color: '#334155' },
  whatsappBtn: {
    flex: 1,
    backgroundColor: '#25D366',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center'
  },
  whatsappBtnText: { fontSize: 12, fontWeight: 'bold', color: '#ffffff' },
  emptyContainer: { alignItems: 'center', marginTop: 50 },
  emptyEmoji: { fontSize: 40, marginBottom: 8 },
  emptyText: { color: '#64748b', fontSize: 14, marginBottom: 12 },
  resetSearchBtn: {
    backgroundColor: '#0284c7',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8
  },
  resetSearchText: { color: '#ffffff', fontWeight: 'bold', fontSize: 13 },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 20
  },
  modalContent: { backgroundColor: '#ffffff', borderRadius: 16, padding: 20 },
  modalTitle: { fontSize: 16, fontWeight: 'bold', color: '#0f172a', marginBottom: 12 },
  label: { fontSize: 12, fontWeight: '600', color: '#475569', marginBottom: 4, marginTop: 8 },
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
  modalSaveBtnText: { color: '#ffffff', fontWeight: 'bold' }
});
