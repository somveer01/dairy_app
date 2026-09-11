import React, { useState, useEffect } from 'react';
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
import { FirebaseSyncService, normalizePhoneDigits } from '../../services/firebaseSyncService';
import { AutoSyncService, SyncStatus } from '../../services/autoSyncService';
import { confirmAction, showAlert } from '../../utils/alertUtils';
import { InstallAppModal } from '../../components/InstallAppModal';

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
    refreshPayments,
    openAuthModal,
    requireAuth
  } = useApp();

  const [inspectorVisible, setInspectorVisible] = useState(false);
  const [installModalVisible, setInstallModalVisible] = useState(false);
  const [selectedJsonTab, setSelectedJsonTab] = useState<'overview' | 'customers' | 'entries' | 'payments'>('overview');
  const [isSyncingCloud, setIsSyncingCloud] = useState(false);

  const [syncStatus, setSyncStatus] = useState<SyncStatus>('synced');
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);

  const [editProfileVisible, setEditProfileVisible] = useState(false);
  const [editName, setEditName] = useState('');
  const [editBusinessName, setEditBusinessName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  useEffect(() => {
    const unsubscribe = AutoSyncService.subscribe((status, timestamp) => {
      setSyncStatus(status);
      setLastSyncedAt(timestamp);
    });
    return unsubscribe;
  }, []);

  const openEditProfile = () => {
    requireAuth(() => {
      setEditName(supplier?.name || '');
      setEditBusinessName(supplier?.businessName || '');
      setEditPhone(supplier?.phone || '');
      setEditProfileVisible(true);
    });
  };

  const handleSaveProfile = async () => {
    const cleanPhone = normalizePhoneDigits(editPhone);
    if (cleanPhone.length !== 10) {
      showAlert(
        lang === 'hi' ? 'अमान्य मोबाइल नंबर' : 'Invalid Phone Number',
        lang === 'hi' ? 'कृपया सही 10 अंकों का मोबाइल नंबर दर्ज करें।' : 'Please enter a valid 10-digit mobile number.'
      );
      return;
    }
    if (!editName.trim() || !editBusinessName.trim()) {
      showAlert(
        lang === 'hi' ? 'अधूरी जानकारी' : 'Incomplete Details',
        lang === 'hi' ? 'कृपया सप्लायर और डेयरी का नाम दर्ज करें।' : 'Please enter supplier and business name.'
      );
      return;
    }

    setIsSavingProfile(true);
    try {
      const updatedSupplier: import('../../types').Supplier = {
        id: supplier?.id || `supp_${cleanPhone}`,
        email: supplier?.email || '',
        name: editName.trim(),
        businessName: editBusinessName.trim(),
        phone: cleanPhone,
        createdAt: supplier?.createdAt || Date.now(),
        updatedAt: Date.now()
      };
      await StorageService.saveSupplier(updatedSupplier);
      setSupplier(updatedSupplier);
      AutoSyncService.queueSync(updatedSupplier, 0);
      setEditProfileVisible(false);
      showAlert(
        lang === 'hi' ? 'प्रोफ़ाइल अपडेट' : 'Profile Updated',
        lang === 'hi' ? 'आपकी प्रोफ़ाइल सफलतापूर्वक अपडेट हो गई है।' : 'Your supplier profile has been updated.'
      );
    } catch (err: any) {
      showAlert('Error', err?.message || 'Failed to update profile');
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleManualSync = () => {
    requireAuth(() => {
      AutoSyncService.queueSync(supplier, 0);
      showAlert(
        lang === 'hi' ? 'ऑटो-सिंक प्रारंभ' : 'Sync Initiated',
        lang === 'hi' ? 'बैकग्राउंड में क्लाउड सिंक शुरू कर दिया गया है।' : 'Cloud background sync started.'
      );
    });
  };

  const handleTestCloudConnection = async () => {
    setIsSyncingCloud(true);
    const res = await FirebaseSyncService.testConnection();
    setIsSyncingCloud(false);
    showAlert(res.success ? 'Firebase Connected' : 'Connection Notice', res.message);
  };

  const handleCloudUpload = async () => {
    requireAuth(async () => {
      if (!supplier) {
        showAlert('Notice', 'No active supplier profile.');
        return;
      }
      setIsSyncingCloud(true);
      const res = await FirebaseSyncService.uploadAllToCloud(supplier);
      setIsSyncingCloud(false);
      showAlert(res.success ? 'Cloud Backup Complete' : 'Sync Error', res.message);
    });
  };

  const handleCloudDownload = async () => {
    requireAuth(() => {
      confirmAction(
        'क्लाउड से रिस्टोर करें (Restore from Cloud)',
        'क्या आप Firebase Cloud से अपने सभी रिकॉर्ड डाउनलोड और रिस्टोर करना चाहते हैं?\n• सूचना: वर्तमान डेटा क्लाउड बैकअप से अपडेट हो जाएगा।',
        async () => {
          setIsSyncingCloud(true);
          const res = await FirebaseSyncService.downloadFromCloud(supplier?.id);
          const restoredSupplier = await StorageService.getSupplier();
          if (restoredSupplier) {
            setSupplier(restoredSupplier);
          }
          await refreshCustomers();
          await refreshMilkEntries();
          await refreshPayments();
          setIsSyncingCloud(false);
          showAlert(res.success ? 'रिस्टोर सफल (Restored)' : 'त्रुटि (Error)', res.message);
        },
        '⬇️ रिस्टोर करें (Restore)',
        'रद्द करें (Cancel)',
        false
      );
    });
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
    requireAuth(() => {
      confirmAction(
        'सभी ग्राहक हटाएं (Remove All Customers)',
        `क्या आप वाकई सभी ग्राहकों को हटाना चाहते हैं?\n• कुल ग्राहक: ${customers.length} लोग\n• चेतावनी: यह पूरी ग्राहक सूची को खाली कर देगा।`,
        async () => {
          await StorageService.clearAllCustomers();
          await refreshCustomers();
          showAlert('ग्राहक हटा दिए गए (Customers Removed)', 'सभी ग्राहक प्रोफाइल हटा दी गई हैं।');
        },
        '🗑️ सभी हटाएं (Remove All)',
        'रद्द करें (Cancel)',
        true
      );
    });
  };

  const handleResetData = () => {
    requireAuth(() => {
      confirmAction(
        'पूरा डेटा रीसेट करें (Reset All Data)',
        'क्या आप सभी ग्राहक, दूध का रजिस्टर और पेमेंट रिकॉर्ड पूरी तरह मिटाना चाहते हैं?\n• चेतावनी: यह प्रक्रिया वापस नहीं की जा सकती। सारा डेटा मिट जाएगा।',
        async () => {
          await StorageService.clearAllData();
          await refreshCustomers();
          await refreshMilkEntries();
          await refreshPayments();
          showAlert('डेटा रीसेट पूर्ण (Reset Complete)', 'सभी रिकॉर्ड मिटा दिए गए हैं।');
        },
        '⚠️ पूरा डेटा मिटाएं (Reset All)',
        'रद्द करें (Cancel)',
        true
      );
    });
  };

  const handleInstallPWA = () => {
    if (Platform.OS === 'web') {
      const prompt = typeof window !== 'undefined' ? (window as any).pwaDeferredPrompt : null;
      if (prompt) {
        prompt.prompt();
        prompt.userChoice.then((choiceResult: any) => {
          if (choiceResult.outcome === 'accepted') {
            showAlert('सफल (Success)', 'Dairy App आपकी मोबाइल स्क्रीन पर जोड़ दिया गया है!');
          }
          (window as any).pwaDeferredPrompt = null;
        });
      } else {
        setInstallModalVisible(true);
      }
    } else {
      showAlert('इंस्टॉल्ड (Installed)', 'आप पहले से इंस्टॉल्ड Dairy App का उपयोग कर रहे हैं।');
    }
  };

  const handleCheckForUpdates = () => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      confirmAction(
        lang === 'hi' ? 'अपडेट जांचें (Check Updates)' : 'Check for Updates',
        lang === 'hi'
          ? 'क्या आप नया अपडेट डाउनलोड करना चाहते हैं? ऐप ताजा डेटा और नए फीचर्स के साथ रिफ्रेश हो जाएगा।'
          : 'Do you want to check and download the latest updates? The app will refresh with the newest features.',
        async () => {
          try {
            if ('serviceWorker' in navigator) {
              const registrations = await navigator.serviceWorker.getRegistrations();
              for (const reg of registrations) {
                await reg.update();
              }
            }
            if ('caches' in window) {
              const keys = await caches.keys();
              await Promise.all(keys.map(k => caches.delete(k)));
            }
          } catch {
            // Proceed to reload
          }
          window.location.reload();
        },
        lang === 'hi' ? 'अपडेट करें (Update)' : 'Update Now',
        lang === 'hi' ? 'रद्द करें (Cancel)' : 'Cancel',
        false
      );
    } else {
      showAlert(
        lang === 'hi' ? 'ऐप अपडेट' : 'App Update',
        lang === 'hi' ? 'आप पहले से नवीनतम संस्करण चला रहे हैं।' : 'You are running the latest version.'
      );
    }
  };

  const handleLogout = () => {
    confirmAction(
      'लॉगआउट (Logout)',
      'क्या आप वाकई डेयरी ऐप से लॉगआउट करना चाहते हैं?',
      () => {
        setSupplier(null);
      },
      'लॉगआउट (Logout)',
      'रद्द करें (Cancel)',
      false
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
        {supplier?.phone && supplier.phone.length >= 10 ? (
          <View style={styles.profileCard}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>🥛</Text>
            </View>
            <View style={styles.profileInfo}>
              <Text style={styles.supplierName}>{supplier.name || 'Dairy Supplier'}</Text>
              <Text style={styles.businessName}>{supplier.businessName || 'Fresh Milk Dairy'}</Text>
              <Text style={styles.phoneText}>📞 {supplier.phone}</Text>
            </View>
            <TouchableOpacity
              style={styles.editProfileBtn}
              onPress={openEditProfile}
              activeOpacity={0.7}
            >
              <Text style={styles.editProfileBtnText}>✏️ {lang === 'hi' ? 'बदलें' : 'Edit'}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={[styles.profileCard, { backgroundColor: '#f0f9ff', borderColor: '#bae6fd' }]}>
            <View style={[styles.avatar, { backgroundColor: '#e0f2fe' }]}>
              <Text style={styles.avatarText}>👤</Text>
            </View>
            <View style={styles.profileInfo}>
              <Text style={styles.supplierName}>{lang === 'hi' ? 'अतिथि मोड (Guest Mode)' : 'Guest Mode'}</Text>
              <Text style={styles.businessName}>{lang === 'hi' ? 'रिकॉर्ड सहेजने व सिंक के लिए लॉगिन करें' : 'Login to add entries & cloud sync'}</Text>
            </View>
            <TouchableOpacity
              style={{ backgroundColor: '#0284c7', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8 }}
              onPress={openAuthModal}
              activeOpacity={0.8}
            >
              <Text style={{ color: '#ffffff', fontWeight: 'bold', fontSize: 13 }}>
                🔐 {lang === 'hi' ? 'लॉग इन' : 'Login'}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Language Selection */}
        <Text style={styles.sectionHeader}>{t.language}</Text>
        <View style={styles.languageRow}>
          <TouchableOpacity
            style={[styles.langBtn, lang === 'en' && styles.langBtnActive]}
            onPress={async () => {
              await setLanguage('en');
              showAlert('Language Changed', 'App language updated to English.');
            }}
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
          >
            <Text style={[styles.langText, lang === 'en' && styles.langTextActive]}>
              {lang === 'en' ? '✓ ' : ''}English (EN)
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.langBtn, lang === 'hi' && styles.langBtnActive]}
            onPress={async () => {
              await setLanguage('hi');
              showAlert('भाषा बदली गई (Language Updated)', 'ऐप की भाषा हिंदी में अपडेट कर दी गई है।');
            }}
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
          >
            <Text style={[styles.langText, lang === 'hi' && styles.langTextActive]}>
              {lang === 'hi' ? '✓ ' : ''}हिंदी (Hindi)
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

        {/* Firebase Cloud Auto-Sync Card */}
        <Text style={styles.sectionHeader}>
          {lang === 'hi' ? '☁️ क्लाउड ऑटो-सिंक एवं बैकअप' : '☁️ Cloud Auto-Sync & Backup'}
        </Text>
        <View style={styles.cloudCard}>
          <View style={styles.storageHeaderRow}>
            <View>
              <Text style={styles.storageTitle}>
                {lang === 'hi' ? 'क्लाउड ऑटो-सिंक' : 'Firebase Cloud Sync'}
              </Text>
              <Text style={styles.cloudProjectText}>
                {supplier?.phone ? `ID: supp_${supplier.phone}` : 'Project: diaryapp-28278'}
              </Text>
            </View>
            <View style={[
              styles.cloudBadge,
              syncStatus === 'synced' && styles.badgeSynced,
              syncStatus === 'syncing' && styles.badgeSyncing,
              syncStatus === 'offline' && styles.badgeOffline,
              syncStatus === 'error' && styles.badgeError,
            ]}>
              <Text style={[
                styles.cloudBadgeText,
                syncStatus === 'synced' && styles.badgeSyncedText,
                syncStatus === 'syncing' && styles.badgeSyncingText,
                syncStatus === 'offline' && styles.badgeOfflineText,
                syncStatus === 'error' && styles.badgeErrorText,
              ]}>
                {syncStatus === 'syncing'
                  ? (lang === 'hi' ? '● सिंक हो रहा है...' : '● Syncing...')
                  : syncStatus === 'offline'
                  ? (lang === 'hi' ? '● ऑफ़लाइन (सुरक्षित)' : '● Offline (Saved)')
                  : syncStatus === 'error'
                  ? (lang === 'hi' ? '● सिंक त्रुटि' : '● Sync Error')
                  : (lang === 'hi' ? '● सिंक पूर्ण' : '● Live Synced')}
              </Text>
            </View>
          </View>
          <Text style={styles.storageSubtext}>
            {lang === 'hi'
              ? 'आपके सभी ग्राहक, दूध की एंट्री और भुगतान बैकग्राउंड में सुरक्षित सिंक होते हैं। जब आप ऑफ़लाइन होते हैं, तब भी डेटा डिवाइस में 100% सुरक्षित रहता है।'
              : 'All customers, milk entries, and dues sync automatically to the cloud in real-time. Full offline support guaranteed.'}
          </Text>

          {lastSyncedAt && (
            <Text style={styles.lastSyncText}>
              🕒 {lang === 'hi' ? 'अंतिम सिंक:' : 'Last Synced:'} {new Date(lastSyncedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </Text>
          )}

          {isSyncingCloud ? (
            <View style={styles.syncingBox}>
              <ActivityIndicator size="small" color="#ea580c" />
              <Text style={styles.syncingText}>
                {lang === 'hi' ? 'क्लाउड से डेटा प्रोसेस हो रहा है...' : 'Processing with Cloud...'}
              </Text>
            </View>
          ) : (
            <View style={styles.cloudActionsRow}>
              <TouchableOpacity
                style={styles.cloudUploadBtn}
                onPress={handleManualSync}
                activeOpacity={0.8}
              >
                <Text style={styles.cloudUploadBtnText}>
                  🔄 {lang === 'hi' ? 'अभी सिंक करें' : 'Sync Now'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.cloudDownloadBtn}
                onPress={handleCloudDownload}
                activeOpacity={0.8}
              >
                <Text style={styles.cloudDownloadBtnText}>
                  ⬇️ {lang === 'hi' ? 'रिस्टोर' : 'Restore'}
                </Text>
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
        <Text style={styles.sectionHeader}>{t.dataManagement || 'Data Management'}</Text>

        <TouchableOpacity
          style={styles.menuItem}
          onPress={handleClearCustomers}
          activeOpacity={0.7}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
        >
          <Text style={styles.menuIcon}>👥</Text>
          <View style={styles.menuContent}>
            <Text style={[styles.menuTitle, { color: '#f59e0b' }]}>{t.removeAllCustomers || 'Remove All Customers'}</Text>
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
            <Text style={[styles.menuTitle, { color: '#ef4444' }]}>{t.resetAllRecords || 'Reset All Records'}</Text>
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

        {/* Check for App Updates */}
        <TouchableOpacity
          style={[styles.menuItem, { backgroundColor: '#f0f9ff', borderColor: '#bae6fd', borderWidth: 1 }]}
          onPress={handleCheckForUpdates}
          activeOpacity={0.7}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
        >
          <Text style={styles.menuIcon}>🔄</Text>
          <View style={styles.menuContent}>
            <Text style={[styles.menuTitle, { color: '#0284c7', fontWeight: 'bold' }]}>
              {lang === 'hi' ? 'नया अपडेट लोड करें (Check Updates)' : 'Check for Updates'}
            </Text>
            <Text style={styles.menuSubtitle}>
              {lang === 'hi' ? 'ताजा बदलाव और नए फीचर्स तुरंत लोड करें' : 'Get latest features, fixes & screen layouts'}
            </Text>
          </View>
          <Text style={[styles.chevron, { color: '#0284c7', fontWeight: 'bold' }]}>
            {lang === 'hi' ? 'अपडेट' : 'Update'}
          </Text>
        </TouchableOpacity>

        {/* App Version Info */}
        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>Dairy App v1.2.0</Text>
          <Text style={styles.infoSubtitle}>React Native • Instant Touch & Responsive</Text>
        </View>

        {/* Logout / Login Action Button */}
        {supplier?.phone && supplier.phone.length >= 10 ? (
          <TouchableOpacity
            style={styles.logoutBtn}
            onPress={handleLogout}
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.logoutText}>{t.logout}</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.logoutBtn, { backgroundColor: '#0284c7' }]}
            onPress={openAuthModal}
            activeOpacity={0.8}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={[styles.logoutText, { color: '#ffffff' }]}>
              🔐 {lang === 'hi' ? 'लॉग इन या साइन अप करें (Login / Sign Up)' : 'Login or Sign Up'}
            </Text>
          </TouchableOpacity>
        )}
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

      {/* App Installation Process Guide Modal */}
      <InstallAppModal
        visible={installModalVisible}
        onClose={() => setInstallModalVisible(false)}
      />

      {/* Edit Supplier Profile Modal */}
      <Modal visible={editProfileVisible} animationType="fade" transparent>
        <View style={styles.editModalOverlay}>
          <View style={styles.editModalContent}>
            <Text style={styles.editModalTitle}>
              {lang === 'hi' ? 'डेयरी प्रोफ़ाइल संपादित करें' : 'Edit Dairy Profile'}
            </Text>

            <Text style={styles.inputLabel}>{lang === 'hi' ? 'सप्लायर का नाम' : 'Supplier Name'} *</Text>
            <TextInput
              style={styles.inputField}
              value={editName}
              onChangeText={setEditName}
              placeholder={lang === 'hi' ? 'उदा. सोमेवीर' : 'e.g. Ramesh'}
              placeholderTextColor="#94a3b8"
            />

            <Text style={styles.inputLabel}>{lang === 'hi' ? 'डेयरी / बिज़नेस का नाम' : 'Dairy / Farm Name'} *</Text>
            <TextInput
              style={styles.inputField}
              value={editBusinessName}
              onChangeText={setEditBusinessName}
              placeholder={lang === 'hi' ? 'उदा. कृष्णा डेयरी' : 'e.g. Krishna Dairy'}
              placeholderTextColor="#94a3b8"
            />

            <Text style={styles.inputLabel}>{lang === 'hi' ? 'मोबाइल नंबर (10 अंक)' : 'Phone Number (10 Digits)'} *</Text>
            <TextInput
              style={styles.inputField}
              value={editPhone}
              onChangeText={setEditPhone}
              keyboardType="phone-pad"
              maxLength={10}
              placeholder="9876543210"
              placeholderTextColor="#94a3b8"
            />

            <View style={styles.editModalActions}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setEditProfileVisible(false)}
                disabled={isSavingProfile}
                activeOpacity={0.7}
              >
                <Text style={styles.cancelBtnText}>{lang === 'hi' ? 'रद्द करें' : 'Cancel'}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.saveBtn, isSavingProfile && { opacity: 0.6 }]}
                onPress={handleSaveProfile}
                disabled={isSavingProfile}
                activeOpacity={0.8}
              >
                {isSavingProfile ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <Text style={styles.saveBtnText}>{lang === 'hi' ? 'सहेजें' : 'Save'}</Text>
                )}
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
  cloudPingBtnText: { color: '#475569', fontWeight: 'bold', fontSize: 12 },
  editProfileBtn: {
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    alignSelf: 'center'
  },
  editProfileBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0284c7'
  },
  lastSyncText: {
    fontSize: 11,
    color: '#64748b',
    fontWeight: '600',
    marginBottom: 10
  },
  badgeSynced: { backgroundColor: '#dcfce7' },
  badgeSyncedText: { color: '#16a34a' },
  badgeSyncing: { backgroundColor: '#fef3c7' },
  badgeSyncingText: { color: '#d97706' },
  badgeOffline: { backgroundColor: '#f1f5f9' },
  badgeOfflineText: { color: '#64748b' },
  badgeError: { backgroundColor: '#fee2e2' },
  badgeErrorText: { color: '#dc2626' },
  editModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20
  },
  editModalContent: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 20,
    width: '100%',
    maxWidth: 400,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 5
  },
  editModalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#0f172a',
    marginBottom: 14
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
    marginBottom: 4,
    marginTop: 8
  },
  inputField: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#0f172a'
  },
  editModalActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 20
  },
  cancelBtn: {
    flex: 1,
    backgroundColor: '#f1f5f9',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center'
  },
  cancelBtnText: {
    color: '#475569',
    fontWeight: '600',
    fontSize: 14
  },
  saveBtn: {
    flex: 1,
    backgroundColor: '#0284c7',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center'
  },
  saveBtnText: {
    color: '#ffffff',
    fontWeight: 'bold',
    fontSize: 14
  }
});
