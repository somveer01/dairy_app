import React, { useMemo, useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  TextInput,
  Keyboard,
  Platform
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useApp } from '../../context/AppContext';
import { StorageService } from '../../services/storageService';
import { InstallAppModal } from '../../components/InstallAppModal';
import { formatToDisplayDate } from '../../utils/dateUtils';

export const DashboardScreen = ({ navigation }: any) => {
  const { t, supplier, setSupplier, customers, milkEntries, payments } = useApp();

  const todayStr = new Date().toISOString().split('T')[0];


  // Metrics for Today
  const todayStats = useMemo(() => {
    const todayEntries = milkEntries.filter(e => e.date === todayStr);

    let cowLitres = 0;
    let buffaloLitres = 0;
    let totalBilled = 0;

    todayEntries.forEach(entry => {
      if (entry.milkType === 'cow') cowLitres += entry.quantityLitres;
      if (entry.milkType === 'buffalo') buffaloLitres += entry.quantityLitres;
      totalBilled += entry.amount;
    });

    return {
      cowLitres,
      buffaloLitres,
      totalLitres: cowLitres + buffaloLitres,
      totalBilled,
      deliveredCount: todayEntries.length
    };
  }, [milkEntries, todayStr]);

  // Total Outstanding Due across all customers
  const overallDue = useMemo(() => {
    const totalDeliveriesAmount = milkEntries.reduce((sum, e) => sum + e.amount, 0);
    const totalPaymentsReceived = payments.reduce((sum, p) => sum + p.amountPaid, 0);
    return Math.max(0, totalDeliveriesAmount - totalPaymentsReceived);
  }, [milkEntries, payments]);

  // Dairy Name Setup / Edit Modal State
  const [editDairyModalVisible, setEditDairyModalVisible] = useState(false);
  const [dairyNameInput, setDairyNameInput] = useState('');
  const [ownerNameInput, setOwnerNameInput] = useState('');

  // Automatically prompt if supplier profile has placeholder/default name
  useEffect(() => {
    if (
      supplier &&
      (supplier.businessName === 'Om Fresh Dairy Farm' ||
        supplier.name === 'Om Dairy Supplier' ||
        supplier.businessName === 'Fresh Milk Dairy' ||
        supplier.businessName === 'Krishna Fresh Dairy' ||
        !supplier.businessName)
    ) {
      setDairyNameInput(supplier.businessName === 'Om Fresh Dairy Farm' ? '' : supplier.businessName);
      setOwnerNameInput(supplier.name === 'Om Dairy Supplier' ? '' : supplier.name);
      setEditDairyModalVisible(true);
    }
  }, [supplier]);

  const handleSaveDairyProfile = async () => {
    Keyboard.dismiss();
    const finalBusiness = dairyNameInput.trim() || 'My Dairy Farm';
    const finalOwner = ownerNameInput.trim() || supplier?.name || 'Dairy Supplier';

    const updated = {
      ...(supplier || { id: 'supp_1', createdAt: Date.now() }),
      phone: supplier?.phone || '',
      businessName: finalBusiness,
      name: finalOwner
    };

    await StorageService.saveSupplier(updated);
    setSupplier(updated);
    setEditDairyModalVisible(false);
  };

  // App Install Banner & Modal State
  const [installModalVisible, setInstallModalVisible] = useState(false);
  const [showInstallBanner, setShowInstallBanner] = useState(false);

  useEffect(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const isStandalone =
        window.matchMedia('(display-mode: standalone)').matches ||
        (window.navigator as any).standalone === true ||
        (typeof document !== 'undefined' && document.referrer.includes('android-app://'));

      const isDismissed = sessionStorage.getItem('dairy_install_banner_dismissed') === 'true';
      if (!isStandalone && !isDismissed) {
        setShowInstallBanner(true);
      }
    }
  }, []);

  const handleOpenInstall = () => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const prompt = (window as any).pwaDeferredPrompt;
      if (prompt) {
        prompt.prompt();
        prompt.userChoice.then((choice: any) => {
          if (choice.outcome === 'accepted') {
            setShowInstallBanner(false);
          }
          (window as any).pwaDeferredPrompt = null;
        });
        return;
      }
    }
    setInstallModalVisible(true);
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['left', 'right']}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="always"
        showsVerticalScrollIndicator={false}
      >
        {/* Header greeting */}
        <View style={styles.header}>
          <TouchableOpacity
            style={{ flex: 1 }}
            onPress={() => {
              setDairyNameInput(supplier?.businessName === 'Om Fresh Dairy Farm' ? '' : (supplier?.businessName || ''));
              setOwnerNameInput(supplier?.name === 'Om Dairy Supplier' ? '' : (supplier?.name || ''));
              setEditDairyModalVisible(true);
            }}
            activeOpacity={0.7}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={styles.greeting} numberOfLines={1}>नमस्ते, {supplier?.name || 'दूध विक्रेता'}</Text>
              <Text style={{ fontSize: 13 }}>✏️</Text>
            </View>
            <Text style={styles.businessName} numberOfLines={1}>
              {supplier?.businessName || 'डेयरी का नाम सेट करें (Tap to set)'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.profileBadge}
            onPress={() => navigation.navigate('SettingsTab')}
            activeOpacity={0.7}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Text style={styles.profileBadgeText}>⚙️</Text>
          </TouchableOpacity>
        </View>

        {/* App Installation Prompt Card (Web browser mode) */}
        {showInstallBanner && (
          <View style={styles.installBannerCard}>
            <View style={styles.installBannerIconBox}>
              <Text style={{ fontSize: 24 }}>📲</Text>
            </View>
            <View style={{ flex: 1, paddingHorizontal: 6 }}>
              <Text style={styles.installBannerTitle}>Install App on Phone</Text>
              <Text style={styles.installBannerSub}>मोबाइल पर ऐप इंस्टॉल करें (1-टैप में खोलें)</Text>
            </View>
            <TouchableOpacity
              style={styles.installBannerBtn}
              onPress={handleOpenInstall}
              activeOpacity={0.8}
            >
              <Text style={styles.installBannerBtnText}>Install</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => {
                setShowInstallBanner(false);
                if (typeof window !== 'undefined') {
                  sessionStorage.setItem('dairy_install_banner_dismissed', 'true');
                }
              }}
              style={styles.installBannerClose}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Text style={styles.installBannerCloseText}>✕</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Total Outstanding Dues Card */}
        <View style={styles.dueCard}>
          <Text style={styles.dueCardLabel}>{t.totalOutstanding}</Text>
          <Text style={styles.dueCardAmount}>₹{overallDue.toFixed(2)}</Text>
          <View style={styles.dueCardFooter}>
            <Text style={styles.dueCardFooterText}>
              Across {customers.length} registered customers
            </Text>
            <TouchableOpacity
              onPress={() => navigation.navigate('ReportsTab')}
              activeOpacity={0.7}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Text style={styles.viewReportLink}>View Dues →</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Today's Deliveries Section */}
        <Text style={styles.sectionHeading}>{t.todayDeliveries} ({formatToDisplayDate(todayStr)})</Text>


        <View style={styles.statsGrid}>
          {/* Cow Milk Box */}
          <View style={[styles.statBox, { backgroundColor: '#fef3c7' }]}>
            <Text style={styles.milkEmoji}>🐄</Text>
            <Text style={styles.statNumber}>{todayStats.cowLitres.toFixed(1)} L</Text>
            <Text style={styles.statLabel}>{t.cowMilk}</Text>
          </View>

          {/* Buffalo Milk Box */}
          <View style={[styles.statBox, { backgroundColor: '#e0e7ff' }]}>
            <Text style={styles.milkEmoji}>🐃</Text>
            <Text style={styles.statNumber}>{todayStats.buffaloLitres.toFixed(1)} L</Text>
            <Text style={styles.statLabel}>{t.buffaloMilk}</Text>
          </View>
        </View>

        {/* Total billed today */}
        <View style={styles.todayBilledCard}>
          <View>
            <Text style={styles.statSmallLabel}>{t.todayBilled}</Text>
            <Text style={styles.todayBilledAmount}>₹{todayStats.totalBilled.toFixed(2)}</Text>
          </View>
          <View style={styles.deliveredCountBadge}>
            <Text style={styles.deliveredCountText}>
              {todayStats.deliveredCount} / {customers.length} Delivered
            </Text>
          </View>
        </View>

        {/* Quick Actions */}
        <Text style={styles.sectionHeading}>Quick Actions</Text>
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={styles.primaryActionButton}
            onPress={() => navigation.navigate('RegisterTab')}
            activeOpacity={0.7}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          >
            <Text style={styles.primaryActionText}>📝 {t.quickAddEntry}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryActionButton}
            onPress={() => navigation.navigate('CustomersTab')}
            activeOpacity={0.7}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          >
            <Text style={styles.secondaryActionText}>👥 + Add Customer</Text>
          </TouchableOpacity>
        </View>

        {/* Recent Customers Overview */}
        <View style={styles.customerHeaderRow}>
          <Text style={styles.sectionHeading}>{t.customers} ({customers.length})</Text>
          <TouchableOpacity
            onPress={() => navigation.navigate('CustomersTab')}
            activeOpacity={0.7}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Text style={styles.seeAllText}>See All</Text>
          </TouchableOpacity>
        </View>

        {customers.slice(0, 4).map(customer => (
          <View key={customer.id} style={styles.customerCard}>
            <View style={styles.customerInfo}>
              <Text style={styles.customerName}>{customer.name}</Text>
              <Text style={styles.customerSub}>
                {customer.milkType === 'cow' ? '🐄 Cow' : '🐃 Buffalo'} • {customer.defaultLitres} L/day @ ₹{customer.ratePerLitre}/L
              </Text>
            </View>
            <Text style={styles.customerPhone}>📞 {customer.phone}</Text>
          </View>
        ))}
      </ScrollView>

      {/* Dairy Profile Edit / Setup Popup Modal */}
      <Modal visible={editDairyModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalIcon}>🥛</Text>
              <Text style={styles.modalTitle}>डेयरी प्रोफाइल सेट करें</Text>
              <Text style={styles.modalSubtitle}>
                Set your dairy farm name and owner name for receipts & daily registers.
              </Text>
            </View>

            <View style={styles.modalBody}>
              <Text style={styles.modalLabel}>Dairy / Business Name (डेयरी का नाम) *</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="e.g. Radhe Dairy / राधे डेयरी फ़ार्म"
                placeholderTextColor="#94a3b8"
                value={dairyNameInput}
                onChangeText={setDairyNameInput}
                autoFocus
              />

              <Text style={styles.modalLabel}>Owner / Supplier Name (आपका नाम)</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="e.g. Ramesh Kumar / आपका नाम"
                placeholderTextColor="#94a3b8"
                value={ownerNameInput}
                onChangeText={setOwnerNameInput}
              />
            </View>

            <View style={styles.modalBtnRow}>
              {supplier?.businessName && supplier.businessName !== 'Om Fresh Dairy Farm' && supplier.businessName !== 'Fresh Milk Dairy' ? (
                <TouchableOpacity
                  style={styles.modalCancelBtn}
                  onPress={() => setEditDairyModalVisible(false)}
                >
                  <Text style={styles.modalCancelBtnText}>Cancel</Text>
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity
                style={[styles.modalSaveBtn, { flex: 1 }]}
                onPress={handleSaveDairyProfile}
                activeOpacity={0.8}
              >
                <Text style={styles.modalSaveBtnText}>✓ Save Dairy Profile (सहेजें)</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* App Installation Process Guide Modal */}
      <InstallAppModal
        visible={installModalVisible}
        onClose={() => setInstallModalVisible(false)}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#f8fafc' },
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 28 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16
  },
  greeting: { fontSize: 20, fontWeight: 'bold', color: '#0f172a' },
  businessName: { fontSize: 13, color: '#64748b', marginTop: 2 },
  profileBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#e2e8f0',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 10
  },
  profileBadgeText: { fontSize: 20 },
  dueCard: {
    backgroundColor: '#dc2626',
    borderRadius: 16,
    padding: 18,
    marginBottom: 18,
    shadowColor: '#dc2626',
    shadowOpacity: 0.22,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4
  },
  dueCardLabel: { color: '#fee2e2', fontSize: 13, fontWeight: '600' },
  dueCardAmount: { color: '#ffffff', fontSize: 30, fontWeight: 'bold', marginVertical: 6 },
  dueCardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.2)',
    paddingTop: 10
  },
  dueCardFooterText: { color: '#fecaca', fontSize: 12 },
  viewReportLink: { color: '#ffffff', fontSize: 13, fontWeight: 'bold' },
  sectionHeading: { fontSize: 16, fontWeight: '700', color: '#1e293b', marginBottom: 10 },
  statsGrid: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  statBox: {
    flex: 1,
    borderRadius: 14,
    padding: 14,
    alignItems: 'center',
    justifyContent: 'center'
  },
  milkEmoji: { fontSize: 30, marginBottom: 4 },
  statNumber: { fontSize: 20, fontWeight: 'bold', color: '#1e293b' },
  statLabel: { fontSize: 12, color: '#475569', marginTop: 2, fontWeight: '600' },
  todayBilledCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 18
  },
  statSmallLabel: { fontSize: 12, color: '#64748b' },
  todayBilledAmount: { fontSize: 20, fontWeight: 'bold', color: '#059669', marginTop: 2 },
  deliveredCountBadge: {
    backgroundColor: '#ecfdf5',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20
  },
  deliveredCountText: { fontSize: 12, fontWeight: '600', color: '#059669' },
  actionRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  primaryActionButton: {
    flex: 1,
    backgroundColor: '#0284c7',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center'
  },
  primaryActionText: { color: '#ffffff', fontWeight: 'bold', fontSize: 14 },
  secondaryActionButton: {
    flex: 1,
    backgroundColor: '#f1f5f9',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#cbd5e1'
  },
  secondaryActionText: { color: '#334155', fontWeight: 'bold', fontSize: 14 },
  customerHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10
  },
  seeAllText: { fontSize: 13, color: '#0284c7', fontWeight: '600' },
  customerCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#f1f5f9'
  },
  customerInfo: { flex: 1 },
  customerName: { fontSize: 14, fontWeight: '600', color: '#0f172a' },
  customerSub: { fontSize: 11, color: '#64748b', marginTop: 2 },
  customerPhone: { fontSize: 12, color: '#0284c7', fontWeight: '500' },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    padding: 20
  },
  modalContent: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    padding: 22,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 10
  },
  modalHeader: { alignItems: 'center', marginBottom: 16 },
  modalIcon: { fontSize: 44, marginBottom: 8 },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color: '#0f172a' },
  modalSubtitle: { fontSize: 12, color: '#64748b', textAlign: 'center', marginTop: 4, paddingHorizontal: 10 },
  modalBody: { marginVertical: 10 },
  modalLabel: { fontSize: 13, fontWeight: '600', color: '#334155', marginBottom: 6, marginTop: 8 },
  modalInput: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    backgroundColor: '#f8fafc',
    color: '#0f172a',
    marginBottom: 8
  },
  modalBtnRow: { flexDirection: 'row', gap: 10, marginTop: 14, alignItems: 'center' },
  modalCancelBtn: { paddingVertical: 14, paddingHorizontal: 16, borderRadius: 12, backgroundColor: '#f1f5f9' },
  modalCancelBtnText: { color: '#64748b', fontWeight: '600' },
  modalSaveBtn: {
    backgroundColor: '#16a34a',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center'
  },
  modalSaveBtnText: { color: '#ffffff', fontSize: 15, fontWeight: 'bold' },
  installBannerCard: {
    backgroundColor: '#0284c7',
    borderRadius: 14,
    padding: 12,
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#0284c7',
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 3
  },
  installBannerIconBox: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 6
  },
  installBannerTitle: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: 'bold'
  },
  installBannerSub: {
    color: '#e0f2fe',
    fontSize: 11,
    marginTop: 2
  },
  installBannerBtn: {
    backgroundColor: '#ffffff',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    marginLeft: 6
  },
  installBannerBtnText: {
    color: '#0284c7',
    fontWeight: 'bold',
    fontSize: 13
  },
  installBannerClose: {
    marginLeft: 8,
    padding: 4
  },
  installBannerCloseText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
    opacity: 0.85
  }
});
