import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Linking
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ref, get } from 'firebase/database';
import { rtdb } from '../../config/firebase';
import { useApp } from '../../context/AppContext';
import {
  SubscriptionService,
  SubscriptionStatusResult
} from '../../services/subscriptionService';
import { Supplier, SubscriptionPlanType } from '../../types';
import { formatToDisplayDate } from '../../utils/dateUtils';
import { showAlert, confirmAction } from '../../utils/alertUtils';

export interface SupplierUsageStats {
  customersCount: number;
  milkEntriesCount: number;
  inwardCount: number;
  paymentsCount: number;
  lastActiveAt: number;
  lastEntryDate: string | null;
  isActiveRecently: boolean;
  activityLabelHi: string;
  activityLabelEn: string;
  timeAgoStr: string;
  statusBadgeColor: 'green' | 'yellow' | 'red' | 'gray';
}

interface SupplierWithSub {
  id: string;
  name: string;
  phone: string;
  businessName: string;
  createdAt: number;
  subDetails: SubscriptionStatusResult;
  usageStats: SupplierUsageStats;
  pendingSubscription?: {
    plan: SubscriptionPlanType;
    amount: number;
    utr: string;
    submittedAt: number;
  };
}

export const SuperAdminScreen: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const { lang, supplier } = useApp();
  const [suppliersList, setSuppliersList] = useState<SupplierWithSub[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<'all' | 'using' | 'dormant' | 'active' | 'trial' | 'expired'>('all');
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  // Admin UPI ID state
  const [adminUpiInput, setAdminUpiInput] = useState(SubscriptionService.getAdminUpiId());
  const [currentSavedUpi, setCurrentSavedUpi] = useState(SubscriptionService.getAdminUpiId());
  const [isSavingUpi, setIsSavingUpi] = useState(false);

  useEffect(() => {
    fetchCloudSuppliers();
    SubscriptionService.fetchAdminUpiIdFromCloud().then(id => {
      if (id) {
        setAdminUpiInput(id);
        setCurrentSavedUpi(id);
      }
    });
  }, []);

  const fetchCloudSuppliers = async () => {
    try {
      setIsLoading(true);
      const suppliersRef = ref(rtdb, 'suppliers');
      const snap = await get(suppliersRef);

      if (!snap.exists()) {
        setSuppliersList([]);
        return;
      }

      const raw = snap.val();
      const list: SupplierWithSub[] = [];

      for (const [suppId, data] of Object.entries<any>(raw)) {
        if (!data) continue;
        const profile: Supplier = data.profile || {
          id: suppId,
          name: 'Supplier',
          phone: suppId.replace('supp_', ''),
          businessName: 'Dairy Farm',
          createdAt: Date.now()
        };

        const subDetails = SubscriptionService.getSubscriptionStatus(profile);

        // Calculate Usage & Activity Metrics
        const custCount = data.customers && typeof data.customers === 'object' ? Object.keys(data.customers).length : 0;
        const entryCount = data.milkEntries && typeof data.milkEntries === 'object' ? Object.keys(data.milkEntries).length : 0;
        const inwardCount = data.milkInwardEntries && typeof data.milkInwardEntries === 'object' ? Object.keys(data.milkInwardEntries).length : 0;
        const payCount = data.payments && typeof data.payments === 'object' ? Object.keys(data.payments).length : 0;

        let lastActive = (profile as any).lastSyncedAt || (profile as any).updatedAt || data.updatedAt || data.lastActiveAt || profile.createdAt || Date.now();
        let latestEntryDateIso: string | null = null;

        if (data.milkEntries && typeof data.milkEntries === 'object') {
          for (const e of Object.values<any>(data.milkEntries)) {
            if (!e) continue;
            if (e.createdAt && e.createdAt > lastActive) lastActive = e.createdAt;
            if (e.updatedAt && e.updatedAt > lastActive) lastActive = e.updatedAt;
            if (e.date && (!latestEntryDateIso || e.date > latestEntryDateIso)) {
              latestEntryDateIso = e.date;
            }
          }
        }

        if (data.milkInwardEntries && typeof data.milkInwardEntries === 'object') {
          for (const i of Object.values<any>(data.milkInwardEntries)) {
            if (!i) continue;
            if (i.createdAt && i.createdAt > lastActive) lastActive = i.createdAt;
            if (i.updatedAt && i.updatedAt > lastActive) lastActive = i.updatedAt;
            if (i.date && (!latestEntryDateIso || i.date > latestEntryDateIso)) {
              latestEntryDateIso = i.date;
            }
          }
        }

        const now = Date.now();
        const diffMs = Math.max(0, now - lastActive);
        const diffHours = diffMs / (1000 * 60 * 60);
        const diffDays = Math.floor(diffHours / 24);

        let timeAgoStr = 'आज';
        if (diffHours < 1) timeAgoStr = 'अभी सक्रिय';
        else if (diffHours < 24) timeAgoStr = `${Math.floor(diffHours)} घंटे पहले`;
        else if (diffDays === 1) timeAgoStr = 'कल';
        else timeAgoStr = `${diffDays} दिन पहले`;

        let isActiveRecently = false;
        let activityLabelHi = '🔴 बंद पड़ा है (Inactive)';
        let activityLabelEn = '🔴 Inactive';
        let statusBadgeColor: 'green' | 'yellow' | 'red' | 'gray' = 'red';

        if (entryCount === 0 && custCount === 0) {
          activityLabelHi = '⚪ खाली खाता (डेटा नहीं)';
          activityLabelEn = '⚪ Empty Account';
          statusBadgeColor = 'gray';
        } else if (diffDays <= 2) {
          isActiveRecently = true;
          activityLabelHi = '🟢 सक्रिय (Active)';
          activityLabelEn = '🟢 Active';
          statusBadgeColor = 'green';
        } else if (diffDays <= 7) {
          isActiveRecently = true;
          activityLabelHi = '🟡 मध्यम सक्रिय (3-7 दिन)';
          activityLabelEn = '🟡 Moderate';
          statusBadgeColor = 'yellow';
        } else {
          activityLabelHi = '🔴 निष्क्रिय (7+ दिन से बंद)';
          activityLabelEn = '🔴 Dormant';
          statusBadgeColor = 'red';
        }

        const usageStats: SupplierUsageStats = {
          customersCount: custCount,
          milkEntriesCount: entryCount,
          inwardCount,
          paymentsCount: payCount,
          lastActiveAt: lastActive,
          lastEntryDate: latestEntryDateIso ? formatToDisplayDate(latestEntryDateIso) : null,
          isActiveRecently,
          activityLabelHi,
          activityLabelEn,
          timeAgoStr,
          statusBadgeColor
        };

        list.push({
          id: suppId,
          name: profile.name,
          phone: profile.phone,
          businessName: profile.businessName,
          createdAt: profile.createdAt || Date.now(),
          subDetails,
          usageStats,
          pendingSubscription: data.pendingSubscription
        });
      }

      // Sort newest created first
      list.sort((a, b) => b.createdAt - a.createdAt);
      setSuppliersList(list);
    } catch (err) {
      console.warn('Super Admin fetch error:', err);
      showAlert('Error', 'Failed to fetch suppliers from cloud database.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleActivate = (target: SupplierWithSub, plan: SubscriptionPlanType) => {
    const planName = plan === 'monthly' ? '1 Month' : plan === 'half_yearly' ? '6 Months' : plan === 'annual' ? '1 Year' : 'Lifetime';
    confirmAction(
      lang === 'hi' ? 'सदस्यता सक्रिय करें (Activate)' : 'Activate Subscription',
      lang === 'hi'
        ? `क्या आप ${target.businessName} (${target.phone}) के लिए ${planName} सदस्यता सक्रिय करना चाहते हैं?`
        : `Activate ${planName} subscription for ${target.businessName} (${target.phone})?`,
      async () => {
        try {
          setUpdatingId(target.id);
          const adminPhone = supplier?.phone || '8721873433';
          const res = await SubscriptionService.activateSubscriptionByAdmin(
            target.id,
            plan,
            adminPhone,
            `Activated via Super Admin Screen by ${adminPhone}`
          );

          if (res.success) {
            showAlert('✓ Success', res.message);
            await fetchCloudSuppliers();
          } else {
            showAlert('Error', res.message);
          }
        } finally {
          setUpdatingId(null);
        }
      },
      lang === 'hi' ? '✓ सक्रिय करें (Activate)' : 'Activate',
      lang === 'hi' ? 'रद्द करें (Cancel)' : 'Cancel',
      false
    );
  };

  const handleSaveAdminUpi = async () => {
    const clean = adminUpiInput.trim();
    if (!clean || !clean.includes('@')) {
      showAlert(
        lang === 'hi' ? 'अमान्य UPI ID' : 'Invalid UPI ID',
        lang === 'hi'
          ? 'कृपया सही बैंक UPI ID दर्ज करें जिसमें @ हो (उदा. 8721873433@ybl)'
          : 'Please enter a valid bank UPI ID with @ (e.g. 8721873433@ybl)'
      );
      return;
    }
    try {
      setIsSavingUpi(true);
      await SubscriptionService.setAdminUpiId(clean);
      setCurrentSavedUpi(clean);
      showAlert(
        lang === 'hi' ? '✓ UPI ID सहेजा गया' : '✓ UPI ID Saved',
        lang === 'hi'
          ? `सक्रिय बैंक UPI ID अब "${clean}" सेट हो गया है। सभी डेयरियों को QR और पेमेंट के लिए यही दिखेगा।`
          : `Active Bank UPI ID is now "${clean}". All suppliers will now pay to this handle.`
      );
    } catch (err: any) {
      showAlert('Error', err?.message || 'Failed to save UPI ID');
    } finally {
      setIsSavingUpi(false);
    }
  };

  const handleSetUpiSuffix = (suffix: string) => {
    const adminNum = '8721873433';
    setAdminUpiInput(`${adminNum}@${suffix}`);
  };

  const filteredList = useMemo(() => {
    let list = suppliersList;
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter(
        s =>
          (s.businessName && s.businessName.toLowerCase().includes(q)) ||
          (s.name && s.name.toLowerCase().includes(q)) ||
          (s.phone && s.phone.includes(q))
      );
    }

    if (activeFilter === 'using') {
      list = list.filter(s => s.usageStats.isActiveRecently && (s.usageStats.milkEntriesCount > 0 || s.usageStats.customersCount > 0));
    } else if (activeFilter === 'dormant') {
      list = list.filter(s => !s.usageStats.isActiveRecently || (s.usageStats.milkEntriesCount === 0 && s.usageStats.customersCount === 0));
    } else if (activeFilter === 'active') {
      list = list.filter(s => s.subDetails.status === 'active');
    } else if (activeFilter === 'trial') {
      list = list.filter(s => s.subDetails.status === 'trial_active');
    } else if (activeFilter === 'expired') {
      list = list.filter(s => s.subDetails.status === 'expired' || s.subDetails.isLocked);
    }

    return list;
  }, [suppliersList, searchQuery, activeFilter]);

  const kpis = useMemo(() => {
    const total = suppliersList.length;
    let active = 0;
    let trial = 0;
    let expired = 0;
    let activelyUsing = 0;
    let dormant = 0;

    suppliersList.forEach(s => {
      if (s.subDetails.status === 'active') active++;
      else if (s.subDetails.status === 'trial_active') trial++;
      else expired++;

      if (s.usageStats.isActiveRecently && (s.usageStats.milkEntriesCount > 0 || s.usageStats.customersCount > 0)) {
        activelyUsing++;
      } else {
        dormant++;
      }
    });

    return { total, active, trial, expired, activelyUsing, dormant };
  }, [suppliersList]);

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Top Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Text style={styles.backBtnText}>◀ {lang === 'hi' ? 'वापस' : 'Back'}</Text>
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={styles.headerTitle}>👑 सुपर एडमिन पैनल</Text>
          <Text style={styles.headerSubtitle}>Super Admin & Activity Monitor</Text>
        </View>
        <TouchableOpacity onPress={fetchCloudSuppliers} style={styles.refreshBtn}>
          <Text style={styles.refreshBtnText}>🔄</Text>
        </TouchableOpacity>
      </View>

      {/* KPI Cards Row 1: App Usage & Health */}
      <View style={styles.kpiRow}>
        <View style={[styles.kpiCard, { borderColor: '#bfdbfe', backgroundColor: '#eff6ff' }]}>
          <Text style={styles.kpiVal}>{kpis.total}</Text>
          <Text style={styles.kpiLabel}>कुल डेयरियां</Text>
        </View>
        <View style={[styles.kpiCard, { borderColor: '#86efac', backgroundColor: '#f0fdf4' }]}>
          <Text style={[styles.kpiVal, { color: '#15803d' }]}>{kpis.activelyUsing}</Text>
          <Text style={styles.kpiLabel}>🟢 चालू (Active)</Text>
        </View>
        <View style={[styles.kpiCard, { borderColor: '#fca5a5', backgroundColor: '#fef2f2' }]}>
          <Text style={[styles.kpiVal, { color: '#b91c1c' }]}>{kpis.dormant}</Text>
          <Text style={styles.kpiLabel}>🔴 बंद/खाली</Text>
        </View>
        <View style={[styles.kpiCard, { borderColor: '#bbf7d0', backgroundColor: '#f0fdf4' }]}>
          <Text style={[styles.kpiVal, { color: '#16a34a' }]}>{kpis.active}</Text>
          <Text style={styles.kpiLabel}>सक्रिय (Paid)</Text>
        </View>
      </View>

      {/* Admin Bank UPI ID Card */}
      <View style={styles.upiConfigCard}>
        <View style={styles.upiConfigHeader}>
          <Text style={styles.upiConfigTitle}>💳 एडमिन बैंक UPI ID (भुगतान प्राप्ति)</Text>
          <View style={styles.liveUpiBadge}>
            <Text style={styles.liveUpiBadgeText}>सक्रिय: {currentSavedUpi}</Text>
          </View>
        </View>
        <Text style={styles.upiConfigSubtitle}>
          यह UPI ID ऐप के QR कोड और UPI पेमेंट लिंक में लाइव उपयोग होगी।
        </Text>
        <View style={styles.upiInputRow}>
          <TextInput
            style={styles.upiInputField}
            value={adminUpiInput}
            onChangeText={setAdminUpiInput}
            placeholder="उदा. 8721873433@ybl"
            placeholderTextColor="#94a3b8"
            autoCapitalize="none"
          />
          <TouchableOpacity
            style={[styles.upiSaveBtn, isSavingUpi && { opacity: 0.6 }]}
            onPress={handleSaveAdminUpi}
            disabled={isSavingUpi}
          >
            <Text style={styles.upiSaveBtnText}>{isSavingUpi ? 'सेविंग...' : '💾 सहेजें'}</Text>
          </TouchableOpacity>
        </View>
        {/* Quick Suffix Presets */}
        <View style={styles.suffixPresetsRow}>
          <Text style={styles.presetLabel}>त्वरित बैंक:</Text>
          <TouchableOpacity style={styles.suffixChip} onPress={() => handleSetUpiSuffix('ybl')}>
            <Text style={styles.suffixChipText}>@ybl</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.suffixChip} onPress={() => handleSetUpiSuffix('paytm')}>
            <Text style={styles.suffixChipText}>@paytm</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.suffixChip} onPress={() => handleSetUpiSuffix('oksbi')}>
            <Text style={styles.suffixChipText}>@oksbi</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.suffixChip} onPress={() => handleSetUpiSuffix('ibl')}>
            <Text style={styles.suffixChipText}>@ibl</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Search Bar */}
      <View style={styles.searchBarContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="🔍 नाम, डेयरी या फ़ोन नंबर से खोजें..."
          placeholderTextColor="#94a3b8"
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>

      {/* Filter Tabs */}
      <View style={styles.filterTabsRow}>
        <TouchableOpacity
          style={[styles.filterTab, activeFilter === 'all' && styles.filterTabActive]}
          onPress={() => setActiveFilter('all')}
        >
          <Text style={[styles.filterTabText, activeFilter === 'all' && styles.filterTabTextActive]}>
            सभी ({suppliersList.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterTab, activeFilter === 'using' && styles.filterTabActiveGreen]}
          onPress={() => setActiveFilter('using')}
        >
          <Text style={[styles.filterTabText, activeFilter === 'using' && styles.filterTabTextActive]}>
            🟢 चालू ({kpis.activelyUsing})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterTab, activeFilter === 'dormant' && styles.filterTabActiveRed]}
          onPress={() => setActiveFilter('dormant')}
        >
          <Text style={[styles.filterTabText, activeFilter === 'dormant' && styles.filterTabTextActive]}>
            🔴 बंद ({kpis.dormant})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterTab, activeFilter === 'active' && styles.filterTabActive]}
          onPress={() => setActiveFilter('active')}
        >
          <Text style={[styles.filterTabText, activeFilter === 'active' && styles.filterTabTextActive]}>
            सक्रिय ({kpis.active})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterTab, activeFilter === 'trial' && styles.filterTabActive]}
          onPress={() => setActiveFilter('trial')}
        >
          <Text style={[styles.filterTabText, activeFilter === 'trial' && styles.filterTabTextActive]}>
            ट्रायल ({kpis.trial})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterTab, activeFilter === 'expired' && styles.filterTabActive]}
          onPress={() => setActiveFilter('expired')}
        >
          <Text style={[styles.filterTabText, activeFilter === 'expired' && styles.filterTabTextActive]}>
            लॉक्ड ({kpis.expired})
          </Text>
        </TouchableOpacity>
      </View>

      {/* Supplier List */}
      {isLoading ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color="#0284c7" />
          <Text style={{ marginTop: 10, color: '#64748b', fontWeight: '700' }}>क्लाउड डेटा लोड हो रहा है...</Text>
        </View>
      ) : (
        <FlatList
          data={filteredList}
          keyExtractor={item => item.id}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 30 }}
          renderItem={({ item }) => {
            const isUpdating = updatingId === item.id;
            const sub = item.subDetails;
            const isExpired = sub.status === 'expired' || sub.isLocked;

            return (
              <View style={[styles.dairyCard, isExpired && styles.dairyCardExpired]}>
                <View style={styles.cardHeaderRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardDairyName}>🥛 {item.businessName || 'Dairy'}</Text>
                    <Text style={styles.cardOwnerName}>👤 {item.name || 'Owner'}</Text>
                  </View>
                  <TouchableOpacity
                    style={styles.callBtn}
                    onPress={() => Linking.openURL(`tel:${item.phone}`)}
                  >
                    <Text style={styles.callBtnText}>📞 {item.phone}</Text>
                  </TouchableOpacity>
                </View>

                {/* Status Badges Row */}
                <View style={styles.badgesRow}>
                  <View style={[styles.statusPill, isExpired ? styles.statusPillExpired : styles.statusPillActive]}>
                    <Text style={[styles.statusPillText, isExpired ? styles.statusPillTextExpired : styles.statusPillTextActive]}>
                      {sub.planNameHi}
                    </Text>
                  </View>
                  <Text style={styles.expiryInfoText}>
                    📅 समाप्ति: {sub.expiryDateStr} ({sub.daysRemaining} दिन शेष)
                  </Text>
                </View>

                {/* Real-time Usage & Activity Box */}
                <View style={[styles.usageBox, item.usageStats.isActiveRecently ? styles.usageBoxActive : styles.usageBoxDormant]}>
                  <View style={styles.usageHeaderRow}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <View style={[styles.activityDot, item.usageStats.isActiveRecently ? styles.dotGreen : styles.dotRed]} />
                      <Text style={[styles.usageBadgeText, item.usageStats.isActiveRecently ? styles.textGreen : styles.textRed]}>
                        {lang === 'hi' ? item.usageStats.activityLabelHi : item.usageStats.activityLabelEn}
                      </Text>
                    </View>
                    <Text style={styles.usageTimeAgoText}>
                      ⏱️ {item.usageStats.timeAgoStr}
                    </Text>
                  </View>

                  {/* 4 Key Usage Metrics Grid */}
                  <View style={styles.usageGrid}>
                    <View style={styles.usageStatItem}>
                      <Text style={styles.usageStatVal}>👥 {item.usageStats.customersCount}</Text>
                      <Text style={styles.usageStatLabel}>ग्राहक</Text>
                    </View>
                    <View style={styles.usageStatItem}>
                      <Text style={styles.usageStatVal}>🥛 {item.usageStats.milkEntriesCount}</Text>
                      <Text style={styles.usageStatLabel}>दूध एंट्रीज</Text>
                    </View>
                    <View style={styles.usageStatItem}>
                      <Text style={styles.usageStatVal}>🌾 {item.usageStats.inwardCount}</Text>
                      <Text style={styles.usageStatLabel}>किसान खरीद</Text>
                    </View>
                    <View style={styles.usageStatItem}>
                      <Text style={styles.usageStatVal}>{item.usageStats.lastEntryDate || '—'}</Text>
                      <Text style={styles.usageStatLabel}>अंतिम दूध</Text>
                    </View>
                  </View>

                  {item.usageStats.milkEntriesCount === 0 && (
                    <View style={styles.dormantTipRow}>
                      <Text style={styles.dormantTipText}>
                        💡 अभी तक कोई दूध दर्ज नहीं किया। सहायता के लिए कॉल करें।
                      </Text>
                    </View>
                  )}
                </View>

                {/* Pending Verification Notice */}
                {item.pendingSubscription && (
                  <View style={styles.pendingBox}>
                    <Text style={styles.pendingText}>
                      ⚠️ UTR सबमिट हुआ: {item.pendingSubscription.utr} (₹{item.pendingSubscription.amount} - {item.pendingSubscription.plan})
                    </Text>
                  </View>
                )}

                {/* 1-Tap Action Extension Buttons */}
                <Text style={styles.actionLabel}>सक्रिय या एक्सटेंड करें (1-Tap Activate):</Text>
                <View style={styles.actionsGrid}>
                  <TouchableOpacity
                    style={[styles.actBtn, styles.actBtn1Mo, isUpdating && { opacity: 0.5 }]}
                    onPress={() => handleActivate(item, 'monthly')}
                    disabled={isUpdating}
                  >
                    <Text style={styles.actBtnText}>+1 Mo (₹99)</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.actBtn, styles.actBtn6Mo, isUpdating && { opacity: 0.5 }]}
                    onPress={() => handleActivate(item, 'half_yearly')}
                    disabled={isUpdating}
                  >
                    <Text style={styles.actBtnText}>+6 Mo (₹499)</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.actBtn, styles.actBtn1Yr, isUpdating && { opacity: 0.5 }]}
                    onPress={() => handleActivate(item, 'annual')}
                    disabled={isUpdating}
                  >
                    <Text style={styles.actBtnText}>+1 Yr (₹899)</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.actBtn, styles.actBtnLife, isUpdating && { opacity: 0.5 }]}
                    onPress={() => handleActivate(item, 'lifetime')}
                    disabled={isUpdating}
                  >
                    <Text style={styles.actBtnText}>👑 Lifetime</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          }}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', marginTop: 40 }}>
              <Text style={{ fontSize: 14, color: '#94a3b8', fontWeight: '700' }}>कोई डेयरी नहीं मिली।</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f8fafc'
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0'
  },
  backBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: '#f1f5f9'
  },
  backBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0369a1'
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0f172a'
  },
  headerSubtitle: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748b'
  },
  refreshBtn: {
    padding: 8
  },
  refreshBtnText: {
    fontSize: 18
  },
  kpiRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12
  },
  kpiCard: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
    alignItems: 'center'
  },
  kpiVal: {
    fontSize: 18,
    fontWeight: '900',
    color: '#0f172a'
  },
  kpiLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748b',
    marginTop: 2
  },
  searchBarContainer: {
    paddingHorizontal: 16,
    marginBottom: 8
  },
  searchInput: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 9,
    fontSize: 13,
    color: '#0f172a'
  },
  filterTabsRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 6,
    marginBottom: 12
  },
  filterTab: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0'
  },
  filterTabActive: {
    backgroundColor: '#0284c7',
    borderColor: '#0284c7'
  },
  filterTabText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748b'
  },
  filterTabTextActive: {
    color: '#ffffff'
  },
  dairyCard: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 14,
    padding: 14,
    marginBottom: 12
  },
  dairyCardExpired: {
    borderColor: '#fca5a5',
    backgroundColor: '#fffafb'
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8
  },
  cardDairyName: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0f172a'
  },
  cardOwnerName: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b',
    marginTop: 1
  },
  callBtn: {
    backgroundColor: '#f0fdf4',
    borderWidth: 1,
    borderColor: '#bbf7d0',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6
  },
  callBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#16a34a'
  },
  badgesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
    flexWrap: 'wrap'
  },
  statusPill: {
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 6
  },
  statusPillActive: {
    backgroundColor: '#f0fdf4',
    borderWidth: 1,
    borderColor: '#bbf7d0'
  },
  statusPillExpired: {
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca'
  },
  statusPillText: {
    fontSize: 11,
    fontWeight: '800'
  },
  statusPillTextActive: {
    color: '#16a34a'
  },
  statusPillTextExpired: {
    color: '#dc2626'
  },
  expiryInfoText: {
    fontSize: 11,
    color: '#64748b',
    fontWeight: '600'
  },
  pendingBox: {
    backgroundColor: '#fffbeb',
    borderWidth: 1,
    borderColor: '#fde68a',
    padding: 8,
    borderRadius: 8,
    marginBottom: 10
  },
  pendingText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#b45309'
  },
  actionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
    marginBottom: 6
  },
  actionsGrid: {
    flexDirection: 'row',
    gap: 6
  },
  actBtn: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center'
  },
  actBtnText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#ffffff'
  },
  actBtn1Mo: {
    backgroundColor: '#0284c7'
  },
  actBtn6Mo: {
    backgroundColor: '#0d9488'
  },
  actBtn1Yr: {
    backgroundColor: '#16a34a'
  },
  actBtnLife: {
    backgroundColor: '#7c3aed'
  },
  upiConfigCard: {
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 4,
    padding: 12,
    backgroundColor: '#ffffff',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#bfdbfe',
    shadowColor: '#0284c7',
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2
  },
  upiConfigHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4
  },
  upiConfigTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0f172a'
  },
  liveUpiBadge: {
    backgroundColor: '#eff6ff',
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#bfdbfe'
  },
  liveUpiBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#0284c7'
  },
  upiConfigSubtitle: {
    fontSize: 11,
    color: '#64748b',
    marginBottom: 8
  },
  upiInputRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center'
  },
  upiInputField: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    fontSize: 13,
    color: '#0f172a',
    backgroundColor: '#f8fafc'
  },
  upiSaveBtn: {
    backgroundColor: '#0284c7',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center'
  },
  upiSaveBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#ffffff'
  },
  suffixPresetsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8
  },
  presetLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748b'
  },
  suffixChip: {
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#e2e8f0'
  },
  suffixChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#334155'
  },
  filterTabActiveGreen: {
    backgroundColor: '#16a34a'
  },
  filterTabActiveRed: {
    backgroundColor: '#dc2626'
  },
  usageBox: {
    borderRadius: 12,
    padding: 10,
    marginTop: 8,
    marginBottom: 8,
    borderWidth: 1
  },
  usageBoxActive: {
    backgroundColor: '#f0fdf4',
    borderColor: '#bbf7d0'
  },
  usageBoxDormant: {
    backgroundColor: '#f8fafc',
    borderColor: '#e2e8f0'
  },
  usageHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8
  },
  activityDot: {
    width: 8,
    height: 8,
    borderRadius: 4
  },
  dotGreen: {
    backgroundColor: '#16a34a'
  },
  dotRed: {
    backgroundColor: '#dc2626'
  },
  dotGray: {
    backgroundColor: '#94a3b8'
  },
  usageBadgeText: {
    fontSize: 11,
    fontWeight: '800'
  },
  textGreen: {
    color: '#15803d'
  },
  textRed: {
    color: '#b91c1c'
  },
  textGray: {
    color: '#64748b'
  },
  usageTimeAgoText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748b'
  },
  usageGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 4
  },
  usageStatItem: {
    flex: 1,
    backgroundColor: '#ffffff',
    paddingVertical: 6,
    paddingHorizontal: 4,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0'
  },
  usageStatVal: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0f172a'
  },
  usageStatLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: '#64748b',
    marginTop: 2
  },
  dormantTipRow: {
    marginTop: 6,
    backgroundColor: '#fffbeb',
    borderRadius: 6,
    paddingVertical: 4,
    paddingHorizontal: 6,
    borderWidth: 1,
    borderColor: '#fde68a'
  },
  dormantTipText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#b45309'
  }
});
