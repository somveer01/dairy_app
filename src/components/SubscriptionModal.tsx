import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  Image,
  TextInput,
  Linking
} from 'react-native';
import { useApp } from '../context/AppContext';
import {
  SubscriptionService,
  SUBSCRIPTION_PLANS,
  DEFAULT_UPI_ID,
  PlanPricingItem
} from '../services/subscriptionService';
import { SubscriptionPlanType } from '../types';
import { showAlert } from '../utils/alertUtils';
import { ref, update } from 'firebase/database';
import { rtdb } from '../config/firebase';

export const SubscriptionModal: React.FC = () => {
  const {
    lang,
    supplier,
    isSubscriptionModalVisible,
    closeSubscriptionModal,
    subscriptionStatus
  } = useApp();

  const [selectedPlan, setSelectedPlan] = useState<SubscriptionPlanType>('annual');
  const [utrNumber, setUtrNumber] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isSubscriptionModalVisible) return null;

  const currentPlanObj = SUBSCRIPTION_PLANS.find(p => p.plan === selectedPlan) || SUBSCRIPTION_PLANS[2];
  const upiUrl = supplier ? SubscriptionService.generateUpiUrl(selectedPlan, supplier) : '';
  const qrUrl = upiUrl ? SubscriptionService.generateQrCodeUrl(upiUrl) : '';

  const handlePayViaUpiApp = async () => {
    try {
      if (upiUrl) {
        await Linking.openURL(upiUrl);
      }
    } catch {
      showAlert(
        lang === 'hi' ? 'UPI ऐप खोलें' : 'Open UPI App',
        lang === 'hi'
          ? `सीधे ऐप नहीं खुला। कृपया QR कोड स्कैन करें या UPI ID: ${DEFAULT_UPI_ID} पर ₹${currentPlanObj.price} भेजें।`
          : `Could not open UPI app directly. Please scan the QR code or pay ₹${currentPlanObj.price} to UPI ID: ${DEFAULT_UPI_ID}.`
      );
    }
  };

  const handleSendReceiptWhatsApp = async () => {
    const adminPhone = '918721873433';
    const dairyName = supplier?.businessName || 'डेयरी फ़ार्म';
    const suppPhone = supplier?.phone || '';
    const planName = currentPlanObj.titleHi;
    const price = currentPlanObj.price;
    const utr = utrNumber.trim() || 'अभी भुगतान किया';

    const msg = `🥛 *डेयरी ऐप सदस्यता भुगतान (Dairy App Subscription)*\n\n` +
      `• डेयरी का नाम: *${dairyName}*\n` +
      `• मोबाइल नंबर: *${suppPhone}*\n` +
      `• चुना गया प्लान: *${planName} (₹${price})*\n` +
      `• UTR / Transaction No: *${utr}*\n\n` +
      `नमस्ते एडमिन जी! मैंने डेयरी ऐप की सदस्यता का भुगतान कर दिया है। कृपया मेरा खाता सक्रिय (Activate) करें। धन्यवाद!`;

    const waUrl = `https://wa.me/${adminPhone}?text=${encodeURIComponent(msg)}`;
    try {
      await Linking.openURL(waUrl);
    } catch {
      showAlert('Error', 'Could not open WhatsApp.');
    }
  };

  const handleSubmitUtr = async () => {
    const cleanUtr = utrNumber.trim();
    if (!cleanUtr) {
      showAlert(
        lang === 'hi' ? 'UTR / संदर्भ संख्या आवश्यक' : 'UTR Required',
        lang === 'hi'
          ? 'कृपया भुगतान के बाद 12 अंकों का UPI UTR या Transaction No दर्ज करें।'
          : 'Please enter the 12-digit UPI UTR or Transaction No after payment.'
      );
      return;
    }

    if (!supplier || !supplier.id) return;

    try {
      setIsSubmitting(true);
      const now = Date.now();
      const suppRef = ref(rtdb, `suppliers/${supplier.id}`);
      await update(suppRef, {
        pendingSubscription: {
          plan: selectedPlan,
          amount: currentPlanObj.price,
          utr: cleanUtr,
          submittedAt: now,
          status: 'pending_verification'
        },
        'profile/updatedAt': now
      });

      showAlert(
        lang === 'hi' ? '✓ अनुरोध सबमिट हुआ' : '✓ Request Submitted',
        lang === 'hi'
          ? `आपका भुगतान विवरण (UTR: ${cleanUtr}) सफलतापूर्वक एडमिन को भेज दिया गया है। एडमिन द्वारा सत्यापन होते ही आपकी सदस्यता सक्रिय हो जाएगी।`
          : `Your payment details (UTR: ${cleanUtr}) have been submitted to Admin. Your subscription will be active shortly after verification.`
      );
      setUtrNumber('');
      closeSubscriptionModal();
    } catch {
      showAlert('Error', 'Failed to submit payment details. Please contact via WhatsApp.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      visible={isSubscriptionModalVisible}
      transparent
      animationType="slide"
      onRequestClose={closeSubscriptionModal}
    >
      <View style={styles.overlay}>
        <View style={styles.modalCard}>
          {/* Header */}
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.headerTitle}>
                {lang === 'hi' ? '🥛 डेयरी ऐप सदस्यता' : '🥛 Dairy App Subscription'}
              </Text>
              <Text style={styles.headerSubtitle}>
                {subscriptionStatus.isLocked
                  ? (lang === 'hi' ? '⚠️ मुफ़्त ट्रायल समाप्त • सदस्यता चुनें' : '⚠️ Free Trial Expired • Choose Plan')
                  : (lang === 'hi' ? '✨ असीमित और सुरक्षित क्लाउड बैकअप' : '✨ Unlimited Access & Cloud Backup')}
              </Text>
            </View>
            {!subscriptionStatus.isLocked && (
              <TouchableOpacity onPress={closeSubscriptionModal} style={styles.closeBtn}>
                <Text style={styles.closeBtnText}>✕</Text>
              </TouchableOpacity>
            )}
          </View>

          <ScrollView style={styles.scrollBody} showsVerticalScrollIndicator={false}>
            {/* Status Alert Banner */}
            <View style={[styles.statusBanner, subscriptionStatus.isLocked ? styles.statusBannerLocked : styles.statusBannerActive]}>
              <Text style={styles.statusBannerText}>
                {subscriptionStatus.isLocked
                  ? (lang === 'hi'
                      ? '🔒 आपका 30 दिन का मुफ़्त ट्रायल पूरा हो चुका है। नया दूध और हिसाब दर्ज करने के लिए सदस्यता लें।'
                      : '🔒 Your 30-day Free Trial has ended. Please subscribe to continue logging deliveries.')
                  : (lang === 'hi'
                      ? `⏳ वर्तमान स्थिति: ${subscriptionStatus.planNameHi} (${subscriptionStatus.daysRemaining} दिन शेष)`
                      : `⏳ Current Status: ${subscriptionStatus.planNameEn} (${subscriptionStatus.daysRemaining} days left)`)}
              </Text>
            </View>

            {/* Plans Selection Grid */}
            <Text style={styles.sectionTitle}>
              {lang === 'hi' ? '1. अपनी योजना चुनें (Choose Plan):' : '1. Choose Your Plan:'}
            </Text>
            <View style={styles.plansContainer}>
              {SUBSCRIPTION_PLANS.map((item) => {
                const isSelected = selectedPlan === item.plan;
                return (
                  <TouchableOpacity
                    key={item.plan}
                    style={[styles.planCard, isSelected && styles.planCardSelected]}
                    onPress={() => setSelectedPlan(item.plan)}
                    activeOpacity={0.8}
                  >
                    {item.tagHi && (
                      <View style={[styles.planTag, isSelected ? styles.planTagSelected : {}]}>
                        <Text style={styles.planTagText}>{lang === 'hi' ? item.tagHi : item.tagEn}</Text>
                      </View>
                    )}
                    <View style={styles.planRadioRow}>
                      <View style={[styles.radioCircle, isSelected && styles.radioCircleSelected]}>
                        {isSelected && <View style={styles.radioInner} />}
                      </View>
                      <Text style={[styles.planTitle, isSelected && styles.planTitleSelected]}>
                        {lang === 'hi' ? item.titleHi : item.titleEn}
                      </Text>
                    </View>
                    <View style={styles.priceRow}>
                      <Text style={styles.priceText}>₹{item.price}</Text>
                      {item.originalPrice > item.price && (
                        <Text style={styles.origPriceText}>₹{item.originalPrice}</Text>
                      )}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Payment via UPI Section */}
            <Text style={styles.sectionTitle}>
              {lang === 'hi' ? '2. UPI QR कोड स्कैन कर भुगतान करें:' : '2. Scan UPI QR to Pay:'}
            </Text>

            <View style={styles.qrContainer}>
              {qrUrl ? (
                <Image source={{ uri: qrUrl }} style={styles.qrImage} resizeMode="contain" />
              ) : null}
              <Text style={styles.amountDueText}>
                {lang === 'hi' ? 'देय राशि:' : 'Amount to Pay:'}{' '}
                <Text style={styles.amountDueBold}>₹{currentPlanObj.price}</Text>
              </Text>
              <Text style={styles.upiIdText}>
                UPI ID: <Text style={{ fontWeight: '800', color: '#0369a1' }}>{DEFAULT_UPI_ID}</Text>
              </Text>

              {/* Direct UPI App Button */}
              <TouchableOpacity
                style={styles.upiAppBtn}
                onPress={handlePayViaUpiApp}
                activeOpacity={0.8}
              >
                <Text style={styles.upiAppBtnText}>
                  {lang === 'hi' ? '📲 सीधे UPI ऐप (GPay/PhonePe) से पे करें' : '📲 Pay via UPI App (GPay/PhonePe)'}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Step 3: Confirmation / UTR */}
            <Text style={styles.sectionTitle}>
              {lang === 'hi' ? '3. भुगतान के बाद पुष्टि करें:' : '3. Confirm After Payment:'}
            </Text>

            <View style={styles.confirmBox}>
              <TextInput
                style={styles.utrInput}
                placeholder={lang === 'hi' ? '12-अंकों का UPI UTR / Txn No दर्ज करें' : 'Enter 12-digit UPI UTR / Txn No'}
                placeholderTextColor="#94a3b8"
                value={utrNumber}
                onChangeText={setUtrNumber}
              />

              <TouchableOpacity
                style={[styles.submitBtn, isSubmitting && { opacity: 0.6 }]}
                onPress={handleSubmitUtr}
                disabled={isSubmitting}
                activeOpacity={0.8}
              >
                <Text style={styles.submitBtnText}>
                  {isSubmitting
                    ? (lang === 'hi' ? 'सबमिट हो रहा है...' : 'Submitting...')
                    : (lang === 'hi' ? '✓ UTR सबमिट करें (Submit UTR)' : '✓ Submit UTR')}
                </Text>
              </TouchableOpacity>

              <View style={styles.orDividerRow}>
                <View style={styles.orLine} />
                <Text style={styles.orText}>{lang === 'hi' ? 'या' : 'OR'}</Text>
                <View style={styles.orLine} />
              </View>

              <TouchableOpacity
                style={styles.waBtn}
                onPress={handleSendReceiptWhatsApp}
                activeOpacity={0.8}
              >
                <Text style={styles.waBtnText}>
                  💬 {lang === 'hi' ? 'WhatsApp पर रसीद भेजें' : 'Send Receipt on WhatsApp'}
                </Text>
              </TouchableOpacity>
            </View>

            <View style={styles.guaranteeBox}>
              <Text style={styles.guaranteeText}>
                🛡️ {lang === 'hi'
                  ? 'सुरक्षा गारंटी: आपका पिछला रिकॉर्ड और ग्राहक डेटा हमेशा 100% सुरक्षित रहेगा।'
                  : 'Safe Guarantee: Your historical records and customer balances are permanently safe.'}
              </Text>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'flex-end'
  },
  modalCard: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '92%',
    paddingBottom: 20
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9'
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0f172a'
  },
  headerSubtitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b',
    marginTop: 2
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center'
  },
  closeBtnText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#475569'
  },
  scrollBody: {
    paddingHorizontal: 20,
    paddingTop: 12
  },
  statusBanner: {
    padding: 12,
    borderRadius: 12,
    marginBottom: 16
  },
  statusBannerLocked: {
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca'
  },
  statusBannerActive: {
    backgroundColor: '#f0fdf4',
    borderWidth: 1,
    borderColor: '#bbf7d0'
  },
  statusBannerText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0f172a',
    lineHeight: 18
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#334155',
    marginBottom: 10,
    marginTop: 4
  },
  plansContainer: {
    gap: 10,
    marginBottom: 18
  },
  planCard: {
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    borderRadius: 14,
    padding: 14,
    backgroundColor: '#f8fafc',
    position: 'relative'
  },
  planCardSelected: {
    borderColor: '#0284c7',
    backgroundColor: '#f0f9ff'
  },
  planTag: {
    position: 'absolute',
    top: -9,
    right: 14,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2
  },
  planTagSelected: {
    backgroundColor: '#0284c7',
    borderColor: '#0284c7'
  },
  planTagText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#ffffff'
  },
  planRadioRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  radioCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#cbd5e1',
    alignItems: 'center',
    justifyContent: 'center'
  },
  radioCircleSelected: {
    borderColor: '#0284c7'
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#0284c7'
  },
  planTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#334155'
  },
  planTitleSelected: {
    color: '#0284c7',
    fontWeight: '800'
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
    marginTop: 6,
    paddingLeft: 30
  },
  priceText: {
    fontSize: 18,
    fontWeight: '900',
    color: '#0f172a'
  },
  origPriceText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#94a3b8',
    textDecorationLine: 'line-through'
  },
  qrContainer: {
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 16,
    padding: 16,
    marginBottom: 18
  },
  qrImage: {
    width: 180,
    height: 180,
    borderRadius: 12,
    backgroundColor: '#ffffff',
    marginBottom: 10
  },
  amountDueText: {
    fontSize: 14,
    color: '#475569',
    marginTop: 4
  },
  amountDueBold: {
    fontSize: 18,
    fontWeight: '900',
    color: '#059669'
  },
  upiIdText: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 4
  },
  upiAppBtn: {
    marginTop: 12,
    backgroundColor: '#0284c7',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    width: '100%',
    alignItems: 'center'
  },
  upiAppBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#ffffff'
  },
  confirmBox: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 14,
    padding: 14,
    marginBottom: 16
  },
  utrInput: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 13,
    color: '#0f172a',
    backgroundColor: '#f8fafc',
    marginBottom: 10
  },
  submitBtn: {
    backgroundColor: '#059669',
    paddingVertical: 11,
    borderRadius: 10,
    alignItems: 'center'
  },
  submitBtnText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#ffffff'
  },
  orDividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 10
  },
  orLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#e2e8f0'
  },
  orText: {
    marginHorizontal: 10,
    fontSize: 11,
    fontWeight: '700',
    color: '#94a3b8'
  },
  waBtn: {
    backgroundColor: '#25d366',
    paddingVertical: 11,
    borderRadius: 10,
    alignItems: 'center'
  },
  waBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#ffffff'
  },
  guaranteeBox: {
    padding: 10,
    backgroundColor: '#f1f5f9',
    borderRadius: 10,
    marginBottom: 20
  },
  guaranteeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
    textAlign: 'center',
    lineHeight: 16
  }
});
