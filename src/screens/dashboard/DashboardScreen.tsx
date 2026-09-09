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
  Platform,
  Linking,
  FlatList
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useApp } from '../../context/AppContext';
import { StorageService } from '../../services/storageService';
import { InstallAppModal } from '../../components/InstallAppModal';
import { formatToDisplayDate } from '../../utils/dateUtils';
import { showAlert, confirmAction } from '../../utils/alertUtils';
import { Payment } from '../../types';

const toLocalIso = (d: Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

export const DashboardScreen = ({ navigation }: any) => {
  const { t, lang, supplier, setSupplier, customers, milkEntries, payments, refreshPayments } = useApp();

  const isHindi = lang === 'hi';
  const todayStr = useMemo(() => toLocalIso(new Date()), []);

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

  // Total Received Payments All Time
  const totalReceivedAllTime = useMemo(() => {
    return payments.reduce((sum, p) => sum + p.amountPaid, 0);
  }, [payments]);

  // Sorted Payments for History Modal (Newest first)
  const sortedPayments = useMemo(() => {
    return [...payments].sort((a, b) => {
      const timeA = new Date(a.date).getTime() || a.createdAt || 0;
      const timeB = new Date(b.date).getTime() || b.createdAt || 0;
      return timeB - timeA;
    });
  }, [payments]);

  // Dairy Name Setup / Edit Modal State
  const [editDairyModalVisible, setEditDairyModalVisible] = useState(false);
  const [dairyNameInput, setDairyNameInput] = useState('');
  const [ownerNameInput, setOwnerNameInput] = useState('');

  // Payment History Modal State
  const [payHistoryVisible, setPayHistoryVisible] = useState(false);

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

  // 1-Tap Customer Call
  const handleCallCustomer = (phone: string) => {
    const cleanPhone = phone.replace(/[^0-9]/g, '');
    if (!cleanPhone) {
      showAlert(isHindi ? 'फ़ोन नंबर उपलब्ध नहीं' : 'No Phone Number', isHindi ? 'इस ग्राहक का फ़ोन नंबर दर्ज नहीं है।' : 'No phone number for this customer.');
      return;
    }
    Linking.openURL(`tel:${cleanPhone}`).catch(() => {
      showAlert(isHindi ? 'कॉल त्रुटि' : 'Call Error', isHindi ? 'फ़ोन डायलर नहीं खुल सका।' : 'Could not open phone dialer.');
    });
  };

  // 1-Tap Customer WhatsApp
  const handleWhatsAppCustomer = (phone: string, name: string) => {
    let cleanPhone = phone.replace(/[^0-9]/g, '');
    if (!cleanPhone) {
      showAlert(isHindi ? 'फ़ोन नंबर उपलब्ध नहीं' : 'No Phone Number', isHindi ? 'इस ग्राहक का फ़ोन नंबर दर्ज नहीं है।' : 'No phone number for this customer.');
      return;
    }
    if (cleanPhone.length === 10) cleanPhone = '91' + cleanPhone;
    const msg = encodeURIComponent(
      isHindi
        ? `नमस्ते ${name} जी, ${supplier?.businessName || 'डेयरी'} से संपर्क किया जा रहा है।`
        : `Hello ${name}, contacting you from ${supplier?.businessName || 'Dairy'}.`
    );
    Linking.openURL(`https://wa.me/${cleanPhone}?text=${msg}`).catch(() => {
      showAlert(isHindi ? 'व्हाट्सएप त्रुटि' : 'WhatsApp Error', isHindi ? 'व्हाट्सएप नहीं खुल सका।' : 'Could not open WhatsApp.');
    });
  };

  // Delete Payment Record
  const handleDeletePayment = (payment: Payment) => {
    confirmAction(
      isHindi ? 'भुगतान रिकॉर्ड हटाएं' : 'Delete Payment Record',
      isHindi
        ? `क्या आप सचमुच ₹${payment.amountPaid} का भुगतान (${formatToDisplayDate(payment.date)}) हटाना चाहते हैं?`
        : `Are you sure you want to delete payment of ₹${payment.amountPaid} recorded on ${formatToDisplayDate(payment.date)}?`,
      async () => {
        await StorageService.deletePayment(payment.id);
        await refreshPayments();
        showAlert(
          isHindi ? 'हटाया गया' : 'Deleted',
          isHindi ? 'भुगतान रिकॉर्ड सफलतापूर्वक हटा दिया गया।' : 'Payment record deleted successfully.'
        );
      },
      undefined,
      isHindi ? 'हटाएं' : 'Delete',
      true
    );
  };

  // 6 Sleek Quick Links Configuration
  const quickLinks = [
    {
      id: 'morning',
      title: isHindi ? 'सुबह का दूध' : 'Morning Milk',
      sub: isHindi ? 'एंट्री करें' : 'Log Delivery',
      icon: '🌅',
      bg: '#fef3c7',
      border: '#fde68a',
      onPress: () => navigation.navigate('RegisterTab')
    },
    {
      id: 'evening',
      title: isHindi ? 'शाम का दूध' : 'Evening Milk',
      sub: isHindi ? 'एंट्री करें' : 'Log Delivery',
      icon: '🌇',
      bg: '#ffedd5',
      border: '#fed7aa',
      onPress: () => navigation.navigate('RegisterTab')
    },
    {
      id: 'add_cust',
      title: isHindi ? 'नया ग्राहक' : 'Add Customer',
      sub: isHindi ? '+ जोड़ें' : '+ Register',
      icon: '👤',
      bg: '#ecfdf5',
      border: '#a7f3d0',
      onPress: () => navigation.navigate('CustomersTab')
    },
    {
      id: 'contacts',
      title: isHindi ? 'फ़ोन संपर्क' : 'Contacts',
      sub: isHindi ? 'आयात करें' : 'Import List',
      icon: '📱',
      bg: '#eff6ff',
      border: '#bfdbfe',
      onPress: () => navigation.navigate('CustomersTab')
    },
    {
      id: 'monthly_rep',
      title: isHindi ? 'मासिक हिसाब' : 'Monthly Bill',
      sub: isHindi ? 'हिसाब देखें' : 'View Dues',
      icon: '📅',
      bg: '#f5f3ff',
      border: '#ddd6fe',
      onPress: () => navigation.navigate('ReportsTab')
    },
    {
      id: 'wa_bill',
      title: isHindi ? 'व्हाट्सएप बिल' : 'WhatsApp Bill',
      sub: isHindi ? 'बिल भेजें' : 'Send Due Bill',
      icon: '💬',
      bg: '#f0fdf4',
      border: '#bbf7d0',
      onPress: () => navigation.navigate('ReportsTab')
    }
  ];

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
              <Text style={styles.greeting} numberOfLines={1}>
                {isHindi ? `नमस्ते, ${supplier?.name || 'दूध विक्रेता'}` : `Hello, ${supplier?.name || 'Dairy Supplier'}`}
              </Text>
              <Text style={{ fontSize: 13 }}>✏️</Text>
            </View>
            <Text style={styles.businessName} numberOfLines={1}>
              {supplier?.businessName || (isHindi ? 'डेयरी का नाम सेट करें (Tap to set)' : 'Set Dairy Name (Tap to set)')}
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
              <Text style={{ fontSize: 22 }}>📲</Text>
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

        {/* PAIRED METRIC CARDS (Total Outstanding Due + Payment History in the SAME Space) */}
        <View style={styles.pairedMetricsRow}>
          {/* Card 1: Total Due */}
          <TouchableOpacity
            style={styles.dueCardCompact}
            onPress={() => navigation.navigate('ReportsTab')}
            activeOpacity={0.85}
          >
            <View style={styles.metricCardHeader}>
              <Text style={styles.metricCardIcon}>⚠️</Text>
              <View style={styles.metricBadgeRed}>
                <Text style={styles.metricBadgeRedText}>{customers.length} {isHindi ? 'ग्राहक' : 'Cust'}</Text>
              </View>
            </View>
            <Text style={styles.metricLabelRed}>{isHindi ? 'कुल बकाया' : 'Total Due'}</Text>
            <Text style={styles.metricAmountRed} numberOfLines={1}>₹{overallDue.toFixed(0)}</Text>
            <View style={styles.metricActionRow}>
              <Text style={styles.metricActionRed}>{isHindi ? 'हिसाब देखें' : 'View Dues'} →</Text>
            </View>
          </TouchableOpacity>

          {/* Card 2: Payment History */}
          <TouchableOpacity
            style={styles.paymentCardCompact}
            onPress={() => setPayHistoryVisible(true)}
            activeOpacity={0.85}
          >
            <View style={styles.metricCardHeader}>
              <Text style={styles.metricCardIcon}>💰</Text>
              <View style={styles.metricBadgeGreen}>
                <Text style={styles.metricBadgeGreenText}>{payments.length} {isHindi ? 'भुगतान' : 'Paid'}</Text>
              </View>
            </View>
            <Text style={styles.metricLabelGreen}>{isHindi ? 'कुल भुगतान' : 'Total Payments'}</Text>
            <Text style={styles.metricAmountGreen} numberOfLines={1}>₹{totalReceivedAllTime.toFixed(0)}</Text>
            <View style={styles.metricActionRow}>
              <Text style={styles.metricActionGreen}>{isHindi ? 'इतिहास देखें' : 'History'} →</Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* Interactive Today's Deliveries Section */}
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionHeading}>
            {t.todayDeliveries || "Today's Deliveries"} ({formatToDisplayDate(todayStr)})
          </Text>
          <TouchableOpacity
            onPress={() => navigation.navigate('RegisterTab')}
            activeOpacity={0.7}
          >
            <Text style={styles.seeAllText}>{isHindi ? 'रजिस्टर खोलें →' : 'Open Register →'}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.statsGrid}>
          {/* Cow Milk Box */}
          <TouchableOpacity
            style={[styles.statBox, { backgroundColor: '#fef3c7' }]}
            onPress={() => navigation.navigate('RegisterTab')}
            activeOpacity={0.8}
          >
            <Text style={styles.milkEmoji}>🐄</Text>
            <Text style={styles.statNumber}>{todayStats.cowLitres.toFixed(1)} L</Text>
            <Text style={styles.statLabel}>{t.cowMilk}</Text>
          </TouchableOpacity>

          {/* Buffalo Milk Box */}
          <TouchableOpacity
            style={[styles.statBox, { backgroundColor: '#e0e7ff' }]}
            onPress={() => navigation.navigate('RegisterTab')}
            activeOpacity={0.8}
          >
            <Text style={styles.milkEmoji}>🐃</Text>
            <Text style={styles.statNumber}>{todayStats.buffaloLitres.toFixed(1)} L</Text>
            <Text style={styles.statLabel}>{t.buffaloMilk}</Text>
          </TouchableOpacity>
        </View>

        {/* Total billed today card (Interactive) */}
        <TouchableOpacity
          style={styles.todayBilledCard}
          onPress={() => navigation.navigate('RegisterTab')}
          activeOpacity={0.8}
        >
          <View>
            <Text style={styles.statSmallLabel}>{t.todayBilled}</Text>
            <Text style={styles.todayBilledAmount}>₹{todayStats.totalBilled.toFixed(2)}</Text>
          </View>
          <View style={styles.deliveredCountBadge}>
            <Text style={styles.deliveredCountText}>
              ✓ {todayStats.deliveredCount} / {customers.length} {isHindi ? 'डिलीवर' : 'Delivered'}
            </Text>
          </View>
        </TouchableOpacity>

        {/* SLEEK QUICK LINKS (2x3 Grid - Recognizable Icons, Non-Bulky) */}
        <Text style={styles.sectionHeading}>{t.quickActions || 'Quick Actions'}</Text>
        <View style={styles.quickLinksGrid}>
          {quickLinks.map(link => (
            <TouchableOpacity
              key={link.id}
              style={[styles.quickLinkTile, { backgroundColor: link.bg, borderColor: link.border }]}
              onPress={link.onPress}
              activeOpacity={0.75}
            >
              <View style={styles.quickLinkIconBox}>
                <Text style={styles.quickLinkIconText}>{link.icon}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.quickLinkTitle} numberOfLines={1}>{link.title}</Text>
                <Text style={styles.quickLinkSub} numberOfLines={1}>{link.sub}</Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>

        {/* Customers Overview with 1-Tap Call & WhatsApp */}
        <View style={styles.customerHeaderRow}>
          <Text style={styles.sectionHeading}>
            {t.customers} ({customers.length})
          </Text>
          <TouchableOpacity
            onPress={() => navigation.navigate('CustomersTab')}
            activeOpacity={0.7}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Text style={styles.seeAllText}>{isHindi ? 'सभी देखें →' : 'See All →'}</Text>
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

            {/* Quick Contact Actions */}
            <View style={styles.customerActionsRow}>
              {customer.phone ? (
                <>
                  <TouchableOpacity
                    style={styles.customerActionBtnCall}
                    onPress={() => handleCallCustomer(customer.phone)}
                    activeOpacity={0.7}
                    hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                  >
                    <Text style={styles.customerActionIcon}>📞</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.customerActionBtnWhatsApp}
                    onPress={() => handleWhatsAppCustomer(customer.phone, customer.name)}
                    activeOpacity={0.7}
                    hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                  >
                    <Text style={styles.customerActionIcon}>💬</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <Text style={styles.noPhoneText}>-</Text>
              )}
            </View>
          </View>
        ))}
      </ScrollView>

      {/* EMBEDDED PAYMENT HISTORY MODAL */}
      <Modal visible={payHistoryVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.payHistoryModalContent}>
            <View style={styles.payHistoryHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={{ fontSize: 24 }}>💰</Text>
                <View>
                  <Text style={styles.payHistoryTitle}>{isHindi ? 'भुगतान इतिहास' : 'Payment History'}</Text>
                  <Text style={styles.payHistorySub}>
                    {isHindi ? `कुल प्राप्त: ₹${totalReceivedAllTime.toFixed(0)} (${payments.length} रिकॉर्ड)` : `Total: ₹${totalReceivedAllTime.toFixed(0)} (${payments.length} records)`}
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                onPress={() => setPayHistoryVisible(false)}
                style={styles.modalCloseBtn}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Text style={styles.modalCloseBtnText}>✕</Text>
              </TouchableOpacity>
            </View>

            {sortedPayments.length === 0 ? (
              <View style={styles.emptyPayState}>
                <Text style={{ fontSize: 40, marginBottom: 8 }}>💳</Text>
                <Text style={styles.emptyPayText}>
                  {isHindi ? 'अभी तक कोई भुगतान दर्ज नहीं है।' : 'No payment records found.'}
                </Text>
                <Text style={styles.emptyPaySub}>
                  {isHindi ? 'बकाया रिपोर्ट से भुगतान दर्ज करें।' : 'Record payments from the Due Reports tab.'}
                </Text>
              </View>
            ) : (
              <FlatList
                data={sortedPayments}
                keyExtractor={item => item.id}
                contentContainerStyle={{ paddingVertical: 8 }}
                showsVerticalScrollIndicator={false}
                renderItem={({ item }) => {
                  const cust = customers.find(c => c.id === item.customerId);
                  const custName = cust?.name || (isHindi ? 'अज्ञात ग्राहक' : 'Unknown Customer');
                  return (
                    <View style={styles.payRecordCard}>
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Text style={styles.payRecordName}>{item.customerName || custName}</Text>
                          <View style={styles.payModeBadge}>
                            <Text style={styles.payModeText}>PAID</Text>
                          </View>
                        </View>
                        <Text style={styles.payRecordDate}>📅 {formatToDisplayDate(item.date)}</Text>
                        {item.notes ? (
                          <Text style={styles.payRecordNotes} numberOfLines={1}>📝 {item.notes}</Text>
                        ) : null}
                      </View>

                      <View style={{ alignItems: 'flex-end', marginLeft: 10 }}>
                        <Text style={styles.payRecordAmount}>+₹{item.amountPaid.toFixed(0)}</Text>
                        <TouchableOpacity
                          style={styles.payDeleteBtn}
                          onPress={() => handleDeletePayment(item)}
                          activeOpacity={0.7}
                          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                        >
                          <Text style={styles.payDeleteBtnText}>🗑️ {isHindi ? 'हटाएं' : 'Delete'}</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                }}
              />
            )}

            <TouchableOpacity
              style={styles.payHistoryDoneBtn}
              onPress={() => setPayHistoryVisible(false)}
              activeOpacity={0.8}
            >
              <Text style={styles.payHistoryDoneBtnText}>{isHindi ? 'बंद करें (Done)' : 'Close'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Dairy Profile Edit / Setup Popup Modal */}
      <Modal visible={editDairyModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalIcon}>🥛</Text>
              <Text style={styles.modalTitle}>{t.dairyProfileSetupTitle || 'डेयरी प्रोफाइल सेट करें'}</Text>
              <Text style={styles.modalSubtitle}>
                {t.dairyProfileSetupSub || 'Set your dairy farm name and owner name for receipts & daily registers.'}
              </Text>
            </View>

            <View style={styles.modalBody}>
              <Text style={styles.modalLabel}>{t.dairyNameInputLabel || 'Dairy / Business Name (डेयरी का नाम) *'}</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="e.g. Radhe Dairy / राधे डेयरी फ़ार्म"
                placeholderTextColor="#94a3b8"
                value={dairyNameInput}
                onChangeText={setDairyNameInput}
                autoFocus
              />

              <Text style={styles.modalLabel}>{t.dairyOwnerInputLabel || 'Owner / Supplier Name (आपका नाम)'}</Text>
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
                  <Text style={styles.modalCancelBtnText}>{t.cancel || 'Cancel'}</Text>
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity
                style={[styles.modalSaveBtn, { flex: 1 }]}
                onPress={handleSaveDairyProfile}
                activeOpacity={0.8}
              >
                <Text style={styles.modalSaveBtnText}>{t.saveDairyProfileBtn || '✓ Save Dairy Profile (सहेजें)'}</Text>
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
  content: { padding: 16, paddingBottom: 32 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14
  },
  greeting: { fontSize: 20, fontWeight: 'bold', color: '#0f172a' },
  businessName: { fontSize: 13, color: '#64748b', marginTop: 2 },
  profileBadge: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#e2e8f0',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 10
  },
  profileBadgeText: { fontSize: 20 },

  // PAIRED METRIC CARDS (Total Due & Payment History side-by-side in same space)
  pairedMetricsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16
  },
  dueCardCompact: {
    flex: 1,
    backgroundColor: '#dc2626',
    borderRadius: 14,
    padding: 12,
    shadowColor: '#dc2626',
    shadowOpacity: 0.18,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3
  },
  paymentCardCompact: {
    flex: 1,
    backgroundColor: '#059669',
    borderRadius: 14,
    padding: 12,
    shadowColor: '#059669',
    shadowOpacity: 0.18,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3
  },
  metricCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4
  },
  metricCardIcon: { fontSize: 18 },
  metricBadgeRed: {
    backgroundColor: 'rgba(255,255,255,0.22)',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 10
  },
  metricBadgeRedText: { color: '#fee2e2', fontSize: 10, fontWeight: 'bold' },
  metricBadgeGreen: {
    backgroundColor: 'rgba(255,255,255,0.22)',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 10
  },
  metricBadgeGreenText: { color: '#d1fae5', fontSize: 10, fontWeight: 'bold' },
  metricLabelRed: { color: '#fee2e2', fontSize: 11, fontWeight: '600' },
  metricLabelGreen: { color: '#d1fae5', fontSize: 11, fontWeight: '600' },
  metricAmountRed: { color: '#ffffff', fontSize: 22, fontWeight: 'bold', marginVertical: 3 },
  metricAmountGreen: { color: '#ffffff', fontSize: 22, fontWeight: 'bold', marginVertical: 3 },
  metricActionRow: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.2)',
    paddingTop: 6,
    marginTop: 2
  },
  metricActionRed: { color: '#fecaca', fontSize: 11, fontWeight: 'bold' },
  metricActionGreen: { color: '#a7f3d0', fontSize: 11, fontWeight: 'bold' },

  // Section Headers
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8
  },
  sectionHeading: { fontSize: 15, fontWeight: '700', color: '#1e293b', marginBottom: 10 },
  seeAllText: { fontSize: 13, color: '#0284c7', fontWeight: '600' },

  // Stats Grid (Cow & Buffalo)
  statsGrid: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  statBox: {
    flex: 1,
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.04)'
  },
  milkEmoji: { fontSize: 26, marginBottom: 2 },
  statNumber: { fontSize: 18, fontWeight: 'bold', color: '#1e293b' },
  statLabel: { fontSize: 11, color: '#475569', marginTop: 2, fontWeight: '600' },

  // Today Billed Card
  todayBilledCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 16
  },
  statSmallLabel: { fontSize: 11, color: '#64748b' },
  todayBilledAmount: { fontSize: 18, fontWeight: 'bold', color: '#059669', marginTop: 1 },
  deliveredCountBadge: {
    backgroundColor: '#ecfdf5',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 16
  },
  deliveredCountText: { fontSize: 11, fontWeight: 'bold', color: '#059669' },

  // SLEEK QUICK LINKS GRID (2 columns x 3 rows)
  quickLinksGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 18
  },
  quickLinkTile: {
    width: '48.5%',
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    gap: 8
  },
  quickLinkIconBox: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1
  },
  quickLinkIconText: { fontSize: 18 },
  quickLinkTitle: { fontSize: 12, fontWeight: 'bold', color: '#1e293b' },
  quickLinkSub: { fontSize: 10, color: '#64748b', marginTop: 1 },

  // Recent Customers Section
  customerHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8
  },
  customerCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 10,
    marginBottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#f1f5f9'
  },
  customerInfo: { flex: 1, paddingRight: 8 },
  customerName: { fontSize: 13, fontWeight: '700', color: '#0f172a' },
  customerSub: { fontSize: 11, color: '#64748b', marginTop: 2 },
  customerActionsRow: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  customerActionBtnCall: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#e0f2fe',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#bae6fd'
  },
  customerActionBtnWhatsApp: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#dcfce7',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#bbf7d0'
  },
  customerActionIcon: { fontSize: 15 },
  noPhoneText: { color: '#94a3b8', fontSize: 13 },

  // App Install Banner
  installBannerCard: {
    backgroundColor: '#0284c7',
    borderRadius: 12,
    padding: 10,
    marginBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#0284c7',
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2
  },
  installBannerIconBox: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 6
  },
  installBannerTitle: { color: '#ffffff', fontSize: 13, fontWeight: 'bold' },
  installBannerSub: { color: '#e0f2fe', fontSize: 10, marginTop: 1 },
  installBannerBtn: {
    backgroundColor: '#ffffff',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    marginLeft: 6
  },
  installBannerBtnText: { color: '#0284c7', fontWeight: 'bold', fontSize: 12 },
  installBannerClose: { marginLeft: 6, padding: 4 },
  installBannerCloseText: { color: '#ffffff', fontSize: 14, fontWeight: 'bold', opacity: 0.85 },

  // Modal Common
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    padding: 16
  },
  modalContent: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 8
  },
  modalHeader: { alignItems: 'center', marginBottom: 14 },
  modalIcon: { fontSize: 38, marginBottom: 6 },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: '#0f172a' },
  modalSubtitle: { fontSize: 12, color: '#64748b', textAlign: 'center', marginTop: 3, paddingHorizontal: 10 },
  modalBody: { marginVertical: 8 },
  modalLabel: { fontSize: 12, fontWeight: '600', color: '#334155', marginBottom: 5, marginTop: 6 },
  modalInput: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    backgroundColor: '#f8fafc',
    color: '#0f172a',
    marginBottom: 6
  },
  modalBtnRow: { flexDirection: 'row', gap: 10, marginTop: 12, alignItems: 'center' },
  modalCancelBtn: { paddingVertical: 12, paddingHorizontal: 14, borderRadius: 10, backgroundColor: '#f1f5f9' },
  modalCancelBtnText: { color: '#64748b', fontWeight: '600', fontSize: 13 },
  modalSaveBtn: {
    backgroundColor: '#16a34a',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center'
  },
  modalSaveBtnText: { color: '#ffffff', fontSize: 14, fontWeight: 'bold' },

  // Payment History Modal
  payHistoryModalContent: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    padding: 16,
    maxHeight: '80%',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 10
  },
  payHistoryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9'
  },
  payHistoryTitle: { fontSize: 17, fontWeight: 'bold', color: '#0f172a' },
  payHistorySub: { fontSize: 11, color: '#059669', fontWeight: '600', marginTop: 1 },
  modalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center'
  },
  modalCloseBtnText: { fontSize: 14, color: '#64748b', fontWeight: 'bold' },
  emptyPayState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40
  },
  emptyPayText: { fontSize: 14, fontWeight: '600', color: '#475569' },
  emptyPaySub: { fontSize: 12, color: '#94a3b8', marginTop: 4, textAlign: 'center' },
  payRecordCard: {
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    padding: 10,
    marginVertical: 4,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0'
  },
  payRecordName: { fontSize: 13, fontWeight: '700', color: '#1e293b' },
  payModeBadge: {
    backgroundColor: '#e0f2fe',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 6
  },
  payModeText: { fontSize: 9, fontWeight: 'bold', color: '#0369a1' },
  payRecordDate: { fontSize: 11, color: '#64748b', marginTop: 2 },
  payRecordNotes: { fontSize: 10, color: '#94a3b8', marginTop: 1, fontStyle: 'italic' },
  payRecordAmount: { fontSize: 15, fontWeight: 'bold', color: '#059669' },
  payDeleteBtn: {
    marginTop: 4,
    backgroundColor: '#fee2e2',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6
  },
  payDeleteBtnText: { fontSize: 10, color: '#dc2626', fontWeight: 'bold' },
  payHistoryDoneBtn: {
    backgroundColor: '#0f172a',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 10
  },
  payHistoryDoneBtnText: { color: '#ffffff', fontWeight: 'bold', fontSize: 13 }
});
