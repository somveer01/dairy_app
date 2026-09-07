import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ScrollView,
  Share,
  Modal,
  TextInput,
  ActivityIndicator,
  Platform,
  Linking
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useApp } from '../../context/AppContext';
import { StorageService } from '../../services/storageService';
import { FirebaseSyncService } from '../../services/firebaseSyncService';
import { confirmAction, showAlert } from '../../utils/alertUtils';

export const SettingsScreen = () => {
  const {
    t,
    lang,
    setLanguage,
    supplier,
    setSupplier,
    customers,
    refreshCustomers,
    milkEntries,
    refreshMilkEntries,
    payments,
    refreshPayments
  } = useApp();

  const [inspectorVisible, setInspectorVisible] = useState(false);
  const [selectedJsonTab, setSelectedJsonTab] = useState<'overview' | 'customers' | 'entries' | 'payments'>('overview');
  const [isSyncingCloud, setIsSyncingCloud] = useState(false);

  const handleTestCloudConnection = async () => {
    setIsSyncingCloud(true);
    const res = await FirebaseSyncService.testConnection();
    setIsSyncingCloud(false);
    Alert.alert(res.success ? 'Firebase Connected' : 'Connection Notice', res.message);
  };

  const handleCloudUpload = async () => {
    if (!supplier) {
      Alert.alert('Notice', 'No active supplier profile.');
      return;
    }
    setIsSyncingCloud(true);
    const res = await FirebaseSyncService.uploadAllToCloud(supplier);
    setIsSyncingCloud(false);
    Alert.alert(res.success ? 'Cloud Backup Complete' : 'Sync Error', res.message);
  };

  const handleCloudDownload = async () => {
    if (!supplier) return;
    confirmAction(
      'Restore from Cloud',
      'Download your latest records from Firebase Cloud Firestore to this device?',
      async () => {
        setIsSyncingCloud(true);
        const res = await FirebaseSyncService.downloadFromCloud(supplier.id);
        await refreshCustomers();
        await refreshMilkEntries();
        await refreshPayments();
        setIsSyncingCloud(false);
        showAlert(res.success ? 'Restored' : 'Error', res.message);
      },
      'Restore',
      'Cancel'
    );
  };

  const handleExportBackup = async () => {
    try {
      const fullData = await StorageService.getAllStorageData();
      const jsonString = JSON.stringify(fullData, null, 2);

      await Share.share({
        title: 'Dairy_App_Full_Backup.json',
        message: jsonString
      });
    } catch (err: any) {
      showAlert('Share', `Could not open share dialog: ${err?.message || 'Unknown error'}`);
    }
  };

  const handleClearCustomers = () => {
    confirmAction(
      'Remove All Customers',
      'Are you sure you want to remove all customer profiles? This will completely empty your customer list.',
      async () => {
        await StorageService.clearAllCustomers();
        await refreshCustomers();
        showAlert('Customers Removed', 'All customer profiles have been removed.');
      },
      'Remove All',
      'Cancel'
    );
  };

  const handleResetData = () => {
    confirmAction(
      'Reset All Data',
      'Clear all customers, deliveries, and payment records? This cannot be undone.',
      async () => {
        await StorageService.clearAllData();
        await refreshCustomers();
        await refreshMilkEntries();
        await refreshPayments();
        showAlert('Reset Complete', 'All data has been cleared.');
      },
      'Reset All',
      'Cancel'
    );
  };

  const handleInstallPWA = () => {
    if (Platform.OS === 'web') {
      const prompt = (window as any).pwaDeferredPrompt;
      if (prompt) {
        prompt.prompt();
        prompt.userChoice.then((choiceResult: any) => {
          if (choiceResult.outcome === 'accepted') {
            showAlert('Success', 'Dairy App has been added to your phone screen!');
          }
        });
      } else {
        showAlert(
          'Install on Phone',
          'To install Dairy App on your phone:\n\n1. Tap the 3 dots (⋮) in your Chrome browser (or Share icon ⎋ in Safari)\n2. Select "Install app" or "Add to Home screen"\n3. The Dairy App icon will appear on your phone screen!'
        );
      }
    } else {
      showAlert('Installed', 'You are already using the installed Dairy App.');
    }
  };

  const handleLogout = () => {
    confirmAction(
      'Logout',
      'Are you sure you want to log out?',
      () => {
        setSupplier(null);
      },
      'Logout',
      'Cancel'
    );
  };


  return (
    <SafeAreaView style={styles.safeArea} edges={['left', 'right']}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="always"
        showsVerticalScrollIndicator={false}
      >
        {/* Supplier Profile Card */}
        <View style={styles.profileCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>🥛</Text>
          </View>
          <View style={styles.profileInfo}>
            <Text style={styles.supplierName}>{supplier?.name || 'Dairy Supplier'}</Text>
            <Text style={styles.businessName}>{supplier?.businessName || 'Fresh Milk Dairy'}</Text>
            <Text style={styles.phoneText}>📞 {supplier?.phone || 'N/A'}</Text>
          </View>
        </View>

        {/* Language Selection */}
        <Text style={styles.sectionHeader}>{t.language}</Text>
        <View style={styles.languageRow}>
          <TouchableOpacity
            style={[styles.langBtn, lang === 'en' && styles.langBtnActive]}
            onPress={() => setLanguage('en')}
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
          >
            <Text style={[styles.langText, lang === 'en' && styles.langTextActive]}>
              English (EN)
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.langBtn, lang === 'hi' && styles.langBtnActive]}
            onPress={() => setLanguage('hi')}
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
          >
            <Text style={[styles.langText, lang === 'hi' && styles.langTextActive]}>
              हिंदी (Hindi)
            </Text>
          </TouchableOpacity>
        </View>

        {/* Permanent Storage & Database Status */}
        <Text style={styles.sectionHeader}>📁 Permanent Storage & Database</Text>
        <View style={styles.storageStatusCard}>
          <View style={styles.storageHeaderRow}>
            <Text style={styles.storageTitle}>Device Database Status</Text>
            <View style={styles.persistentBadge}>
              <Text style={styles.persistentBadgeText}>● Permanent (Offline)</Text>
            </View>
          </View>
          <Text style={styles.storageSubtext}>
            Saved in phone's private SQLite sandbox. Survives app restart, phone reboot, and works 100% offline.
          </Text>

          <View style={styles.storageStatRow}>
            <View style={styles.statBox}>
              <Text style={styles.statNumber}>{customers.length}</Text>
              <Text style={styles.statLabel}>Customers</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statNumber}>{milkEntries.length}</Text>
              <Text style={styles.statLabel}>Milk Entries</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statNumber}>{payments.length}</Text>
              <Text style={styles.statLabel}>Payments</Text>
            </View>
          </View>

          <View style={styles.storageActionsRow}>
            <TouchableOpacity
              style={styles.inspectBtn}
              onPress={() => setInspectorVisible(true)}
              activeOpacity={0.7}
            >
              <Text style={styles.inspectBtnText}>🔍 Inspect Stored Data</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.shareBackupBtn}
              onPress={handleExportBackup}
              activeOpacity={0.7}
            >
              <Text style={styles.shareBackupBtnText}>📤 Share Backup</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Staff Training Workflow Video */}
        <Text style={styles.sectionHeader}>🎓 Staff Training Video (ट्रेनिंग वीडियो)</Text>
        <View style={styles.trainingCard}>
          <View style={styles.storageHeaderRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.storageTitle}>Complete Seller Training Video</Text>
              <Text style={styles.trainingSubtitle}>7 Interactive Modules • Hindi & English</Text>
            </View>
            <View style={styles.trainingBadge}>
              <Text style={styles.trainingBadgeText}>▶ Video</Text>
            </View>
          </View>
          <Text style={styles.storageSubtext}>
            Interactive step-by-step video training for milk sellers and staff. Covers customer setup, daily milk register, missing days audit, payments, and WhatsApp billing.
          </Text>
          <TouchableOpacity
            style={styles.openTrainingBtn}
            onPress={() => {
              if (Platform.OS === 'web' && typeof window !== 'undefined') {
                window.open('/dairy_app/training.html', '_blank');
              } else {
                Linking.openURL('https://somveer01.github.io/dairy_app/training.html');
              }
            }}
            activeOpacity={0.8}
          >
            <Text style={styles.openTrainingBtnText}>▶ Watch Training Video Guide</Text>
          </TouchableOpacity>
        </View>

        {/* Firebase Cloud Database Card */}
        <Text style={styles.sectionHeader}>☁️ Firebase Cloud Database (Real-Time Sync)</Text>
        <View style={styles.cloudCard}>
          <View style={styles.storageHeaderRow}>
            <View>
              <Text style={styles.storageTitle}>Firebase Firestore</Text>
              <Text style={styles.cloudProjectText}>Project: diaryapp-28278</Text>
            </View>
            <View style={styles.cloudBadge}>
              <Text style={styles.cloudBadgeText}>● Connected</Text>
            </View>
          </View>
          <Text style={styles.storageSubtext}>
            Sync all customer dues, deliveries, and payment records permanently to Google Cloud Firestore.
          </Text>

          {isSyncingCloud ? (
            <View style={styles.syncingBox}>
              <ActivityIndicator size="small" color="#ea580c" />
              <Text style={styles.syncingText}>Communicating with Firebase Cloud...</Text>
            </View>
          ) : (
            <View style={styles.cloudActionsRow}>
              <TouchableOpacity
                style={styles.cloudUploadBtn}
                onPress={handleCloudUpload}
                activeOpacity={0.8}
              >
                <Text style={styles.cloudUploadBtnText}>☁️ Upload to Cloud</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.cloudDownloadBtn}
                onPress={handleCloudDownload}
                activeOpacity={0.8}
              >
                <Text style={styles.cloudDownloadBtnText}>⬇️ Restore</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.cloudPingBtn}
                onPress={handleTestCloudConnection}
                activeOpacity={0.8}
              >
                <Text style={styles.cloudPingBtnText}>⚡ Ping</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Data Management */}
        <Text style={styles.sectionHeader}>Data Management</Text>

        <TouchableOpacity
          style={styles.menuItem}
          onPress={handleClearCustomers}
          activeOpacity={0.7}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
        >
          <Text style={styles.menuIcon}>👥</Text>
          <View style={styles.menuContent}>
            <Text style={[styles.menuTitle, { color: '#f59e0b' }]}>Remove All Customers</Text>
            <Text style={styles.menuSubtitle}>Wipe customer list clean ({customers.length} currently)</Text>
          </View>
          <Text style={styles.chevron}>›</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.menuItem}
          onPress={handleResetData}
          activeOpacity={0.7}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
        >
          <Text style={styles.menuIcon}>🔄</Text>
          <View style={styles.menuContent}>
            <Text style={[styles.menuTitle, { color: '#ef4444' }]}>Reset All Records</Text>
            <Text style={styles.menuSubtitle}>Clear all customers, milk register & payments</Text>
          </View>
          <Text style={styles.chevron}>›</Text>
        </TouchableOpacity>

        {/* Install App on Device */}
        <TouchableOpacity
          style={[styles.menuItem, { backgroundColor: '#f0fdf4', borderColor: '#86efac', borderWidth: 1 }]}
          onPress={handleInstallPWA}
          activeOpacity={0.7}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
        >
          <Text style={styles.menuIcon}>📲</Text>
          <View style={styles.menuContent}>
            <Text style={[styles.menuTitle, { color: '#16a34a', fontWeight: 'bold' }]}>Install App on Phone</Text>
            <Text style={styles.menuSubtitle}>Add to Home Screen for 1-tap offline use</Text>
          </View>
          <Text style={[styles.chevron, { color: '#16a34a', fontWeight: 'bold' }]}>Install</Text>
        </TouchableOpacity>

        {/* App Version Info */}
        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>Dairy App v1.2.0</Text>
          <Text style={styles.infoSubtitle}>React Native • Instant Touch & Responsive</Text>
        </View>

        {/* Logout Button */}
        <TouchableOpacity
          style={styles.logoutBtn}
          onPress={handleLogout}
          activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.logoutText}>{t.logout}</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Storage Inspector Modal */}
      <Modal visible={inspectorVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.inspectorModalContent}>
            <View style={styles.inspectorHeader}>
              <View>
                <Text style={styles.inspectorTitle}>Storage Inspector</Text>
                <Text style={styles.inspectorSubtitle}>Verified Local SQLite / AsyncStorage</Text>
              </View>
              <TouchableOpacity
                onPress={() => setInspectorVisible(false)}
                style={styles.closeBtn}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={styles.closeBtnText}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* Storage Info Banner */}
            <View style={styles.inspectorBanner}>
              <Text style={styles.bannerBold}>Where is data permanently saved?</Text>
              <Text style={styles.bannerText}>
                • Device Storage: Internal Android SQLite sandbox (`/data/data/.../databases/RKStorage`).
              </Text>
              <Text style={styles.bannerText}>
                • Survives: App closing, phone reboot, battery death, and offline usage.
              </Text>
              <Text style={styles.bannerText}>
                • Cloud: Pre-configured for Firebase Firestore sync in `src/config/firebase.ts`.
              </Text>
            </View>

            {/* Sub Tabs */}
            <View style={styles.tabRow}>
              {(['overview', 'customers', 'entries', 'payments'] as const).map(tab => (
                <TouchableOpacity
                  key={tab}
                  style={[styles.tabBtn, selectedJsonTab === tab && styles.tabBtnActive]}
                  onPress={() => setSelectedJsonTab(tab)}
                >
                  <Text style={[styles.tabBtnText, selectedJsonTab === tab && styles.tabBtnTextActive]}>
                    {tab.toUpperCase()}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* JSON Content Area */}
            <ScrollView
              style={styles.jsonScrollView}
              contentContainerStyle={styles.jsonScrollContent}
              keyboardShouldPersistTaps="always"
            >
              {selectedJsonTab === 'overview' && (
                <View style={styles.overviewBox}>
                  <Text style={styles.overviewKey}>Database Engine: <Text style={styles.overviewVal}>AsyncStorage (SQLite)</Text></Text>
                  <Text style={styles.overviewKey}>Supplier ID: <Text style={styles.overviewVal}>{supplier?.id || 'N/A'}</Text></Text>
                  <Text style={styles.overviewKey}>Supplier Name: <Text style={styles.overviewVal}>{supplier?.name || 'N/A'}</Text></Text>
                  <Text style={styles.overviewKey}>Active Customers: <Text style={styles.overviewVal}>{customers.length} records</Text></Text>
                  <Text style={styles.overviewKey}>Delivery Entries: <Text style={styles.overviewVal}>{milkEntries.length} records</Text></Text>
                  <Text style={styles.overviewKey}>Payment Receipts: <Text style={styles.overviewVal}>{payments.length} records</Text></Text>
                  <Text style={styles.overviewKey}>Persistence: <Text style={styles.overviewVal}>Permanent on Device Disk</Text></Text>

                  <View style={styles.verifyTestBox}>
                    <Text style={styles.verifyTestTitle}>How to verify permanency manually:</Text>
                    <Text style={styles.verifyTestStep}>1. Notice customer count above ({customers.length}).</Text>
                    <Text style={styles.verifyTestStep}>2. Swipe app away from Android Recent Apps to kill it.</Text>
                    <Text style={styles.verifyTestStep}>3. Turn off Wi-Fi and Mobile Data.</Text>
                    <Text style={styles.verifyTestStep}>4. Reopen the app — all customers, entries, and dues remain 100% intact!</Text>
                  </View>
                </View>
              )}

              {selectedJsonTab === 'customers' && (
                <Text style={styles.codeText} selectable>
                  {JSON.stringify(customers, null, 2)}
                </Text>
              )}

              {selectedJsonTab === 'entries' && (
                <Text style={styles.codeText} selectable>
                  {JSON.stringify(milkEntries, null, 2)}
                </Text>
              )}

              {selectedJsonTab === 'payments' && (
                <Text style={styles.codeText} selectable>
                  {JSON.stringify(payments, null, 2)}
                </Text>
              )}
            </ScrollView>

            <View style={styles.inspectorFooter}>
              <TouchableOpacity
                style={styles.footerShareBtn}
                onPress={handleExportBackup}
                activeOpacity={0.8}
              >
                <Text style={styles.footerShareBtnText}>📤 Share Full Backup (.json)</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};


const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#f8fafc' },
  container: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 30 },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    padding: 16,
    borderRadius: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0'
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#e0f2fe',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14
  },
  avatarText: { fontSize: 26 },
  profileInfo: { flex: 1 },
  supplierName: { fontSize: 17, fontWeight: 'bold', color: '#0f172a' },
  businessName: { fontSize: 13, color: '#64748b', marginTop: 2 },
  phoneText: { fontSize: 12, color: '#0284c7', marginTop: 3 },
  sectionHeader: { fontSize: 13, fontWeight: '700', color: '#64748b', marginTop: 8, marginBottom: 8 },
  languageRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  langBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    alignItems: 'center',
    backgroundColor: '#ffffff'
  },
  langBtnActive: { backgroundColor: '#0284c7', borderColor: '#0284c7' },
  langText: { fontSize: 13, color: '#475569', fontWeight: '600' },
  langTextActive: { color: '#ffffff', fontWeight: 'bold' },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    padding: 14,
    borderRadius: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0'
  },
  menuIcon: { fontSize: 20, marginRight: 12 },
  menuContent: { flex: 1 },
  menuTitle: { fontSize: 14, fontWeight: '600', color: '#0f172a' },
  menuSubtitle: { fontSize: 11, color: '#94a3b8', marginTop: 2 },
  chevron: { fontSize: 18, color: '#94a3b8' },
  badgeAction: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#0284c7',
    backgroundColor: '#e0f2fe',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6
  },
  infoCard: { alignItems: 'center', marginVertical: 16 },
  infoTitle: { fontSize: 12, fontWeight: '600', color: '#64748b' },
  infoSubtitle: { fontSize: 10, color: '#94a3b8', marginTop: 2 },
  logoutBtn: {
    marginTop: 16,
    backgroundColor: '#fee2e2',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center'
  },
  logoutText: { color: '#dc2626', fontWeight: 'bold', fontSize: 14 },

  // Training Video Card
  trainingCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0'
  },
  trainingSubtitle: { fontSize: 11, color: '#0284c7', fontWeight: '600', marginTop: 1 },
  trainingBadge: {
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#93c5fd',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8
  },
  trainingBadgeText: { fontSize: 11, fontWeight: 'bold', color: '#1d4ed8' },
  openTrainingBtn: {
    backgroundColor: '#0284c7',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 10
  },
  openTrainingBtnText: { color: '#ffffff', fontWeight: 'bold', fontSize: 13 },

  // Storage Status Card
  storageStatusCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0'
  },
  storageHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6
  },
  storageTitle: { fontSize: 15, fontWeight: '700', color: '#0f172a' },
  persistentBadge: {
    backgroundColor: '#dcfce7',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6
  },
  persistentBadgeText: { fontSize: 11, fontWeight: 'bold', color: '#16a34a' },
  storageSubtext: { fontSize: 11, color: '#64748b', marginBottom: 14, lineHeight: 16 },
  storageStatRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14
  },
  statBox: {
    flex: 1,
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    padding: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0'
  },
  statNumber: { fontSize: 18, fontWeight: 'bold', color: '#0284c7' },
  statLabel: { fontSize: 11, color: '#64748b', marginTop: 2 },
  storageActionsRow: {
    flexDirection: 'row',
    gap: 10
  },
  inspectBtn: {
    flex: 1,
    backgroundColor: '#0284c7',
    paddingVertical: 11,
    borderRadius: 10,
    alignItems: 'center'
  },
  inspectBtnText: { color: '#ffffff', fontWeight: 'bold', fontSize: 12 },
  shareBackupBtn: {
    flex: 1,
    backgroundColor: '#0284c715',
    borderWidth: 1,
    borderColor: '#0284c7',
    paddingVertical: 11,
    borderRadius: 10,
    alignItems: 'center'
  },
  shareBackupBtnText: { color: '#0284c7', fontWeight: 'bold', fontSize: 12 },

  // Inspector Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end'
  },
  inspectorModalContent: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 18,
    maxHeight: '88%'
  },
  inspectorHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12
  },
  inspectorTitle: { fontSize: 18, fontWeight: 'bold', color: '#0f172a' },
  inspectorSubtitle: { fontSize: 12, color: '#64748b', marginTop: 2 },
  closeBtn: {
    padding: 6,
    backgroundColor: '#f1f5f9',
    borderRadius: 16
  },
  closeBtnText: { fontSize: 14, color: '#64748b', fontWeight: 'bold' },
  inspectorBanner: {
    backgroundColor: '#f0fdf4',
    borderWidth: 1,
    borderColor: '#bbf7d0',
    borderRadius: 10,
    padding: 12,
    marginBottom: 14
  },
  bannerBold: { fontSize: 12, fontWeight: 'bold', color: '#166534', marginBottom: 4 },
  bannerText: { fontSize: 11, color: '#15803d', marginTop: 2, lineHeight: 15 },
  tabRow: {
    flexDirection: 'row',
    backgroundColor: '#f1f5f9',
    borderRadius: 8,
    padding: 3,
    marginBottom: 12
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 6
  },
  tabBtnActive: {
    backgroundColor: '#ffffff',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1
  },
  tabBtnText: { fontSize: 11, fontWeight: '600', color: '#64748b' },
  tabBtnTextActive: { color: '#0284c7', fontWeight: 'bold' },
  jsonScrollView: {
    backgroundColor: '#0f172a',
    borderRadius: 10,
    maxHeight: 280,
    marginBottom: 14
  },
  jsonScrollContent: { padding: 12 },
  overviewBox: { padding: 4 },
  overviewKey: { fontSize: 13, color: '#94a3b8', marginBottom: 6 },
  overviewVal: { fontWeight: 'bold', color: '#38bdf8' },
  verifyTestBox: {
    marginTop: 14,
    backgroundColor: '#1e293b',
    borderRadius: 8,
    padding: 10,
    borderLeftWidth: 3,
    borderLeftColor: '#38bdf8'
  },
  verifyTestTitle: { fontSize: 12, fontWeight: 'bold', color: '#f8fafc', marginBottom: 6 },
  verifyTestStep: { fontSize: 11, color: '#cbd5e1', marginTop: 3, lineHeight: 16 },
  codeText: {
    fontFamily: 'monospace',
    fontSize: 11,
    color: '#38bdf8',
    lineHeight: 16
  },
  inspectorFooter: {
    marginTop: 4
  },
  footerShareBtn: {
    backgroundColor: '#0284c7',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center'
  },
  footerShareBtnText: { color: '#ffffff', fontWeight: 'bold', fontSize: 14 },

  // Firebase Cloud Card Styles
  cloudCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#fed7aa'
  },
  cloudProjectText: { fontSize: 11, color: '#ea580c', fontWeight: '600', marginTop: 1 },
  cloudBadge: {
    backgroundColor: '#ffedd5',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6
  },
  cloudBadgeText: { fontSize: 11, fontWeight: 'bold', color: '#c2410c' },
  syncingBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12
  },
  syncingText: { fontSize: 12, color: '#ea580c', fontWeight: '600' },
  cloudActionsRow: { flexDirection: 'row', gap: 8 },
  cloudUploadBtn: {
    flex: 2,
    backgroundColor: '#ea580c',
    paddingVertical: 11,
    borderRadius: 10,
    alignItems: 'center'
  },
  cloudUploadBtnText: { color: '#ffffff', fontWeight: 'bold', fontSize: 12 },
  cloudDownloadBtn: {
    flex: 1.2,
    backgroundColor: '#ffedd5',
    borderWidth: 1,
    borderColor: '#fed7aa',
    paddingVertical: 11,
    borderRadius: 10,
    alignItems: 'center'
  },
  cloudDownloadBtnText: { color: '#c2410c', fontWeight: 'bold', fontSize: 12 },
  cloudPingBtn: {
    flex: 0.9,
    backgroundColor: '#f1f5f9',
    paddingVertical: 11,
    borderRadius: 10,
    alignItems: 'center'
  },
  cloudPingBtnText: { color: '#475569', fontWeight: 'bold', fontSize: 12 }
});
