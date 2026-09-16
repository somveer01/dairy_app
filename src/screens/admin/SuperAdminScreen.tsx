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

interface SupplierWithSub {
  id: string;
  name: string;
  phone: string;
  businessName: string;
  createdAt: number;
  subDetails: SubscriptionStatusResult;
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
  const [activeFilter, setActiveFilter] = useState<'all' | 'active' | 'trial' | 'expired'>('all');
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  useEffect(() => {
    fetchCloudSuppliers();
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
        list.push({
          id: suppId,
          name: profile.name,
          phone: profile.phone,
          businessName: profile.businessName,
          createdAt: profile.createdAt || Date.now(),
          subDetails,
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

    if (activeFilter === 'active') {
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

    suppliersList.forEach(s => {
      if (s.subDetails.status === 'active') active++;
      else if (s.subDetails.status === 'trial_active') trial++;
      else expired++;
    });

    return { total, active, trial, expired };
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
          <Text style={styles.headerSubtitle}>Super Admin Subscription Manager</Text>
        </View>
        <TouchableOpacity onPress={fetchCloudSuppliers} style={styles.refreshBtn}>
          <Text style={styles.refreshBtnText}>🔄</Text>
        </TouchableOpacity>
      </View>

      {/* KPI Cards Row */}
      <View style={styles.kpiRow}>
        <View style={[styles.kpiCard, { borderColor: '#bfdbfe', backgroundColor: '#eff6ff' }]}>
          <Text style={styles.kpiVal}>{kpis.total}</Text>
          <Text style={styles.kpiLabel}>कुल डेयरियां</Text>
        </View>
        <View style={[styles.kpiCard, { borderColor: '#bbf7d0', backgroundColor: '#f0fdf4' }]}>
          <Text style={[styles.kpiVal, { color: '#16a34a' }]}>{kpis.active}</Text>
          <Text style={styles.kpiLabel}>सक्रिय (Paid)</Text>
        </View>
        <View style={[styles.kpiCard, { borderColor: '#fed7aa', backgroundColor: '#fff7ed' }]}>
          <Text style={[styles.kpiVal, { color: '#ea580c' }]}>{kpis.trial}</Text>
          <Text style={styles.kpiLabel}>फ्री ट्रायल</Text>
        </View>
        <View style={[styles.kpiCard, { borderColor: '#fecaca', backgroundColor: '#fef2f2' }]}>
          <Text style={[styles.kpiVal, { color: '#dc2626' }]}>{kpis.expired}</Text>
          <Text style={styles.kpiLabel}>समाप्त/लॉक्ड</Text>
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
  }
});
