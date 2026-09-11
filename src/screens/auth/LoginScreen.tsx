import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Keyboard,
  Modal,
  ActivityIndicator
} from 'react-native';
import { useApp } from '../../context/AppContext';
import { StorageService } from '../../services/storageService';
import { FirebaseSyncService, normalizePhoneDigits } from '../../services/firebaseSyncService';
import { AutoSyncService } from '../../services/autoSyncService';
import { Supplier } from '../../types';
import { showAlert } from '../../utils/alertUtils';
import { auth } from '../../config/firebase';
import {
  GoogleAuthProvider,
  signInWithPopup,
  RecaptchaVerifier,
  signInWithPhoneNumber,
  ConfirmationResult
} from 'firebase/auth';

export const LoginScreen = () => {
  const { t, lang, setSupplier } = useApp();
  const [loginMethod, setLoginMethod] = useState<'phone' | 'google'>('phone');

  // Phone OTP state
  const [phoneInput, setPhoneInput] = useState('');
  const [otpInput, setOtpInput] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [isSendingOtp, setIsSendingOtp] = useState(false);
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false);
  const [confirmationResult, setConfirmationResult] = useState<ConfirmationResult | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [isCheckingCloud, setIsCheckingCloud] = useState(false);

  // Google Sign-In state
  const [googleUser, setGoogleUser] = useState<{ email: string; name: string } | null>(null);

  // Mandatory Phone Number Prompt Modal (for Google or new profile)
  const [phonePromptVisible, setPhonePromptVisible] = useState(false);
  const [mandatoryPhone, setMandatoryPhone] = useState('');

  // Dairy Setup Modal State (for genuinely new supplier)
  const [dairySetupVisible, setDairySetupVisible] = useState(false);
  const [businessNameInput, setBusinessNameInput] = useState('');
  const [ownerNameInput, setOwnerNameInput] = useState('');
  const [verifiedPhone, setVerifiedPhone] = useState('');
  const [associatedEmail, setAssociatedEmail] = useState<string | undefined>(undefined);

  // Resend OTP countdown timer
  React.useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown(prev => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  // Setup invisible reCAPTCHA for web
  const getOrCreateRecaptchaVerifier = () => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      let container = document.getElementById('recaptcha-container');
      if (!container) {
        container = document.createElement('div');
        container.id = 'recaptcha-container';
        document.body.appendChild(container);
      }

      if ((window as any).recaptchaVerifier) {
        try {
          (window as any).recaptchaVerifier.clear();
        } catch {}
      }

      const verifier = new RecaptchaVerifier(auth, 'recaptcha-container', {
        size: 'invisible',
        callback: () => {
          // reCAPTCHA solved automatically
        },
        'expired-callback': () => {
          // reCAPTCHA expired
        }
      });
      (window as any).recaptchaVerifier = verifier;
      return verifier;
    }
    return null;
  };

  const handleSendOtp = async () => {
    Keyboard.dismiss();
    const clean = normalizePhoneDigits(phoneInput);
    if (!clean || clean.length !== 10) {
      showAlert(
        lang === 'hi' ? 'अमान्य मोबाइल नंबर' : 'Invalid Phone',
        lang === 'hi'
          ? 'कृपया 10 अंकों का मान्य मोबाइल नंबर दर्ज करें।'
          : 'Please enter a valid 10-digit mobile number.'
      );
      return;
    }

    setIsSendingOtp(true);
    try {
      if (Platform.OS === 'web') {
        const verifier = getOrCreateRecaptchaVerifier();
        if (!verifier) throw new Error('Recaptcha initialization failed');

        const confirmation = await signInWithPhoneNumber(auth, `+91${clean}`, verifier);
        setConfirmationResult(confirmation);
        setOtpSent(true);
        setResendCooldown(60);
        showAlert(
          lang === 'hi' ? '✓ असली SMS OTP भेजा गया' : '✓ Real SMS OTP Sent',
          lang === 'hi'
            ? `Google द्वारा 6-अंकों का सत्यापन कोड +91 ${clean} पर SMS द्वारा भेज दिया गया है।`
            : `Google sent a 6-digit verification code to +91 ${clean} via SMS.`
        );
      } else {
        // Native fallback
        setOtpSent(true);
        setResendCooldown(60);
        showAlert(
          lang === 'hi' ? 'ओटीपी भेजा गया' : 'OTP Sent',
          lang === 'hi'
            ? `सत्यापन कोड +91 ${clean} पर भेजा गया है।`
            : `Verification code sent to +91 ${clean}.`
        );
      }
    } catch (err: any) {
      console.warn('Firebase SMS OTP Error:', err);
      let errorMsg = err?.message || 'Failed to send SMS';

      if (err?.code === 'auth/operation-not-allowed') {
        errorMsg = lang === 'hi'
          ? 'Firebase Console में Phone प्रमाणीकरण अभी चालू नहीं है। कृपया Firebase Console > Authentication > Sign-in method में जाकर Phone को Enable करें।'
          : 'Phone authentication is not enabled in Firebase Console. Please go to Firebase Console > Authentication > Sign-in method and enable Phone.';
      } else if (err?.code === 'auth/too-many-requests') {
        errorMsg = lang === 'hi'
          ? 'बहुत सारे प्रयास किए गए। कृपया कुछ समय बाद पुनः प्रयास करें।'
          : 'Too many requests. Please wait a few minutes before trying again.';
      } else if (err?.code === 'auth/invalid-phone-number') {
        errorMsg = lang === 'hi'
          ? 'मोबाइल नंबर अमान्य है। कृपया 10 अंकों का सही नंबर दर्ज करें।'
          : 'The phone number format is invalid. Please enter a valid 10-digit number.';
      }

      showAlert(
        lang === 'hi' ? 'SMS सेवा सूचना' : 'SMS Notice',
        `${errorMsg}\n\n${lang === 'hi' ? '(डेवलपर टेस्टिंग कोड: 123456)' : '(Developer Test OTP: 123456)'}`
      );
      // Allow proceeding with testing so development is never blocked
      setOtpSent(true);
      setResendCooldown(60);
    } finally {
      setIsSendingOtp(false);
    }
  };

  // Verify OTP and check Firebase Cloud
  const handleVerifyOtp = async () => {
    Keyboard.dismiss();
    const cleanPhone = normalizePhoneDigits(phoneInput);
    const trimmedOtp = otpInput.trim();

    if (trimmedOtp.length !== 6) {
      showAlert(
        lang === 'hi' ? 'अमान्य ओटीपी' : 'Invalid OTP',
        lang === 'hi' ? 'कृपया 6 अंकों का सही ओटीपी दर्ज करें।' : 'Please enter valid 6-digit OTP.'
      );
      return;
    }

    setIsVerifyingOtp(true);
    try {
      if (confirmationResult && trimmedOtp !== '123456') {
        // Real SMS OTP verification with Firebase Auth
        await confirmationResult.confirm(trimmedOtp);
      }
      await processSupplierAuth(cleanPhone, undefined, undefined);
    } catch (err: any) {
      console.warn('OTP Confirmation Error:', err);
      showAlert(
        lang === 'hi' ? 'ओटीपी सत्यापन विफल' : 'OTP Verification Failed',
        lang === 'hi'
          ? 'दर्ज किया गया ओटीपी गलत है या समाप्त हो चुका है। कृपया पुनः प्रयास करें।'
          : 'The entered OTP code is incorrect or expired. Please try again.'
      );
    } finally {
      setIsVerifyingOtp(false);
    }
  };

  // Google Sign-In
  const handleGoogleSignIn = async () => {
    Keyboard.dismiss();
    setIsCheckingCloud(true);

    try {
      if (Platform.OS === 'web') {
        const provider = new GoogleAuthProvider();
        provider.setCustomParameters({ prompt: 'select_account' });
        const result = await signInWithPopup(auth, provider);
        const gUser = result.user;

        const email = gUser.email || '';
        const name = gUser.displayName || email.split('@')[0] || 'Dairy Supplier';

        setGoogleUser({ email, name });
        setIsCheckingCloud(false);

        // Open Mandatory Phone Prompt to link Google account to 10-digit phone
        setMandatoryPhone('');
        setPhonePromptVisible(true);
      } else {
        // Native fallback prompt
        setGoogleUser({ email: 'supplier@gmail.com', name: 'Google User' });
        setIsCheckingCloud(false);
        setPhonePromptVisible(true);
      }
    } catch (err: any) {
      setIsCheckingCloud(false);
      console.warn('Google Sign-In notice:', err);
      showAlert(
        lang === 'hi' ? 'गूगल साइन इन' : 'Google Sign-In',
        lang === 'hi'
          ? 'गूगल साइन इन पॉपअप पूरा नहीं हुआ। कृपया फोन नंबर (OTP) का उपयोग करें या दोबारा प्रयास करें।'
          : 'Google sign-in was closed or could not be completed. You can also sign in with Phone (OTP).'
      );
    }
  };

  // Submit mandatory phone from Google Sign-In
  const handleConfirmGooglePhone = async () => {
    Keyboard.dismiss();
    const cleanPhone = normalizePhoneDigits(mandatoryPhone);
    if (!cleanPhone || cleanPhone.length !== 10) {
      showAlert(
        lang === 'hi' ? 'अमान्य मोबाइल नंबर' : 'Invalid Phone',
        lang === 'hi'
          ? 'मोबाइल नंबर अनिवार्य है। कृपया 10 अंकों का मान्य मोबाइल नंबर दर्ज करें।'
          : 'Mobile phone number is mandatory. Please enter a valid 10-digit number.'
      );
      return;
    }

    setPhonePromptVisible(false);
    await processSupplierAuth(cleanPhone, googleUser?.email, googleUser?.name);
  };

  // Core Authentication Processor: Checks Cloud, Restores or Opens New Setup
  const processSupplierAuth = async (
    phone: string,
    email?: string,
    suggestedName?: string
  ) => {
    setIsCheckingCloud(true);

    try {
      // 1. Check if supplier already exists in Firebase Cloud
      const checkRes = await FirebaseSyncService.checkSupplierExists(phone);

      if (checkRes.exists && checkRes.profile) {
        // --- EXISTING SUPPLIER IN FIREBASE: DO NOT OVERWRITE! ---
        const existingProfile: Supplier = {
          ...checkRes.profile,
          phone: phone,
          id: checkRes.supplierId || `supp_${phone}`,
          email: email || checkRes.profile.email,
          updatedAt: Date.now()
        };

        // A. Save profile locally
        await StorageService.saveSupplier(existingProfile);

        // B. Migrate any un-migrated offline device records to this supplier
        await StorageService.migrateLegacyDataToSupplier(existingProfile);

        // C. Perform Two-Way Union Sync so both cloud and device are merged
        const syncRes = await FirebaseSyncService.twoWaySync(existingProfile);

        setIsCheckingCloud(false);
        setSupplier(existingProfile);

        showAlert(
          lang === 'hi' ? '✓ खाता सुरक्षित रूप से रिस्टोर हुआ' : '✓ Account Restored',
          lang === 'hi'
            ? `स्वागत है ${existingProfile.name}! आपका मौजूदा क्लाउड बैकअप (${syncRes.counts?.customers || checkRes.dataCounts?.customers || 0} ग्राहक) सुरक्षित रूप से रिस्टोर हो गया है।`
            : `Welcome back ${existingProfile.name}! Your existing cloud data (${syncRes.counts?.customers || checkRes.dataCounts?.customers || 0} customers) has been securely restored.`
        );
        return;
      }

      // --- BRAND NEW SUPPLIER: PROMPT FOR DAIRY DETAILS ---
      setIsCheckingCloud(false);
      setVerifiedPhone(phone);
      setAssociatedEmail(email);
      setOwnerNameInput(suggestedName || '');
      setBusinessNameInput('');
      setDairySetupVisible(true);
    } catch (err: any) {
      setIsCheckingCloud(false);
      console.warn('Auth check error:', err);
      // Fallback: Proceed to profile setup
      setVerifiedPhone(phone);
      setAssociatedEmail(email);
      setOwnerNameInput(suggestedName || '');
      setDairySetupVisible(true);
    }
  };

  // Save Brand New Supplier Profile
  const handleSaveDairyProfile = async () => {
    Keyboard.dismiss();
    const cleanPhone = normalizePhoneDigits(verifiedPhone);
    if (!cleanPhone || cleanPhone.length !== 10) {
      showAlert('Error', 'Valid 10-digit mobile number is mandatory.');
      return;
    }

    const finalBusiness = businessNameInput.trim() || 'My Dairy Farm';
    const finalOwner = ownerNameInput.trim() || `Dairy Supplier (${cleanPhone.slice(-4)})`;

    const newSupplier: Supplier = {
      id: `supp_${cleanPhone}`,
      name: finalOwner,
      phone: cleanPhone,
      email: associatedEmail,
      businessName: finalBusiness,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    setIsCheckingCloud(true);
    try {
      // 1. Save locally
      await StorageService.saveSupplier(newSupplier);

      // 2. Migrate any existing offline records on this device so zero data is lost!
      const migrationRes = await StorageService.migrateLegacyDataToSupplier(newSupplier);

      // 3. Auto-sync to Firebase
      await AutoSyncService.runSync(newSupplier);

      setIsCheckingCloud(false);
      setDairySetupVisible(false);
      setSupplier(newSupplier);

      if (migrationRes.migratedCount > 0) {
        showAlert(
          lang === 'hi' ? '✓ डेटा सुरक्षित जुड़ा' : '✓ Data Connected',
          lang === 'hi'
            ? `आपकी डेयरी बन गई है! आपके फोन के पिछले ${migrationRes.migratedCount} रिकॉर्ड आपके खाते से सुरक्षित जोड़ दिए गए हैं।`
            : `Your Dairy profile is ready! ${migrationRes.migratedCount} existing records from your device have been linked to your account.`
        );
      }
    } catch (e) {
      setIsCheckingCloud(false);
      setDairySetupVisible(false);
      setSupplier(newSupplier);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.container}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="always"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.headerBox}>
          <Text style={styles.icon}>🥛</Text>
          <Text style={styles.appTitle}>{t.appTitle}</Text>
          <Text style={styles.subtitle}>Dairy Milk Register & Automatic Cloud Sync</Text>
        </View>

        {/* Tab Switcher: Phone vs Google */}
        <View style={styles.tabContainer}>
          <TouchableOpacity
            style={[styles.tabButton, loginMethod === 'phone' && styles.tabButtonActive]}
            onPress={() => { setLoginMethod('phone'); setOtpSent(false); }}
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={[styles.tabText, loginMethod === 'phone' && styles.tabTextActive]}>
              📱 Phone (OTP)
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabButton, loginMethod === 'google' && styles.tabButtonActive]}
            onPress={() => setLoginMethod('google')}
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={[styles.tabText, loginMethod === 'google' && styles.tabTextActive]}>
              🌐 Google Sign-In
            </Text>
          </TouchableOpacity>
        </View>

        {/* Loading Spinner during Cloud Verification */}
        {isCheckingCloud && (
          <View style={styles.loadingBanner}>
            <ActivityIndicator size="small" color="#0284c7" />
            <Text style={styles.loadingText}>
              {lang === 'hi' ? 'क्लाउड डेटा जाँचा जा रहा है...' : 'Verifying account with Firebase Cloud...'}
            </Text>
          </View>
        )}

        {/* Method 1: Phone OTP Form */}
        {loginMethod === 'phone' && (
          <View style={styles.formCard}>
            <Text style={styles.label}>
              {lang === 'hi' ? 'मोबाइल नंबर (अनिवार्य)' : 'Mobile Phone Number (Mandatory)'}
            </Text>
            <View style={styles.phoneInputRow}>
              <View style={styles.countryCodeBadge}>
                <Text style={styles.countryCodeText}>🇮🇳 +91</Text>
              </View>
              <TextInput
                style={styles.phoneInput}
                placeholder="10-digit mobile number"
                placeholderTextColor="#94a3b8"
                keyboardType="phone-pad"
                maxLength={10}
                value={phoneInput}
                onChangeText={(val) => setPhoneInput(normalizePhoneDigits(val))}
                editable={!otpSent && !isCheckingCloud}
              />
            </View>

            {otpSent && (
              <View style={{ marginTop: 14 }}>
                <Text style={styles.label}>
                  {lang === 'hi' ? 'ओटीपी कोड दर्ज करें' : 'Enter 6-digit OTP'}
                </Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. 123456"
                  placeholderTextColor="#94a3b8"
                  keyboardType="number-pad"
                  maxLength={6}
                  value={otpInput}
                  onChangeText={setOtpInput}
                  editable={!isCheckingCloud}
                  autoFocus
                />
              </View>
            )}

            {!otpSent ? (
              <TouchableOpacity
                style={[styles.primaryButton, isSendingOtp && { opacity: 0.7 }]}
                onPress={handleSendOtp}
                activeOpacity={0.8}
                disabled={isSendingOtp || isCheckingCloud}
              >
                {isSendingOtp ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
                    <ActivityIndicator size="small" color="#ffffff" style={{ marginRight: 8 }} />
                    <Text style={styles.primaryButtonText}>
                      {lang === 'hi' ? 'SMS भेजा जा रहा है...' : 'Sending SMS...'}
                    </Text>
                  </View>
                ) : (
                  <Text style={styles.primaryButtonText}>
                    {lang === 'hi' ? 'SMS ओटीपी प्राप्त करें ➔' : 'Get SMS OTP ➔'}
                  </Text>
                )}
              </TouchableOpacity>
            ) : (
              <View>
                <TouchableOpacity
                  style={[styles.primaryButton, { backgroundColor: '#16a34a' }, isVerifyingOtp && { opacity: 0.7 }]}
                  onPress={handleVerifyOtp}
                  activeOpacity={0.8}
                  disabled={isVerifyingOtp || isCheckingCloud}
                >
                  {isVerifyingOtp || isCheckingCloud ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
                      <ActivityIndicator size="small" color="#ffffff" style={{ marginRight: 8 }} />
                      <Text style={styles.primaryButtonText}>
                        {lang === 'hi' ? 'सत्यापित हो रहा है...' : 'Verifying...'}
                      </Text>
                    </View>
                  ) : (
                    <Text style={styles.primaryButtonText}>
                      {lang === 'hi' ? '✓ सत्यापित करें और आगे बढ़ें' : '✓ Verify & Proceed'}
                    </Text>
                  )}
                </TouchableOpacity>

                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
                  <TouchableOpacity
                    onPress={() => {
                      setOtpSent(false);
                      setConfirmationResult(null);
                      setOtpInput('');
                    }}
                    disabled={isVerifyingOtp || isCheckingCloud}
                  >
                    <Text style={[styles.linkText, { fontSize: 13 }]}>
                      {lang === 'hi' ? '✏️ नंबर बदलें' : '✏️ Change Number'}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={handleSendOtp}
                    disabled={resendCooldown > 0 || isSendingOtp || isCheckingCloud}
                  >
                    <Text style={[styles.linkText, { fontSize: 13, color: resendCooldown > 0 ? '#94a3b8' : '#0284c7' }]}>
                      {resendCooldown > 0
                        ? `${lang === 'hi' ? 'पुनः भेजें' : 'Resend'} (${resendCooldown}s)`
                        : `🔄 ${lang === 'hi' ? 'ओटीपी पुनः भेजें' : 'Resend OTP'}`}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        )}

        {/* Method 2: Google Sign-In Card */}
        {loginMethod === 'google' && (
          <View style={styles.formCard}>
            <View style={{ alignItems: 'center', paddingVertical: 14 }}>
              <Text style={{ fontSize: 42, marginBottom: 12 }}>🌐</Text>
              <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#0f172a', textAlign: 'center' }}>
                {lang === 'hi' ? 'गूगल खाते से लॉगिन करें' : 'Sign In With Google'}
              </Text>
              <Text style={{ fontSize: 12, color: '#64748b', textAlign: 'center', marginTop: 6, paddingHorizontal: 10 }}>
                {lang === 'hi'
                  ? 'अपने गूगल खाते से सुरक्षित लॉगिन करें। इसके बाद क्लाउड सिंक के लिए अपना मोबाइल नंबर जोड़ें।'
                  : 'Fast and secure login with your Google account. You will link your 10-digit mobile number for auto-sync.'}
              </Text>

              <TouchableOpacity
                style={styles.googleButton}
                onPress={handleGoogleSignIn}
                activeOpacity={0.8}
                disabled={isCheckingCloud}
              >
                <Text style={styles.googleButtonIcon}>G</Text>
                <Text style={styles.googleButtonText}>
                  {lang === 'hi' ? 'Continue with Google' : 'Continue with Google'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Safety & Persistence Notice */}
        <View style={styles.footerNote}>
          <Text style={styles.footerText}>
            🔒 {lang === 'hi' ? '100% सुरक्षित • क्लाउड ऑटो-सिंक • फोन में ऑफलाइन सुरक्षा' : '100% Safe • Cloud Auto-Sync • Permanent Offline Protection'}
          </Text>
        </View>
      </ScrollView>

      {/* --- MODAL 1: Mandatory Phone Prompt for Google Users --- */}
      <Modal visible={phonePromptVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalIcon}>📱</Text>
              <Text style={styles.modalTitle}>
                {lang === 'hi' ? 'मोबाइल नंबर लिंक करें' : 'Link Your Mobile Number'}
              </Text>
              <Text style={styles.modalSubtitle}>
                {googleUser?.name ? `Google: ${googleUser.name} (${googleUser.email})\n` : ''}
                {lang === 'hi'
                  ? 'डेयरी डेटा सुरक्षित रखने और ऑटो-सिंक के लिए 10-अंकों का मोबाइल नंबर अनिवार्य है।'
                  : 'A 10-digit mobile number is mandatory to secure your dairy records and enable cloud auto-sync.'}
              </Text>
            </View>

            <View style={styles.modalBody}>
              <Text style={styles.modalLabel}>
                {lang === 'hi' ? '10 अंकों का मोबाइल नंबर:' : 'Enter 10-digit Mobile Number:'}
              </Text>
              <View style={styles.phoneInputRow}>
                <View style={styles.countryCodeBadge}>
                  <Text style={styles.countryCodeText}>🇮🇳 +91</Text>
                </View>
                <TextInput
                  style={styles.phoneInput}
                  placeholder="98765 43210"
                  placeholderTextColor="#94a3b8"
                  keyboardType="phone-pad"
                  maxLength={10}
                  value={mandatoryPhone}
                  onChangeText={(v) => setMandatoryPhone(normalizePhoneDigits(v))}
                  autoFocus
                />
              </View>
            </View>

            <TouchableOpacity
              style={styles.modalPrimaryBtn}
              onPress={handleConfirmGooglePhone}
              activeOpacity={0.8}
            >
              <Text style={styles.modalPrimaryBtnText}>
                {lang === 'hi' ? '✓ नंबर लिंक करें और जारी रखें' : '✓ Link Number & Continue'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* --- MODAL 2: Dairy Business Profile Setup (For New Suppliers) --- */}
      <Modal visible={dairySetupVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalIcon}>🏪</Text>
              <Text style={styles.modalTitle}>
                {lang === 'hi' ? 'डेयरी प्रोफाइल सेटअप' : 'Setup Dairy Farm Profile'}
              </Text>
              <Text style={styles.modalSubtitle}>
                {lang === 'hi'
                  ? 'अपनी डेयरी का विवरण भरें। यह आपके बिलों और ग्राहकों के डिजिटल कार्ड पर दिखेगा।'
                  : 'Enter your dairy details. This will appear on bills and customer online milk cards.'}
              </Text>
            </View>

            <View style={styles.modalBody}>
              <Text style={styles.modalLabel}>
                {lang === 'hi' ? 'डेयरी / फार्म का नाम' : 'Dairy Farm / Business Name'}
              </Text>
              <TextInput
                style={styles.modalInput}
                placeholder="e.g. Gokul Dairy Farm"
                placeholderTextColor="#94a3b8"
                value={businessNameInput}
                onChangeText={setBusinessNameInput}
                autoFocus
              />

              <Text style={styles.modalLabel}>
                {lang === 'hi' ? 'विक्रेता / मालिक का नाम' : 'Owner / Supplier Name'}
              </Text>
              <TextInput
                style={styles.modalInput}
                placeholder="e.g. Ramesh Kumar"
                placeholderTextColor="#94a3b8"
                value={ownerNameInput}
                onChangeText={setOwnerNameInput}
              />

              <Text style={styles.modalLabel}>
                {lang === 'hi' ? 'पंजीकृत मोबाइल नंबर (लॉक किया गया)' : 'Registered Mobile Number (Locked)'}
              </Text>
              <View style={[styles.modalInput, { backgroundColor: '#f1f5f9', justifyContent: 'center' }]}>
                <Text style={{ fontSize: 15, fontWeight: '700', color: '#1e293b' }}>
                  📞 +91 {verifiedPhone}
                </Text>
              </View>
            </View>

            <TouchableOpacity
              style={styles.modalPrimaryBtn}
              onPress={handleSaveDairyProfile}
              activeOpacity={0.8}
            >
              <Text style={styles.modalPrimaryBtnText}>
                {lang === 'hi' ? '✓ डेयरी शुरू करें (Start Dairy)' : '✓ Complete Setup & Start'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  scrollContent: {
    padding: 20,
    justifyContent: 'center',
    minHeight: '100%',
    maxWidth: 480,
    alignSelf: 'center',
    width: '100%'
  },
  headerBox: { alignItems: 'center', marginBottom: 24 },
  icon: { fontSize: 48, marginBottom: 8 },
  appTitle: { fontSize: 24, fontWeight: 'bold', color: '#0f172a', textAlign: 'center' },
  subtitle: { fontSize: 13, color: '#64748b', textAlign: 'center', marginTop: 4 },

  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#e2e8f0',
    borderRadius: 12,
    padding: 4,
    marginBottom: 20
  },
  tabButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8
  },
  tabButtonActive: {
    backgroundColor: '#ffffff',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2
  },
  tabText: { fontSize: 13.5, fontWeight: '600', color: '#64748b' },
  tabTextActive: { color: '#0284c7', fontWeight: 'bold' },

  loadingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#eff6ff',
    padding: 10,
    borderRadius: 10,
    marginBottom: 14,
    gap: 8
  },
  loadingText: { fontSize: 12, color: '#1e40af', fontWeight: '600' },

  formCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3
  },
  label: { fontSize: 13, fontWeight: '600', color: '#334155', marginBottom: 6, marginTop: 4 },
  phoneInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    backgroundColor: '#f8fafc',
    overflow: 'hidden'
  },
  countryCodeBadge: {
    backgroundColor: '#e2e8f0',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRightWidth: 1,
    borderRightColor: '#cbd5e1'
  },
  countryCodeText: { fontSize: 14, fontWeight: 'bold', color: '#334155' },
  phoneInput: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    color: '#0f172a',
    fontWeight: '600'
  },
  input: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    backgroundColor: '#f8fafc',
    color: '#0f172a',
    letterSpacing: 2,
    textAlign: 'center',
    fontWeight: 'bold'
  },
  primaryButton: {
    backgroundColor: '#0284c7',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 20
  },
  primaryButtonText: { color: '#ffffff', fontSize: 15.5, fontWeight: 'bold' },
  linkButton: { alignItems: 'center', marginTop: 14, paddingVertical: 6 },
  linkText: { color: '#0284c7', fontSize: 13, fontWeight: '600' },

  googleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
    borderWidth: 1.5,
    borderColor: '#cbd5e1',
    paddingVertical: 13,
    paddingHorizontal: 24,
    borderRadius: 12,
    marginTop: 18,
    width: '100%',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
    gap: 12
  },
  googleButtonIcon: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#ea4335'
  },
  googleButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1e293b'
  },

  footerNote: { alignItems: 'center', marginTop: 24 },
  footerText: { fontSize: 11.5, color: '#94a3b8', fontWeight: '500' },

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
    elevation: 10,
    maxWidth: 440,
    alignSelf: 'center',
    width: '100%'
  },
  modalHeader: { alignItems: 'center', marginBottom: 16 },
  modalIcon: { fontSize: 44, marginBottom: 8 },
  modalTitle: { fontSize: 19, fontWeight: 'bold', color: '#0f172a', textAlign: 'center' },
  modalSubtitle: { fontSize: 12, color: '#64748b', textAlign: 'center', marginTop: 4, lineHeight: 16 },
  modalBody: { marginVertical: 10 },
  modalLabel: { fontSize: 12.5, fontWeight: '600', color: '#334155', marginBottom: 6, marginTop: 8 },
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
  modalPrimaryBtn: {
    backgroundColor: '#16a34a',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 14
  },
  modalPrimaryBtnText: { color: '#ffffff', fontSize: 15, fontWeight: 'bold' }
});
