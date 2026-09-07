import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Modal,
  TextInput,
  Keyboard,
  ScrollView
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useApp } from '../../context/AppContext';
import { StorageService } from '../../services/storageService';
import { WhatsAppService, CustomerDateAuditItem } from '../../services/whatsappService';
import { Customer, CustomerDueSummary, Payment, MilkEntry, MilkType, SessionType } from '../../types';
import { showAlert, confirmAction } from '../../utils/alertUtils';

type PeriodType = '10' | '20' | '30' | 'all';
type DueFilterType = 'all' | 'dueOnly' | 'paidOnly';
type AuditFilterType = 'all' | 'missing' | 'delivered';

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const DueReportsScreen = () => {
  const { t, customers, milkEntries, refreshMilkEntries, payments, refreshPayments, supplier } = useApp();
  const [selectedPeriod, setSelectedPeriod] = useState<PeriodType>('30');
  const [searchQuery, setSearchQuery] = useState('');
  const [dueFilter, setDueFilter] = useState<DueFilterType>('all');
  
  // Payment Modal State
  const [paymentModalVisible, setPaymentModalVisible] = useState(false);
  const [paymentCustomer, setPaymentCustomer] = useState<Customer | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [payNotes, setPayNotes] = useState('');

  // Date-wise Customer Detail Modal State
  const [selectedDetailCustomerId, setSelectedDetailCustomerId] = useState<string | null>(null);
  const [auditFilter, setAuditFilter] = useState<AuditFilterType>('all');

  // Quick Log Entry for a Missing Day Modal State
  const [quickEntryModalVisible, setQuickEntryModalVisible] = useState(false);
  const [quickEntryDate, setQuickEntryDate] = useState('');
  const [quickEntrySession, setQuickEntrySession] = useState<SessionType>('Morning');
  const [quickEntryMilkType, setQuickEntryMilkType] = useState<MilkType>('cow');
  const [quickEntryLitres, setQuickEntryLitres] = useState('');
  const [quickEntryRate, setQuickEntryRate] = useState('');

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
      const query = searchQuery.trim().toLowerCase();
      if (query) {
        const matchName = item.customer.name.toLowerCase().includes(query);
        const matchPhone = item.customer.phone.includes(query);
        const matchAddress = item.customer.address ? item.customer.address.toLowerCase().includes(query) : false;
        if (!matchName && !matchPhone && !matchAddress) return false;
      }

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

  // Active customer selected for the Date-wise Detail Modal
  const activeDetailSummary = useMemo(() => {
    if (!selectedDetailCustomerId) return null;
    return allDueSummaries.find(s => s.customer.id === selectedDetailCustomerId) || null;
  }, [allDueSummaries, selectedDetailCustomerId]);

  // Generate date list and entries for the active detail customer
  const auditDateList = useMemo(() => {
    if (!activeDetailSummary) return [];

    const today = new Date();
    const dates: string[] = [];
    
    let numDays = 30;
    if (selectedPeriod === '10') numDays = 10;
    else if (selectedPeriod === '20') numDays = 20;
    else if (selectedPeriod === '30') numDays = 30;
    else {
      // All time: calculate span from earliest entry or default to 30
      const custEntries = milkEntries.filter(e => e.customerId === activeDetailSummary.customer.id);
      if (custEntries.length > 0) {
        const datesSorted = custEntries.map(e => e.date).sort();
        const earliest = new Date(datesSorted[0]);
        const diffTime = Math.abs(today.getTime() - earliest.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
        numDays = Math.min(Math.max(diffDays, 10), 60);
      } else {
        numDays = 30;
      }
    }

    for (let i = 0; i < numDays; i++) {
      const d = new Date();
      d.setDate(today.getDate() - i);
      dates.push(d.toISOString().split('T')[0]);
    }

    return dates.map(dateStr => {
      const entries = milkEntries.filter(
        e => e.customerId === activeDetailSummary.customer.id && e.date === dateStr
      );
      const isDelivered = entries.length > 0;
      const totalLitres = entries.reduce((sum, e) => sum + e.quantityLitres, 0);
      const totalAmount = entries.reduce((sum, e) => sum + e.amount, 0);

      const parts = dateStr.split('-');
      const y = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10);
      const d = parseInt(parts[2], 10);
      const dateObj = new Date(y, m - 1, d);
      const dayName = DAYS_SHORT[dateObj.getDay()] || '';
      const formattedDate = `${parts[2]} ${MONTHS_SHORT[m - 1]} (${dayName})`;

      return {
        date: dateStr,
        formattedDate,
        isDelivered,
        entries,
        totalLitres,
        totalAmount
      };
    });
  }, [activeDetailSummary, selectedPeriod, milkEntries]);

  const deliveredDaysCount = useMemo(() => {
    return auditDateList.filter(d => d.isDelivered).length;
  }, [auditDateList]);

  const missingDaysCount = useMemo(() => {
    return auditDateList.filter(d => !d.isDelivered).length;
  }, [auditDateList]);

  const filteredAuditList = useMemo(() => {
    if (auditFilter === 'missing') return auditDateList.filter(d => !d.isDelivered);
    if (auditFilter === 'delivered') return auditDateList.filter(d => d.isDelivered);
    return auditDateList;
  }, [auditDateList, auditFilter]);

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
      showAlert('Invalid Amount', 'Please enter a valid payment amount.');
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
    showAlert('Payment Saved', `Payment of ₹${amountVal} recorded for ${paymentCustomer.name}.`);
  };

  const handleShareWhatsAppSummary = async (summary: CustomerDueSummary) => {
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
    } catch {
      showAlert('Error', 'Could not launch WhatsApp.');
    }
  };

  const handleShareItemizedWhatsApp = async () => {
    if (!activeDetailSummary) return;
    const periodName =
      selectedPeriod === '10'
        ? 'Last 10 Days'
        : selectedPeriod === '20'
        ? 'Last 20 Days'
        : selectedPeriod === '30'
        ? 'Last 30 Days (Month)'
        : 'All Time';

    try {
      await WhatsAppService.sendItemizedDatewiseBillViaWhatsApp(
        activeDetailSummary.customer.phone,
        activeDetailSummary,
        supplier?.businessName || 'Dairy Milk Seller',
        periodLabelOrName(selectedPeriod),
        auditDateList
      );
    } catch {
      showAlert('Error', 'Could not open WhatsApp.');
    }
  };

  const periodLabelOrName = (p: PeriodType) => {
    if (p === '10') return 'Last 10 Days';
    if (p === '20') return 'Last 20 Days';
    if (p === '30') return 'Last 30 Days (Month)';
    return 'All Time';
  };

  // Open Quick Entry modal for a specific missing date
  const openQuickEntryForDate = (dateStr: string) => {
    if (!activeDetailSummary) return;
    setQuickEntryDate(dateStr);
    setQuickEntrySession('Morning');
    setQuickEntryMilkType(activeDetailSummary.customer.milkType);
    setQuickEntryLitres(activeDetailSummary.customer.defaultLitres.toString());
    setQuickEntryRate(activeDetailSummary.customer.ratePerLitre.toString());
    setQuickEntryModalVisible(true);
  };

  const handleSaveQuickEntry = async () => {
    Keyboard.dismiss();
    if (!activeDetailSummary || !quickEntryDate) return;
    const qty = parseFloat(quickEntryLitres);
    const r = parseFloat(quickEntryRate);
    if (isNaN(qty) || qty <= 0) {
      showAlert('Invalid Quantity', 'Please enter a valid quantity in litres.');
      return;
    }
    if (isNaN(r) || r <= 0) {
      showAlert('Invalid Rate', 'Please enter a valid rate per litre.');
      return;
    }

    const newEntry: MilkEntry = {
      id: `entry_${quickEntryDate}_${quickEntrySession}_${activeDetailSummary.customer.id}_${Date.now()}`,
      supplierId: supplier?.id || 'supp_default',
      customerId: activeDetailSummary.customer.id,
      customerName: activeDetailSummary.customer.name,
      date: quickEntryDate,
      session: quickEntrySession,
      milkType: quickEntryMilkType,
      quantityLitres: qty,
      ratePerLitre: r,
      amount: qty * r,
      isPaid: false,
      createdAt: Date.now()
    };

    await StorageService.saveMilkEntry(newEntry);
    await refreshMilkEntries();
    setQuickEntryModalVisible(false);
    showAlert('Entry Recorded', `Delivery of ${qty}L for ${quickEntryDate} (${quickEntrySession}) saved.`);
  };

  const handleDeleteEntry = (entryId: string, dateStr: string) => {
    confirmAction(
      'Delete Delivery',
      `Are you sure you want to remove this delivery on ${dateStr}?`,
      async () => {
        await StorageService.deleteMilkEntry(entryId);
        await refreshMilkEntries();
      },
      'Delete',
      'Cancel'
    );
  };


  return (
    <SafeAreaView style={styles.safeArea} edges={['left', 'right']}>
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
            placeholder="🔍 Search customer name, phone, address..."
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

        {/* Quick Filter Chips: All, Pending Due (बकाया), Fully Paid (चुकता) */}
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

        {/* Helper Hint: Tap customer for date-wise report */}
        <View style={styles.tapHintBox}>
          <Text style={styles.tapHintText}>
            💡 Tap on any customer card to view date-wise milk delivery & missing days report
          </Text>
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
            <TouchableOpacity
              style={styles.dueCard}
              activeOpacity={0.88}
              onPress={() => setSelectedDetailCustomerId(item.customer.id)}
            >
              <View style={styles.cardHeader}>
                <View style={{ flex: 1, marginRight: 8 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                    <Text style={styles.custIndex}>{index + 1}.</Text>
                    <Text style={styles.custName} numberOfLines={1}>{item.customer.name}</Text>
                    <View style={styles.viewReportBadge}>
                      <Text style={styles.viewReportBadgeText}>📅 Date-wise ›</Text>
                    </View>
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
                <Text style={styles.cardTapPromptText}>Tap for full report ›</Text>
              </View>

              {/* Action Buttons: Record Payment & WhatsApp Summary */}
              <View style={styles.cardActions}>
                <TouchableOpacity
                  style={styles.payBtn}
                  onPress={(e) => {
                    e.stopPropagation();
                    openPayModal(item.customer);
                  }}
                  activeOpacity={0.7}
                  hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                >
                  <Text style={styles.payBtnText}>💵 {t.recordPayment}</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.whatsappBtn}
                  onPress={(e) => {
                    e.stopPropagation();
                    handleShareWhatsAppSummary(item);
                  }}
                  activeOpacity={0.8}
                  hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                >
                  <Text style={styles.whatsappBtnText}>💬 {t.shareWhatsApp}</Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
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

        {/* ------------------------------------------------------------- */}
        {/* DETAILED DATE-WISE CUSTOMER DELIVERY & MISSING REPORT MODAL */}
        {/* ------------------------------------------------------------- */}
        <Modal
          visible={!!activeDetailSummary}
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={() => setSelectedDetailCustomerId(null)}
        >
          {activeDetailSummary && (
            <SafeAreaView style={styles.detailModalSafeArea}>
              {/* Modal Top Bar */}
              <View style={styles.modalHeaderBar}>
                <TouchableOpacity
                  style={styles.modalBackBtn}
                  onPress={() => setSelectedDetailCustomerId(null)}
                  activeOpacity={0.7}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Text style={styles.modalBackBtnText}>✕ Close</Text>
                </TouchableOpacity>
                <Text style={styles.modalHeaderTitle} numberOfLines={1}>
                  Date-Wise Delivery Report
                </Text>
                <TouchableOpacity
                  style={styles.modalHeaderPayBtn}
                  onPress={() => openPayModal(activeDetailSummary.customer)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.modalHeaderPayBtnText}>+ Pay</Text>
                </TouchableOpacity>
              </View>

              <ScrollView style={styles.detailScrollContent} contentContainerStyle={{ paddingBottom: 40 }}>
                {/* Customer Info Card */}
                <View style={styles.detailCustCard}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <View style={{ flex: 1, marginRight: 8 }}>
                      <Text style={styles.detailCustName}>{activeDetailSummary.customer.name}</Text>
                      <Text style={styles.detailCustPhone}>📞 {activeDetailSummary.customer.phone}</Text>
                      {activeDetailSummary.customer.address ? (
                        <Text style={styles.detailCustAddress}>📍 {activeDetailSummary.customer.address}</Text>
                      ) : null}
                      <Text style={styles.detailCustPref}>
                        Default: {activeDetailSummary.customer.defaultLitres}L (
                        {activeDetailSummary.customer.milkType === 'cow' ? '🐄 Cow' : '🐃 Buffalo'} @ ₹
                        {activeDetailSummary.customer.ratePerLitre}/L)
                      </Text>
                    </View>

                    <View style={styles.detailNetDueBadge}>
                      <Text style={styles.detailNetDueLabel}>Net Due</Text>
                      <Text style={[styles.detailNetDueAmount, activeDetailSummary.netDue > 0 ? styles.dueRed : styles.dueGreen]}>
                        ₹{activeDetailSummary.netDue.toFixed(2)}
                      </Text>
                    </View>
                  </View>

                  {/* Inside-Modal Period Selector */}
                  <View style={styles.modalPeriodTabs}>
                    {(['10', '20', '30', 'all'] as PeriodType[]).map(p => (
                      <TouchableOpacity
                        key={p}
                        style={[styles.modalPeriodTab, selectedPeriod === p && styles.modalPeriodTabActive]}
                        onPress={() => setSelectedPeriod(p)}
                      >
                        <Text style={[styles.modalPeriodTabText, selectedPeriod === p && styles.modalPeriodTabTextActive]}>
                          {p === '10' ? '10 Days' : p === '20' ? '20 Days' : p === '30' ? '30 Days' : 'All'}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                {/* KPI Metrics Strip */}
                <View style={styles.kpiContainer}>
                  <View style={[styles.kpiBox, { backgroundColor: '#f0fdf4', borderColor: '#86efac' }]}>
                    <Text style={[styles.kpiValue, { color: '#16a34a' }]}>{deliveredDaysCount}</Text>
                    <Text style={styles.kpiLabel}>✓ Delivered</Text>
                  </View>

                  <View style={[styles.kpiBox, { backgroundColor: '#fffbeb', borderColor: '#fde68a' }]}>
                    <Text style={[styles.kpiValue, { color: '#d97706' }]}>{missingDaysCount}</Text>
                    <Text style={styles.kpiLabel}>⚠️ Missing</Text>
                  </View>

                  <View style={[styles.kpiBox, { backgroundColor: '#f0f9ff', borderColor: '#bae6fd' }]}>
                    <Text style={[styles.kpiValue, { color: '#0284c7' }]}>
                      {activeDetailSummary.totalLitres.toFixed(1)}L
                    </Text>
                    <Text style={styles.kpiLabel}>Total Vol</Text>
                  </View>

                  <View style={[styles.kpiBox, { backgroundColor: '#faf5ff', borderColor: '#e9d5ff' }]}>
                    <Text style={[styles.kpiValue, { color: '#7e22ce' }]}>
                      ₹{activeDetailSummary.totalAmountBilled.toFixed(0)}
                    </Text>
                    <Text style={styles.kpiLabel}>Billed</Text>
                  </View>
                </View>

                {/* Audit Filter Tabs: All, Missing Only, Delivered Only */}
                <View style={styles.auditFilterRow}>
                  <TouchableOpacity
                    style={[styles.auditFilterChip, auditFilter === 'all' && styles.auditFilterChipActive]}
                    onPress={() => setAuditFilter('all')}
                  >
                    <Text style={[styles.auditFilterChipText, auditFilter === 'all' && styles.auditFilterChipTextActive]}>
                      All Dates ({auditDateList.length})
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.auditFilterChip, auditFilter === 'missing' && styles.auditFilterChipActiveMissing]}
                    onPress={() => setAuditFilter('missing')}
                  >
                    <Text style={[styles.auditFilterChipText, auditFilter === 'missing' && styles.auditFilterChipTextActiveMissing]}>
                      ⚠️ Missing Only ({missingDaysCount})
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.auditFilterChip, auditFilter === 'delivered' && styles.auditFilterChipActiveDelivered]}
                    onPress={() => setAuditFilter('delivered')}
                  >
                    <Text style={[styles.auditFilterChipText, auditFilter === 'delivered' && styles.auditFilterChipTextActiveDelivered]}>
                      ✓ Delivered ({deliveredDaysCount})
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* Day-by-Day List */}
                <View style={styles.dayListContainer}>
                  {filteredAuditList.map((dayItem) => (
                    <View
                      key={dayItem.date}
                      style={[
                        styles.dayCard,
                        dayItem.isDelivered ? styles.dayCardDelivered : styles.dayCardMissing
                      ]}
                    >
                      <View style={styles.dayCardTopRow}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <View
                            style={[
                              styles.statusIconCircle,
                              dayItem.isDelivered ? styles.iconDelivered : styles.iconMissing
                            ]}
                          >
                            <Text style={styles.statusIconEmoji}>
                              {dayItem.isDelivered ? '✓' : '⚠️'}
                            </Text>
                          </View>
                          <View>
                            <Text style={styles.dayDateText}>{dayItem.formattedDate}</Text>
                            <Text
                              style={[
                                styles.dayStatusSubText,
                                dayItem.isDelivered ? styles.subDelivered : styles.subMissing
                              ]}
                            >
                              {dayItem.isDelivered ? 'DELIVERED (वितरित)' : 'MISSING / NO DELIVERY (छूटा हुआ)'}
                            </Text>
                          </View>
                        </View>

                        {dayItem.isDelivered ? (
                          <View style={styles.dayAmountBox}>
                            <Text style={styles.dayAmountText}>₹{dayItem.totalAmount.toFixed(2)}</Text>
                            <Text style={styles.dayLitresText}>{dayItem.totalLitres.toFixed(1)} Litres</Text>
                          </View>
                        ) : (
                          <TouchableOpacity
                            style={styles.quickAddEntryBtn}
                            onPress={() => openQuickEntryForDate(dayItem.date)}
                            activeOpacity={0.7}
                            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                          >
                            <Text style={styles.quickAddEntryBtnText}>+ Log Milk</Text>
                          </TouchableOpacity>
                        )}
                      </View>

                      {/* Entries Breakdown for delivered days */}
                      {dayItem.isDelivered && (
                        <View style={styles.dayEntriesBreakdown}>
                          {dayItem.entries.map((e) => (
                            <View key={e.id} style={styles.entryLine}>
                              <View style={styles.entryLineLeft}>
                                <Text style={styles.entrySessionTag}>
                                  {e.session === 'Morning' ? '🌅 Morning' : e.session === 'Evening' ? '🌇 Evening' : '🥛 Custom'}
                                </Text>
                                <Text style={styles.entryDetailTag}>
                                  {e.milkType === 'cow' ? '🐄 Cow' : '🐃 Buffalo'} • {e.quantityLitres}L @ ₹{e.ratePerLitre}/L
                                </Text>
                              </View>
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                <Text style={styles.entryAmountText}>= ₹{e.amount.toFixed(0)}</Text>
                                <TouchableOpacity
                                  onPress={() => handleDeleteEntry(e.id, dayItem.formattedDate)}
                                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                                >
                                  <Text style={styles.entryDeleteText}>🗑️</Text>
                                </TouchableOpacity>
                              </View>
                            </View>
                          ))}
                        </View>
                      )}
                    </View>
                  ))}
                </View>

                {/* Bottom WhatsApp Actions */}
                <View style={styles.modalBottomActions}>
                  <TouchableOpacity
                    style={styles.modalWhatsappBtn}
                    onPress={handleShareItemizedWhatsApp}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.modalWhatsappBtnText}>
                      💬 Share Date-wise Log on WhatsApp
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.modalWhatsappSummaryBtn}
                    onPress={() => handleShareWhatsAppSummary(activeDetailSummary)}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.modalWhatsappSummaryBtnText}>
                      📄 Share Bill Summary Only
                    </Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            </SafeAreaView>
          )}
        </Modal>

        {/* ------------------------------------------------------------- */}
        {/* QUICK MILK ENTRY POPUP FOR MISSING DATE */}
        {/* ------------------------------------------------------------- */}
        <Modal
          visible={quickEntryModalVisible}
          animationType="fade"
          transparent
          onRequestClose={() => setQuickEntryModalVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.quickModalBox}>
              <Text style={styles.quickModalTitle}>
                Log Milk Delivery — {quickEntryDate}
              </Text>
              <Text style={styles.quickModalSubtitle}>
                Customer: {activeDetailSummary?.customer.name}
              </Text>

              {/* Session Picker */}
              <Text style={styles.label}>Session</Text>
              <View style={styles.quickSessionRow}>
                {(['Morning', 'Evening'] as SessionType[]).map(s => (
                  <TouchableOpacity
                    key={s}
                    style={[styles.quickSessionBtn, quickEntrySession === s && styles.quickSessionBtnActive]}
                    onPress={() => setQuickEntrySession(s)}
                  >
                    <Text style={[styles.quickSessionText, quickEntrySession === s && styles.quickSessionTextActive]}>
                      {s === 'Morning' ? '🌅 Morning' : '🌇 Evening'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Milk Type Picker */}
              <Text style={styles.label}>Milk Type</Text>
              <View style={styles.quickSessionRow}>
                <TouchableOpacity
                  style={[styles.quickSessionBtn, quickEntryMilkType === 'cow' && styles.quickSessionBtnActive]}
                  onPress={() => setQuickEntryMilkType('cow')}
                >
                  <Text style={[styles.quickSessionText, quickEntryMilkType === 'cow' && styles.quickSessionTextActive]}>
                    🐄 Cow Milk
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.quickSessionBtn, quickEntryMilkType === 'buffalo' && styles.quickSessionBtnActive]}
                  onPress={() => setQuickEntryMilkType('buffalo')}
                >
                  <Text style={[styles.quickSessionText, quickEntryMilkType === 'buffalo' && styles.quickSessionTextActive]}>
                    🐃 Buffalo Milk
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Litres & Rate */}
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>Litres *</Text>
                  <TextInput
                    style={styles.modalInput}
                    placeholder="e.g. 2.0"
                    placeholderTextColor="#94a3b8"
                    keyboardType="numeric"
                    value={quickEntryLitres}
                    onChangeText={setQuickEntryLitres}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>Rate / Litre (₹) *</Text>
                  <TextInput
                    style={styles.modalInput}
                    placeholder="e.g. 60"
                    placeholderTextColor="#94a3b8"
                    keyboardType="numeric"
                    value={quickEntryRate}
                    onChangeText={setQuickEntryRate}
                  />
                </View>
              </View>

              {/* Total Calculation Display */}
              <View style={styles.quickTotalDisplay}>
                <Text style={styles.quickTotalText}>
                  Day Bill: ₹
                  {((parseFloat(quickEntryLitres) || 0) * (parseFloat(quickEntryRate) || 0)).toFixed(2)}
                </Text>
              </View>

              {/* Buttons */}
              <View style={styles.modalButtonRow}>
                <TouchableOpacity
                  style={styles.modalCancelBtn}
                  onPress={() => setQuickEntryModalVisible(false)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.modalCancelBtnText}>{t.cancel}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.modalSaveBtn}
                  onPress={handleSaveQuickEntry}
                  activeOpacity={0.85}
                >
                  <Text style={styles.modalSaveBtnText}>Save Delivery</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* ------------------------------------------------------------- */}
        {/* RECORD PAYMENT MODAL */}
        {/* ------------------------------------------------------------- */}
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
  filterChipsRow: { flexDirection: 'row', gap: 6, marginBottom: 8 },
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
  tapHintBox: {
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#bfdbfe',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: 10
  },
  tapHintText: { fontSize: 11, color: '#1d4ed8', fontWeight: '500' },
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
  viewReportBadge: {
    backgroundColor: '#eff6ff',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: '#bfdbfe'
  },
  viewReportBadgeText: { fontSize: 10, color: '#1d4ed8', fontWeight: 'bold' },
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
    alignItems: 'center',
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9'
  },
  finText: { fontSize: 12, color: '#64748b' },
  cardTapPromptText: { fontSize: 11, color: '#0284c7', fontWeight: '600' },
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
  resetSearchText: { color: '#ffffff', fontWeight: 'bold' },
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
  modalSaveBtnText: { color: '#ffffff', fontWeight: 'bold' },

  // Detail Modal Styles
  detailModalSafeArea: { flex: 1, backgroundColor: '#f8fafc' },
  modalHeaderBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0'
  },
  modalBackBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: '#f1f5f9',
    borderRadius: 8
  },
  modalBackBtnText: { fontSize: 13, fontWeight: '600', color: '#475569' },
  modalHeaderTitle: { fontSize: 16, fontWeight: 'bold', color: '#0f172a', flex: 1, textAlign: 'center', marginHorizontal: 8 },
  modalHeaderPayBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: '#0284c7',
    borderRadius: 8
  },
  modalHeaderPayBtnText: { fontSize: 13, fontWeight: 'bold', color: '#ffffff' },
  detailScrollContent: { padding: 14 },
  detailCustCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 12
  },
  detailCustName: { fontSize: 18, fontWeight: 'bold', color: '#0f172a' },
  detailCustPhone: { fontSize: 13, color: '#475569', marginTop: 2 },
  detailCustAddress: { fontSize: 12, color: '#64748b', marginTop: 2 },
  detailCustPref: { fontSize: 12, color: '#0284c7', fontWeight: '600', marginTop: 4 },
  detailNetDueBadge: {
    alignItems: 'flex-end',
    backgroundColor: '#f8fafc',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0'
  },
  detailNetDueLabel: { fontSize: 11, color: '#64748b' },
  detailNetDueAmount: { fontSize: 18, fontWeight: 'bold', marginTop: 1 },
  modalPeriodTabs: {
    flexDirection: 'row',
    backgroundColor: '#f1f5f9',
    borderRadius: 8,
    padding: 2,
    marginTop: 12
  },
  modalPeriodTab: { flex: 1, paddingVertical: 6, alignItems: 'center', borderRadius: 6 },
  modalPeriodTabActive: { backgroundColor: '#ffffff', elevation: 1 },
  modalPeriodTabText: { fontSize: 11, color: '#64748b', fontWeight: '600' },
  modalPeriodTabTextActive: { color: '#0284c7', fontWeight: 'bold' },
  kpiContainer: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12
  },
  kpiBox: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    paddingVertical: 8,
    alignItems: 'center'
  },
  kpiValue: { fontSize: 15, fontWeight: 'bold' },
  kpiLabel: { fontSize: 10, color: '#64748b', marginTop: 2, fontWeight: '500' },
  auditFilterRow: { flexDirection: 'row', gap: 6, marginBottom: 12 },
  auditFilterChip: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 16,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0'
  },
  auditFilterChipActive: { backgroundColor: '#0284c7', borderColor: '#0284c7' },
  auditFilterChipActiveMissing: { backgroundColor: '#fef3c7', borderColor: '#f59e0b' },
  auditFilterChipActiveDelivered: { backgroundColor: '#dcfce7', borderColor: '#22c55e' },
  auditFilterChipText: { fontSize: 11, color: '#64748b', fontWeight: '600' },
  auditFilterChipTextActive: { color: '#ffffff', fontWeight: 'bold' },
  auditFilterChipTextActiveMissing: { color: '#b45309', fontWeight: 'bold' },
  auditFilterChipTextActiveDelivered: { color: '#15803d', fontWeight: 'bold' },
  dayListContainer: { marginBottom: 16 },
  dayCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1
  },
  dayCardDelivered: { borderColor: '#bbf7d0', backgroundColor: '#ffffff' },
  dayCardMissing: { borderColor: '#fed7aa', backgroundColor: '#fffbf5' },
  dayCardTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  statusIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center'
  },
  iconDelivered: { backgroundColor: '#dcfce7' },
  iconMissing: { backgroundColor: '#ffedd5' },
  statusIconEmoji: { fontSize: 14 },
  dayDateText: { fontSize: 14, fontWeight: 'bold', color: '#0f172a' },
  dayStatusSubText: { fontSize: 10, fontWeight: 'bold', marginTop: 1 },
  subDelivered: { color: '#16a34a' },
  subMissing: { color: '#ea580c' },
  dayAmountBox: { alignItems: 'flex-end' },
  dayAmountText: { fontSize: 15, fontWeight: 'bold', color: '#0f172a' },
  dayLitresText: { fontSize: 11, color: '#64748b' },
  quickAddEntryBtn: {
    backgroundColor: '#ea580c',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8
  },
  quickAddEntryBtnText: { color: '#ffffff', fontSize: 12, fontWeight: 'bold' },
  dayEntriesBreakdown: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    gap: 4
  },
  entryLine: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  entryLineLeft: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  entrySessionTag: { fontSize: 11, color: '#0284c7', fontWeight: '600' },
  entryDetailTag: { fontSize: 11, color: '#64748b' },
  entryAmountText: { fontSize: 12, fontWeight: 'bold', color: '#0f172a' },
  entryDeleteText: { fontSize: 12 },
  modalBottomActions: { gap: 10, marginTop: 8 },
  modalWhatsappBtn: {
    backgroundColor: '#25D366',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center'
  },
  modalWhatsappBtnText: { color: '#ffffff', fontSize: 14, fontWeight: 'bold' },
  modalWhatsappSummaryBtn: {
    backgroundColor: '#f1f5f9',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#cbd5e1'
  },
  modalWhatsappSummaryBtnText: { color: '#334155', fontSize: 13, fontWeight: '600' },

  // Quick Modal Box
  quickModalBox: { backgroundColor: '#ffffff', borderRadius: 16, padding: 20 },
  quickModalTitle: { fontSize: 16, fontWeight: 'bold', color: '#0f172a' },
  quickModalSubtitle: { fontSize: 13, color: '#64748b', marginTop: 2, marginBottom: 10 },
  quickSessionRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  quickSessionBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0'
  },
  quickSessionBtnActive: { backgroundColor: '#0284c7', borderColor: '#0284c7' },
  quickSessionText: { fontSize: 12, color: '#475569', fontWeight: '600' },
  quickSessionTextActive: { color: '#ffffff', fontWeight: 'bold' },
  quickTotalDisplay: {
    backgroundColor: '#eff6ff',
    borderRadius: 8,
    padding: 10,
    marginTop: 12,
    alignItems: 'center'
  },
  quickTotalText: { fontSize: 14, fontWeight: 'bold', color: '#1d4ed8' }
});
