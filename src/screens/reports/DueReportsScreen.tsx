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
import { formatToDisplayDate, parseToIsoDate, getTodayDisplayDate } from '../../utils/dateUtils';

export type ReportMode = 'month' | 'custom' | 'all';
type DueFilterType = 'all' | 'dueOnly' | 'paidOnly';
type AuditFilterType = 'all' | 'missing' | 'delivered';

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const MONTH_NAMES = [
  { en: 'January', hi: 'जनवरी', short: 'Jan' },
  { en: 'February', hi: 'फ़रवरी', short: 'Feb' },
  { en: 'March', hi: 'मार्च', short: 'Mar' },
  { en: 'April', hi: 'अप्रैल', short: 'Apr' },
  { en: 'May', hi: 'मई', short: 'May' },
  { en: 'June', hi: 'जून', short: 'Jun' },
  { en: 'July', hi: 'जुलाई', short: 'Jul' },
  { en: 'August', hi: 'अगस्त', short: 'Aug' },
  { en: 'September', hi: 'सितम्बर', short: 'Sep' },
  { en: 'October', hi: 'अक्टूबर', short: 'Oct' },
  { en: 'November', hi: 'नवम्बर', short: 'Nov' },
  { en: 'December', hi: 'दिसम्बर', short: 'Dec' },
];

export const DueReportsScreen = () => {
  const { t, lang, customers, milkEntries, refreshMilkEntries, payments, refreshPayments, supplier } = useApp();
  
  const now = new Date();
  const [reportMode, setReportMode] = useState<ReportMode>('month');
  const [selectedYear, setSelectedYear] = useState<number>(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<number>(now.getMonth()); // 0-11
  const [pickerYear, setPickerYear] = useState<number>(now.getFullYear());

  // Custom Date Range State (Stored in DD-MMM-YYYY format e.g. 01-SEP-2026 to 08-SEP-2026)
  const firstOfCurrentMonth = formatToDisplayDate(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`);
  const todayDisplayStr = getTodayDisplayDate();
  const [customStartDate, setCustomStartDate] = useState<string>(firstOfCurrentMonth);
  const [customEndDate, setCustomEndDate] = useState<string>(todayDisplayStr);
  const [appliedStartDate, setAppliedStartDate] = useState<string>(firstOfCurrentMonth);
  const [appliedEndDate, setAppliedEndDate] = useState<string>(todayDisplayStr);

  // Month Picker Modal State
  const [monthPickerVisible, setMonthPickerVisible] = useState<boolean>(false);

  // Calendar Picker Modal State for Custom Date Range
  const [calendarPickerVisible, setCalendarPickerVisible] = useState<boolean>(false);
  const [calendarTarget, setCalendarTarget] = useState<'start' | 'end'>('start');
  const [calendarYear, setCalendarYear] = useState<number>(now.getFullYear());
  const [calendarMonth, setCalendarMonth] = useState<number>(now.getMonth());

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

  const dateRange = useMemo(() => {
    if (reportMode === 'month') {
      const year = selectedYear;
      const monthStr = String(selectedMonth + 1).padStart(2, '0');
      const startDate = `${year}-${monthStr}-01`;
      const lastDay = new Date(year, selectedMonth + 1, 0).getDate();
      const endDate = `${year}-${monthStr}-${String(lastDay).padStart(2, '0')}`;
      const mObj = MONTH_NAMES[selectedMonth] || { en: '', hi: '' };
      const label = `${mObj.en} ${year} (${mObj.hi})`;
      return { startDate, endDate, label };
    }

    if (reportMode === 'custom') {
      const startIso = parseToIsoDate(appliedStartDate) || '2000-01-01';
      const endIso = parseToIsoDate(appliedEndDate) || '2099-12-31';
      const label = `${formatToDisplayDate(startIso)} to ${formatToDisplayDate(endIso)}`;
      return { startDate: startIso, endDate: endIso, label };
    }

    return {
      startDate: '2000-01-01',
      endDate: '2099-12-31',
      label: 'All Time (कुल बकाया)'
    };
  }, [reportMode, selectedYear, selectedMonth, appliedStartDate, appliedEndDate]);

  const handlePrevMonth = () => {
    if (selectedMonth === 0) {
      setSelectedMonth(11);
      setSelectedYear(y => y - 1);
    } else {
      setSelectedMonth(m => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (selectedMonth === 11) {
      setSelectedMonth(0);
      setSelectedYear(y => y + 1);
    } else {
      setSelectedMonth(m => m + 1);
    }
  };

  const handleSelectMonthYear = (monthIdx: number, year: number) => {
    setSelectedMonth(monthIdx);
    setSelectedYear(year);
    setMonthPickerVisible(false);
  };

  const handleApplyPreset = (preset: 'firstHalf' | 'secondHalf' | 'fullMonth') => {
    const y = now.getFullYear();
    const mStr = String(now.getMonth() + 1).padStart(2, '0');
    const lastDay = new Date(y, now.getMonth() + 1, 0).getDate();
    let newStart = '';
    let newEnd = '';
    if (preset === 'firstHalf') {
      newStart = formatToDisplayDate(`${y}-${mStr}-01`);
      newEnd = formatToDisplayDate(`${y}-${mStr}-15`);
    } else if (preset === 'secondHalf') {
      newStart = formatToDisplayDate(`${y}-${mStr}-16`);
      newEnd = formatToDisplayDate(`${y}-${mStr}-${String(lastDay).padStart(2, '0')}`);
    } else if (preset === 'fullMonth') {
      newStart = formatToDisplayDate(`${y}-${mStr}-01`);
      newEnd = formatToDisplayDate(`${y}-${mStr}-${String(lastDay).padStart(2, '0')}`);
    }
    setCustomStartDate(newStart);
    setCustomEndDate(newEnd);
    setAppliedStartDate(newStart);
    setAppliedEndDate(newEnd);
  };

  const handleApplyCustomSearch = () => {
    Keyboard.dismiss();
    const startIso = parseToIsoDate(customStartDate);
    const endIso = parseToIsoDate(customEndDate);
    if (!startIso || !endIso) {
      showAlert(
        lang === 'hi' ? 'अमान्य तारीख' : 'Invalid Date',
        lang === 'hi' ? 'कृपया मान्य तारीख प्रारूप (DD-MMM-YYYY) दर्ज करें।' : 'Please enter a valid date in DD-MMM-YYYY format.'
      );
      return;
    }
    if (startIso > endIso) {
      showAlert(
        lang === 'hi' ? 'तारीख क्रम जांचें' : 'Check Date Range',
        lang === 'hi' ? '"से तारीख" "तक तारीख" से पहले होनी चाहिए।' : 'Start date must be before or equal to End date.'
      );
      return;
    }
    setAppliedStartDate(formatToDisplayDate(startIso));
    setAppliedEndDate(formatToDisplayDate(endIso));
  };

  const openCalendarPicker = (target: 'start' | 'end') => {
    const currentDateStr = target === 'start' ? customStartDate : customEndDate;
    const iso = parseToIsoDate(currentDateStr);
    let y = now.getFullYear();
    let m = now.getMonth();
    if (iso) {
      const parts = iso.split('-');
      if (parts.length === 3) {
        y = parseInt(parts[0], 10) || now.getFullYear();
        m = (parseInt(parts[1], 10) - 1) || now.getMonth();
      }
    }
    setCalendarYear(y);
    setCalendarMonth(m);
    setCalendarTarget(target);
    setCalendarPickerVisible(true);
  };

  const handleSelectCalendarDay = (day: number) => {
    const mStr = String(calendarMonth + 1).padStart(2, '0');
    const dStr = String(day).padStart(2, '0');
    const selectedIso = `${calendarYear}-${mStr}-${dStr}`;
    const displayFormatted = formatToDisplayDate(selectedIso);

    if (calendarTarget === 'start') {
      setCustomStartDate(displayFormatted);
      setAppliedStartDate(displayFormatted);
    } else {
      setCustomEndDate(displayFormatted);
      setAppliedEndDate(displayFormatted);
    }
    setCalendarPickerVisible(false);
  };


  // All calculated due summaries for the selected period
  const allDueSummaries: CustomerDueSummary[] = useMemo(() => {
    const { startDate, endDate } = dateRange;
    return customers.map(cust => {
      const custEntries = milkEntries.filter(
        e => e.customerId === cust.id && e.date >= startDate && e.date <= endDate
      );
      const custPayments = payments.filter(
        p => p.customerId === cust.id && p.date >= startDate && p.date <= endDate
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
  }, [customers, milkEntries, payments, dateRange]);

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

    const { startDate, endDate } = dateRange;
    const dates: string[] = [];

    if (reportMode === 'all') {
      const custEntries = milkEntries.filter(e => e.customerId === activeDetailSummary.customer.id);
      const today = new Date();
      if (custEntries.length > 0) {
        const sorted = custEntries.map(e => e.date).sort();
        const earliest = new Date(sorted[0]);
        const diffTime = Math.abs(today.getTime() - earliest.getTime());
        const diffDays = Math.min(Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1, 90);
        for (let i = 0; i < diffDays; i++) {
          const d = new Date();
          d.setDate(today.getDate() - i);
          dates.push(d.toISOString().split('T')[0]);
        }
      } else {
        for (let i = 0; i < 30; i++) {
          const d = new Date();
          d.setDate(today.getDate() - i);
          dates.push(d.toISOString().split('T')[0]);
        }
      }
    } else {
      const startParts = startDate.split('-').map(Number);
      const endParts = endDate.split('-').map(Number);
      const startObj = new Date(startParts[0], startParts[1] - 1, startParts[2]);
      const endObj = new Date(endParts[0], endParts[1] - 1, endParts[2]);

      const cur = new Date(endObj);
      while (cur >= startObj) {
        dates.push(cur.toISOString().split('T')[0]);
        cur.setDate(cur.getDate() - 1);
      }
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
      const formattedDate = `${formatToDisplayDate(dateStr)} (${dayName})`;

      return {
        date: dateStr,
        formattedDate,
        isDelivered,
        entries,
        totalLitres,
        totalAmount
      };
    });
  }, [activeDetailSummary, dateRange, reportMode, milkEntries]);

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
    const periodName = dateRange.label;

    try {
      await WhatsAppService.sendBillViaWhatsApp(
        summary.customer.phone,
        summary,
        supplier?.businessName || 'Dairy Milk Seller',
        periodName
      );
    } catch {
      showAlert('त्रुटि (Error)', 'Could not launch WhatsApp.');
    }
  };

  const handleShareItemizedWhatsApp = async () => {
    if (!activeDetailSummary) return;
    const periodName = dateRange.label;

    try {
      await WhatsAppService.sendItemizedDatewiseBillViaWhatsApp(
        activeDetailSummary.customer.phone,
        activeDetailSummary,
        supplier?.businessName || 'Dairy Milk Seller',
        periodName,
        auditDateList
      );
    } catch {
      showAlert('त्रुटि (Error)', 'Could not open WhatsApp.');
    }
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
      'डिलीवरी एंट्री हटाएं (Delete Delivery)',
      `क्या आप यह डिलीवरी एंट्री हटाना चाहते हैं?\n• तारीख (Date): ${dateStr}\n• सूचना: यह एंट्री हिसाब और रिपोर्ट से हट जाएगी।`,
      async () => {
        await StorageService.deleteMilkEntry(entryId);
        await refreshMilkEntries();
      },
      '🗑️ हटाएं (Delete)',
      'रद्द करें (Cancel)',
      true
    );
  };


  return (
    <SafeAreaView style={styles.safeArea} edges={['left', 'right']}>
      <View style={styles.container}>
        {/* Mode Selector Tabs: Month-wise / Custom Range / All Dues */}
        <View style={styles.modeTabs}>
          <TouchableOpacity
            style={[styles.modeTab, reportMode === 'month' && styles.modeTabActive]}
            onPress={() => setReportMode('month')}
            activeOpacity={0.7}
            hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
          >
            <Text style={[styles.modeTabText, reportMode === 'month' && styles.modeTabTextActive]}>
              📅 {t.monthWise || 'महीने अनुसार'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.modeTab, reportMode === 'custom' && styles.modeTabActive]}
            onPress={() => setReportMode('custom')}
            activeOpacity={0.7}
            hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
          >
            <Text style={[styles.modeTabText, reportMode === 'custom' && styles.modeTabTextActive]}>
              🗓️ {t.customRange || 'कस्टम तारीख'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.modeTab, reportMode === 'all' && styles.modeTabActive]}
            onPress={() => setReportMode('all')}
            activeOpacity={0.7}
            hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
          >
            <Text style={[styles.modeTabText, reportMode === 'all' && styles.modeTabTextActive]}>
              ♾️ {t.allDues || 'कुल बकाया'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* When in Month Mode: Month Navigator Strip */}
        {reportMode === 'month' && (
          <View style={styles.monthNavRow}>
            <TouchableOpacity
              style={styles.monthNavBtn}
              onPress={handlePrevMonth}
              activeOpacity={0.7}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.monthNavBtnText}>
                {lang === 'hi' ? '◀ पिछला' : `◀ ${t.prev || 'Prev'}`}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.monthSelectorBtn}
              onPress={() => {
                setPickerYear(selectedYear);
                setMonthPickerVisible(true);
              }}
              activeOpacity={0.7}
            >
              <Text style={styles.monthSelectorText}>
                {MONTH_NAMES[selectedMonth]?.en} {selectedYear} ({MONTH_NAMES[selectedMonth]?.hi}) ▾
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.monthNavBtn}
              onPress={handleNextMonth}
              activeOpacity={0.7}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.monthNavBtnText}>
                {lang === 'hi' ? 'अगला ▶' : `${t.next || 'Next'} ▶`}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* When in Custom Mode: Date Inputs, Calendar Buttons, Presets & Search Button */}
        {reportMode === 'custom' && (
          <View style={styles.customDateBox}>
            <View style={styles.customDateInputRow}>
              <View style={{ flex: 1 }}>
                <View style={styles.dateLabelRow}>
                  <Text style={styles.customDateLabel}>{t.fromDate || 'से तारीख'} (DD-MMM-YYYY)</Text>
                  <TouchableOpacity
                    style={styles.calPickerTriggerBtn}
                    onPress={() => openCalendarPicker('start')}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.calPickerTriggerText}>📅 {t.selectFromCalendar || 'कैलेंडर'}</Text>
                  </TouchableOpacity>
                </View>
                <TextInput
                  style={styles.customDateInput}
                  placeholder="01-SEP-2026"
                  placeholderTextColor="#94a3b8"
                  value={customStartDate}
                  onChangeText={setCustomStartDate}
                />
              </View>

              <Text style={styles.customDateArrow}>→</Text>

              <View style={{ flex: 1 }}>
                <View style={styles.dateLabelRow}>
                  <Text style={styles.customDateLabel}>{t.toDate || 'तक तारीख'} (DD-MMM-YYYY)</Text>
                  <TouchableOpacity
                    style={styles.calPickerTriggerBtn}
                    onPress={() => openCalendarPicker('end')}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.calPickerTriggerText}>📅 {t.selectFromCalendar || 'कैलेंडर'}</Text>
                  </TouchableOpacity>
                </View>
                <TextInput
                  style={styles.customDateInput}
                  placeholder="08-SEP-2026"
                  placeholderTextColor="#94a3b8"
                  value={customEndDate}
                  onChangeText={setCustomEndDate}
                />
              </View>
            </View>

            {/* Quick Presets and Dedicated Search / Filter Button */}
            <View style={styles.customActionRow}>
              <View style={styles.presetRow}>
                <Text style={styles.presetLabel}>{t.quickPresets || 'त्वरित'}:</Text>
                <TouchableOpacity style={styles.presetBtn} onPress={() => handleApplyPreset('firstHalf')}>
                  <Text style={styles.presetBtnText}>{t.preset1_15 || '1-15'}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.presetBtn} onPress={() => handleApplyPreset('secondHalf')}>
                  <Text style={styles.presetBtnText}>{t.preset16_End || '16-अंतिम'}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.presetBtn} onPress={() => handleApplyPreset('fullMonth')}>
                  <Text style={styles.presetBtnText}>{t.presetFullMonth || 'महीना'}</Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                style={styles.searchDuesBtn}
                onPress={handleApplyCustomSearch}
                activeOpacity={0.8}
              >
                <Text style={styles.searchDuesBtnText}>
                  🔍 {t.searchDuesBtn || (lang === 'hi' ? 'बकाया खोजें' : 'Search Dues')}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}


        {/* Total Summary Banner with Billed, Received and Net Due */}
        <View style={styles.summaryBanner}>
          <View style={styles.bannerRow}>
            <View style={styles.bannerItem}>
              <Text style={styles.bannerSubLabel}>{t.totalBilled}</Text>
              <Text style={styles.bannerSubAmount}>₹{totalPeriodBilled.toFixed(0)}</Text>
            </View>
            <View style={styles.bannerItemDivider} />
            <View style={styles.bannerItem}>
              <Text style={styles.bannerSubLabel}>{t.totalReceived}</Text>
              <Text style={styles.bannerSubAmount}>₹{totalPeriodPaid.toFixed(0)}</Text>
            </View>
            <View style={styles.bannerItemDivider} />
            <View style={styles.bannerItem}>
              <Text style={styles.bannerSubLabel}>{t.netDue}</Text>
              <Text style={[styles.bannerSubAmount, { color: '#fef08a' }]}>₹{totalPeriodDue.toFixed(0)}</Text>
            </View>
          </View>
        </View>

        {/* Search Bar with Clear Button to find any customer easily */}
        <View style={styles.searchRow}>
          <TextInput
            style={styles.searchInput}
            placeholder={`🔍 ${t.searchCustomers}`}
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
              {t.all} ({allDueSummaries.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.filterChip, dueFilter === 'dueOnly' && styles.filterChipActiveDue]}
            onPress={() => setDueFilter('dueOnly')}
            activeOpacity={0.7}
          >
            <Text style={[styles.filterChipText, dueFilter === 'dueOnly' && styles.filterChipTextActiveDue]}>
              🔴 {t.pendingDue} ({allDueSummaries.filter(d => d.netDue > 0).length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.filterChip, dueFilter === 'paidOnly' && styles.filterChipActivePaid]}
            onPress={() => setDueFilter('paidOnly')}
            activeOpacity={0.7}
          >
            <Text style={[styles.filterChipText, dueFilter === 'paidOnly' && styles.filterChipTextActivePaid]}>
              ✓ {t.settled} ({allDueSummaries.filter(d => d.netDue <= 0).length})
            </Text>
          </TouchableOpacity>
        </View>

        {/* Helper Hint: Tap customer for date-wise report */}
        <View style={styles.tapHintBox}>
          <Text style={styles.tapHintText}>
            {t.tapHint}
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

                  {/* Inside-Modal Active Date Range & Month Navigation */}
                  <View style={styles.modalPeriodBadgeContainer}>
                    <View style={styles.modalPeriodBadge}>
                      <Text style={styles.modalPeriodBadgeIcon}>
                        {reportMode === 'month' ? '📅' : reportMode === 'custom' ? '🗓️' : '♾️'}
                      </Text>
                      <Text style={styles.modalPeriodBadgeText} numberOfLines={1}>
                        {dateRange.label}
                      </Text>
                    </View>
                    {reportMode === 'month' && (
                      <View style={{ flexDirection: 'row', gap: 6 }}>
                        <TouchableOpacity
                          style={styles.modalMonthNavBtn}
                          onPress={handlePrevMonth}
                          activeOpacity={0.7}
                          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                        >
                          <Text style={styles.modalMonthNavBtnText}>
                            {lang === 'hi' ? '◀ पिछला' : `◀ ${t.prev || 'Prev'}`}
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.modalMonthNavBtn}
                          onPress={handleNextMonth}
                          activeOpacity={0.7}
                          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                        >
                          <Text style={styles.modalMonthNavBtnText}>
                            {lang === 'hi' ? 'अगला ▶' : `${t.next || 'Next'} ▶`}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    )}
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

        {/* ------------------------------------------------------------- */}
        {/* MONTH PICKER MODAL */}
        {/* ------------------------------------------------------------- */}
        <Modal
          visible={monthPickerVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setMonthPickerVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.monthPickerCard}>
              <View style={styles.monthPickerHeader}>
                <TouchableOpacity
                  style={styles.pickerYearBtn}
                  onPress={() => setPickerYear(y => y - 1)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={styles.pickerYearBtnText}>◀</Text>
                </TouchableOpacity>

                <Text style={styles.pickerYearTitle}>{pickerYear}</Text>

                <TouchableOpacity
                  style={styles.pickerYearBtn}
                  onPress={() => setPickerYear(y => y + 1)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={styles.pickerYearBtnText}>▶</Text>
                </TouchableOpacity>
              </View>

              {/* Month Grid (12 Months) */}
              <View style={styles.monthGrid}>
                {MONTH_NAMES.map((m, idx) => {
                  const isSelected = selectedMonth === idx && selectedYear === pickerYear;
                  return (
                    <TouchableOpacity
                      key={m.en}
                      style={[styles.monthGridItem, isSelected && styles.monthGridItemSelected]}
                      onPress={() => handleSelectMonthYear(idx, pickerYear)}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.monthGridEn, isSelected && styles.monthGridTextSelected]}>
                        {m.en}
                      </Text>
                      <Text style={[styles.monthGridHi, isSelected && styles.monthGridTextSelected]}>
                        {m.hi}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <TouchableOpacity
                style={styles.monthPickerCloseBtn}
                onPress={() => setMonthPickerVisible(false)}
                activeOpacity={0.7}
              >
                <Text style={styles.monthPickerCloseText}>{t.cancel || 'रद्द करें'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* ------------------------------------------------------------- */}
        {/* CUSTOM DATE RANGE CALENDAR PICKER MODAL */}
        {/* ------------------------------------------------------------- */}
        <Modal
          visible={calendarPickerVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setCalendarPickerVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.calendarPickerCard}>
              <View style={styles.calendarPickerHeader}>
                <Text style={styles.calendarTargetBadge}>
                  {calendarTarget === 'start'
                    ? `📅 ${t.fromDate || 'से तारीख'}`
                    : `📅 ${t.toDate || 'तक तारीख'}`}
                </Text>
                <TouchableOpacity
                  onPress={() => setCalendarPickerVisible(false)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={styles.modalCloseText}>✕</Text>
                </TouchableOpacity>
              </View>

              {/* Month / Year Navigator for Calendar */}
              <View style={styles.calendarNavRow}>
                <TouchableOpacity
                  style={styles.calNavArrowBtn}
                  onPress={() => {
                    if (calendarMonth === 0) {
                      setCalendarMonth(11);
                      setCalendarYear(y => y - 1);
                    } else {
                      setCalendarMonth(m => m - 1);
                    }
                  }}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={styles.calNavArrowText}>◀</Text>
                </TouchableOpacity>

                <Text style={styles.calendarNavTitle}>
                  {MONTH_NAMES[calendarMonth]?.en} {calendarYear}{' '}
                  <Text style={{ fontSize: 13, color: '#64748b' }}>
                    ({MONTH_NAMES[calendarMonth]?.hi})
                  </Text>
                </Text>

                <TouchableOpacity
                  style={styles.calNavArrowBtn}
                  onPress={() => {
                    if (calendarMonth === 11) {
                      setCalendarMonth(0);
                      setCalendarYear(y => y + 1);
                    } else {
                      setCalendarMonth(m => m + 1);
                    }
                  }}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={styles.calNavArrowText}>▶</Text>
                </TouchableOpacity>
              </View>

              {/* Day of week header (Sun - Sat) */}
              <View style={styles.calendarWeekRow}>
                {DAYS_SHORT.map((dayName, idx) => (
                  <Text
                    key={dayName}
                    style={[
                      styles.calendarWeekText,
                      idx === 0 && { color: '#ef4444' } // Red for Sunday
                    ]}
                  >
                    {dayName}
                  </Text>
                ))}
              </View>

              {/* Days Grid */}
              <View style={styles.calendarDaysGrid}>
                {(() => {
                  const firstDayIndex = new Date(calendarYear, calendarMonth, 1).getDay();
                  const totalDaysInMonth = new Date(calendarYear, calendarMonth + 1, 0).getDate();
                  const currentSelectedDisplay = calendarTarget === 'start' ? customStartDate : customEndDate;
                  const currentSelectedIso = parseToIsoDate(currentSelectedDisplay);

                  const cells = [];
                  // Empty offset cells for start day of week
                  for (let i = 0; i < firstDayIndex; i++) {
                    cells.push(<View key={`empty-${i}`} style={styles.calendarDayCell} />);
                  }

                  // Day cells
                  for (let day = 1; day <= totalDaysInMonth; day++) {
                    const mStr = String(calendarMonth + 1).padStart(2, '0');
                    const dStr = String(day).padStart(2, '0');
                    const cellIso = `${calendarYear}-${mStr}-${dStr}`;
                    const isSelected = currentSelectedIso === cellIso;
                    const isToday =
                      now.getFullYear() === calendarYear &&
                      now.getMonth() === calendarMonth &&
                      now.getDate() === day;

                    cells.push(
                      <TouchableOpacity
                        key={`day-${day}`}
                        style={[
                          styles.calendarDayCell,
                          isSelected && styles.calendarDayCellSelected,
                          isToday && !isSelected && styles.calendarDayCellToday
                        ]}
                        onPress={() => handleSelectCalendarDay(day)}
                        activeOpacity={0.7}
                      >
                        <Text
                          style={[
                            styles.calendarDayText,
                            isSelected && styles.calendarDayTextSelected,
                            isToday && !isSelected && styles.calendarDayTextToday
                          ]}
                        >
                          {day}
                        </Text>
                      </TouchableOpacity>
                    );
                  }

                  return cells;
                })()}
              </View>

              <TouchableOpacity
                style={styles.monthPickerCloseBtn}
                onPress={() => setCalendarPickerVisible(false)}
                activeOpacity={0.7}
              >
                <Text style={styles.monthPickerCloseText}>{t.cancel || 'रद्द करें'}</Text>
              </TouchableOpacity>
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
  modeTabs: {
    flexDirection: 'row',
    backgroundColor: '#e2e8f0',
    borderRadius: 10,
    padding: 3,
    marginBottom: 8
  },
  modeTab: { flex: 1, paddingVertical: 9, alignItems: 'center', borderRadius: 8 },
  modeTabActive: { backgroundColor: '#ffffff', elevation: 2 },
  modeTabText: { fontSize: 12, color: '#64748b', fontWeight: '600' },
  modeTabTextActive: { color: '#0284c7', fontWeight: 'bold' },
  monthNavRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#ffffff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    padding: 6,
    marginBottom: 10,
    gap: 8
  },
  monthNavBtn: {
    paddingVertical: 7,
    paddingHorizontal: 12,
    backgroundColor: '#f1f5f9',
    borderRadius: 8
  },
  monthNavBtnText: { fontSize: 12, fontWeight: 'bold', color: '#0284c7' },
  monthSelectorBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6
  },
  monthSelectorText: { fontSize: 14, fontWeight: 'bold', color: '#0f172a' },
  customDateBox: {
    backgroundColor: '#ffffff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    padding: 10,
    marginBottom: 10
  },
  customDateInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  dateLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4
  },
  customDateLabel: { fontSize: 11, color: '#475569', fontWeight: '600' },
  calPickerTriggerBtn: {
    backgroundColor: '#eff6ff',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#bfdbfe'
  },
  calPickerTriggerText: { fontSize: 10, color: '#0284c7', fontWeight: '600' },
  customDateInput: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 13,
    backgroundColor: '#f8fafc',
    color: '#0f172a'
  },
  customDateArrow: { fontSize: 16, color: '#94a3b8', fontWeight: 'bold', marginTop: 14 },
  customActionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
    gap: 8,
    flexWrap: 'wrap'
  },
  presetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    flexWrap: 'wrap'
  },
  presetLabel: { fontSize: 11, color: '#64748b', fontWeight: '500' },
  presetBtn: {
    backgroundColor: '#f1f5f9',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#e2e8f0'
  },
  presetBtnText: { fontSize: 11, color: '#0284c7', fontWeight: '600' },
  searchDuesBtn: {
    backgroundColor: '#0284c7',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0284c7',
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2
  },
  searchDuesBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: 'bold'
  },
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
  modalPeriodBadgeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    padding: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginTop: 10
  },
  modalPeriodBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1
  },
  modalPeriodBadgeIcon: { fontSize: 14 },
  modalPeriodBadgeText: { fontSize: 12, fontWeight: 'bold', color: '#0284c7' },
  modalMonthNavBtn: {
    backgroundColor: '#e0f2fe',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 6
  },
  modalMonthNavBtnText: { fontSize: 11, fontWeight: 'bold', color: '#0284c7' },
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
  quickTotalText: { fontSize: 14, fontWeight: 'bold', color: '#1d4ed8' },

  // Month Picker Modal Styles
  monthPickerCard: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    padding: 18,
    width: '90%',
    maxWidth: 360,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 8
  },
  monthPickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14
  },
  pickerYearBtn: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    backgroundColor: '#f1f5f9',
    borderRadius: 8
  },
  pickerYearBtnText: { fontSize: 14, fontWeight: 'bold', color: '#0284c7' },
  pickerYearTitle: { fontSize: 18, fontWeight: 'bold', color: '#0f172a' },
  monthGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'space-between'
  },
  monthGridItem: {
    width: '31%',
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    alignItems: 'center',
    justifyContent: 'center'
  },
  monthGridItemSelected: {
    backgroundColor: '#0284c7',
    borderColor: '#0284c7'
  },
  monthGridEn: { fontSize: 12, fontWeight: 'bold', color: '#1e293b' },
  monthGridHi: { fontSize: 10, color: '#64748b', marginTop: 2 },
  monthGridTextSelected: { color: '#ffffff' },
  monthPickerCloseBtn: {
    marginTop: 14,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#f1f5f9',
    alignItems: 'center'
  },
  monthPickerCloseText: { color: '#475569', fontWeight: 'bold', fontSize: 13 },

  // Calendar Picker Modal Styles
  calendarPickerCard: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 16,
    width: '94%',
    maxWidth: 360,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 10
  },
  calendarPickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10
  },
  modalCloseText: {
    fontSize: 16,
    color: '#64748b',
    fontWeight: 'bold',
    padding: 4
  },
  calendarTargetBadge: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#0284c7',
    backgroundColor: '#e0f2fe',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 8
  },
  calendarNavRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    backgroundColor: '#f8fafc',
    padding: 6,
    borderRadius: 10
  },
  calNavArrowBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: '#ffffff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0'
  },
  calNavArrowText: { fontSize: 13, fontWeight: 'bold', color: '#0284c7' },
  calendarNavTitle: { fontSize: 14, fontWeight: 'bold', color: '#0f172a' },
  calendarWeekRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    marginBottom: 6
  },
  calendarWeekText: {
    width: 38,
    textAlign: 'center',
    fontSize: 11,
    fontWeight: 'bold',
    color: '#64748b'
  },
  calendarDaysGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start'
  },
  calendarDayCell: {
    width: `${100 / 7}%`,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 2,
    borderRadius: 8
  },
  calendarDayCellSelected: {
    backgroundColor: '#0284c7'
  },
  calendarDayCellToday: {
    borderWidth: 1.5,
    borderColor: '#0284c7'
  },
  calendarDayText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1e293b'
  },
  calendarDayTextSelected: {
    color: '#ffffff',
    fontWeight: 'bold'
  },
  calendarDayTextToday: {
    color: '#0284c7',
    fontWeight: 'bold'
  }
});

