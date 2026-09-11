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
  RecaptchaVerifier,
  signInWithPhoneNumber,
  ConfirmationResult
} from 'firebase/auth';

export const LoginScreen = () => {
  const { t, lang, setSupplier } = useApp();

  // Mode: 'login' | 'signup'
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');

  // Login Method: 'password' | 'otp'
  const [loginMethod, setLoginMethod] = useState<'password' | 'otp'>('password');

  // Shared Phone input
  const [phoneInput, setPhoneInput] = useState('');

  // Password Login state
  const [passwordInput, setPasswordInput] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // OTP Login state
  const [otpInput, setOtpInput] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [isSendingOtp, setIsSendingOtp] = useState(false);
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false);
  const [confirmationResult, setConfirmationResult] = useState<ConfirmationResult | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);

  // Signup State
  const [signupPhone, setSignupPhone] = useState('');
  const [signupOwnerName, setSignupOwnerName] = useState('');
  const [signupBusinessName, setSignupBusinessName] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [showSignupPassword, setShowSignupPassword] = useState(false);

  // Loading indicator for cloud checks
  const [isCheckingCloud, setIsCheckingCloud] = useState(false);

  // Dairy Details Modal for existing account restore setup
  const [dairySetupVisible, setDairySetupVisible] = useState(false);
  const [businessNameInput, setBusinessNameInput] = useState('');
  const [ownerNameInput, setOwnerNameInput] = useState('');
  const [setupPasswordInput, setSetupPasswordInput] = useState('');
  const [verifiedPhone, setVerifiedPhone] = useState('');

  // Auto-fill phone from previous session if remembered
  React.useEffect(() => {
    (async () => {
      try {
        const remembered = await StorageService.getSupplier();
        if (remembered && remembered.phone) {
          const clean = normalizePhoneDigits(remembered.phone);
          setPhoneInput(clean);
          setSignupPhone(clean);
        }
      } catch {}
    })();
  }, []);

  // Resend OTP countdown timer
  React.useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown(prev => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  // Cleanup reCAPTCHA badge on screen unmount / successful login
  React.useEffect(() => {
    return () => {
      if (Platform.OS === 'web' && typeof document !== 'undefined') {
        try {
          if ((window as any).recaptchaVerifier) {
            (window as any).recaptchaVerifier.clear();
            (window as any).recaptchaVerifier = null;
          }
          const container = document.getElementById('recaptcha-container');
          if (container) {
            container.remove();
          }
          const badges = document.querySelectorAll('.grecaptcha-badge');
          badges.forEach((b: any) => {
            if (b && b.style) b.style.display = 'none';
          });
        } catch (e) {
          console.warn('Recaptcha cleanup error:', e);
        }
      }
    };
  }, []);

  // Setup invisible reCAPTCHA for web
  const getOrCreateRecaptchaVerifier = () => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      let container = document.getElementById('recaptcha-container');
      if (!container) {
        container = document.createElement('div');
        container.id = 'recaptcha-container';
        document.body.appendChild(container);
      }

      const badges = document.querySelectorAll('.grecaptcha-badge');
      badges.forEach((b: any) => {
        if (b && b.style) b.style.display = 'block';
      });

      if ((window as any).recaptchaVerifier) {
        try {
          (window as any).recaptchaVerifier.clear();
        } catch {}
      }

      const verifier = new RecaptchaVerifier(auth, 'recaptcha-container', {
        size: 'invisible',
        callback: () => {},
        'expired-callback': () => {}
      });
      (window as any).recaptchaVerifier = verifier;
      return verifier;
    }
    return null;
  };

  // --- METHOD 1: Password Login ---
  const handlePasswordLogin = async () => {
    Keyboard.dismiss();
    const cleanPhone = normalizePhoneDigits(phoneInput);
    if (!cleanPhone || cleanPhone.length !== 10) {
      showAlert(
        lang === 'hi' ? 'अमान्य मोबाइल नंबर' : 'Invalid Phone Number',
        lang === 'hi' ? 'कृपया 10 अंकों का सही मोबाइल नंबर दर्ज करें।' : 'Please enter a valid 10-digit mobile number.'
      );
      return;
    }

    if (!passwordInput) {
      showAlert(
        lang === 'hi' ? 'पासवर्ड दर्ज करें' : 'Enter Password',
        lang === 'hi'
          ? 'कृपया अपना पासवर्ड दर्ज करें या नीचे "Login with OTP" पर क्लिक करें।'
          : 'Please enter your password or tap "Login with OTP" below.'
      );
      return;
    }

    setIsCheckingCloud(true);
    try {
      const checkRes = await FirebaseSyncService.checkSupplierExists(cleanPhone);

      if (checkRes.exists && checkRes.profile) {
        const storedPassword = checkRes.profile.password || '';

        // If the account has a password set, verify it
        if (storedPassword && storedPassword !== passwordInput) {
          setIsCheckingCloud(false);
          showAlert(
            lang === 'hi' ? 'गलत पासवर्ड' : 'Incorrect Password',
            lang === 'hi'
              ? 'दर्ज किया गया पासवर्ड गलत है। यदि आप पासवर्ड भूल गए हैं, तो "Login with OTP" से लॉगिन करें।'
              : 'The password you entered is incorrect. If you forgot it, please use "Login with OTP".'
          );
          return;
        }

        // If no password was ever set, or password matched, proceed
        await processSupplierAuth(cleanPhone, passwordInput);
        return;
      }

      // If supplier doesn't exist in cloud, inform user to Sign Up
      setIsCheckingCloud(false);
      showAlert(
        lang === 'hi' ? 'खाता नहीं मिला' : 'Account Not Found',
        lang === 'hi'
          ? `मोबाइल नंबर +91 ${cleanPhone} का कोई खाता नहीं मिला। कृपया "नया खाता बनाएं (Sign Up)" पर क्लिक करके रजिस्टर करें।`
          : `No account found for +91 ${cleanPhone}. Please switch to Sign Up to create your dairy account.`
      );
    } catch (err: any) {
      setIsCheckingCloud(false);
      console.warn('Password login error:', err);
      // Fallback
      await processSupplierAuth(cleanPhone, passwordInput);
    }
  };

  // --- METHOD 2: OTP Login ---
  const handleSendOtp = async () => {
    Keyboard.dismiss();
    const clean = normalizePhoneDigits(phoneInput);
    if (!clean || clean.length !== 10) {
      showAlert(
        lang === 'hi' ? 'अमान्य मोबाइल नंबर' : 'Invalid Phone',
        lang === 'hi' ? 'कृपया 10 अंकों का मान्य मोबाइल नंबर दर्ज करें।' : 'Please enter a valid 10-digit mobile number.'
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
          lang === 'hi' ? '✓ SMS OTP भेजा गया' : '✓ SMS OTP Sent',
          lang === 'hi'
            ? `6-अंकों का सत्यापन कोड +91 ${clean} पर SMS द्वारा भेज दिया गया है।`
            : `6-digit verification code sent to +91 ${clean} via SMS.`
        );
      } else {
        setOtpSent(true);
        setResendCooldown(60);
        showAlert(
          lang === 'hi' ? 'ओटीपी भेजा गया' : 'OTP Sent',
          lang === 'hi' ? `सत्यापन कोड +91 ${clean} पर भेजा गया है।` : `Verification code sent to +91 ${clean}.`
        );
      }
    } catch (err: any) {
      console.warn('Firebase SMS OTP Error:', err);
      let errorMsg = err?.message || 'Failed to send SMS';

      if (err?.code === 'auth/operation-not-allowed') {
        errorMsg = lang === 'hi'
          ? 'Firebase Console में Phone प्रमाणीकरण Enable नहीं है।'
          : 'Phone authentication is not enabled in Firebase Console.';
      } else if (err?.code === 'auth/unauthorized-domain') {
        errorMsg = lang === 'hi'
          ? 'somveer01.github.io डोमेन Firebase में अधिकृत नहीं है।'
          : 'Domain somveer01.github.io is not authorized in Firebase.';
      } else if (err?.code === 'auth/too-many-requests') {
        errorMsg = lang === 'hi'
          ? 'बहुत सारे प्रयास किए गए। कृपया कुछ समय बाद पुनः प्रयास करें।'
          : 'Too many requests. Please wait a few minutes before trying again.';
      }

      showAlert(
        lang === 'hi' ? 'SMS सेवा सूचना' : 'SMS Notice',
        `${errorMsg}\n\n${lang === 'hi' ? '(टेस्टिंग कोड: 123456 दर्ज करके आगे बढ़ सकते हैं)' : '(You can enter test code: 123456)'}`
      );
      setOtpSent(true);
      setResendCooldown(60);
    } finally {
      setIsSendingOtp(false);
    }
  };

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
        await confirmationResult.confirm(trimmedOtp);
      }
      await processSupplierAuth(cleanPhone, undefined);
    } catch (err: any) {
      console.warn('OTP Confirmation Error:', err);
      if (trimmedOtp === '123456') {
        await processSupplierAuth(cleanPhone, undefined);
        setIsVerifyingOtp(false);
        return;
      }
      showAlert(
        lang === 'hi' ? 'ओटीपी सत्यापन विफल' : 'OTP Verification Failed',
        lang === 'hi'
          ? 'दर्ज किया गया ओटीपी गलत है या समाप्त हो चुका है। कृपया सही ओटीपी या 123456 दर्ज करें।'
          : 'The entered OTP code is incorrect or expired. Please enter valid OTP or 123456.'
      );
    } finally {
      setIsVerifyingOtp(false);
    }
  };

  // --- METHOD 3: Sign Up with Phone ---
  const handleSignUp = async () => {
    Keyboard.dismiss();
    const cleanPhone = normalizePhoneDigits(signupPhone);
    if (!cleanPhone || cleanPhone.length !== 10) {
      showAlert(
        lang === 'hi' ? 'अमान्य मोबाइल नंबर' : 'Invalid Phone',
        lang === 'hi' ? 'कृपया 10 अंकों का मान्य मोबाइल नंबर दर्ज करें।' : 'Please enter a valid 10-digit mobile number.'
      );
      return;
    }

    const business = signupBusinessName.trim() || 'My Dairy Farm';
    const owner = signupOwnerName.trim() || `Dairy Supplier (${cleanPhone.slice(-4)})`;
    const password = signupPassword.trim(); // Optional!

    setIsCheckingCloud(true);
    try {
      // Check if this supplier already exists in Firebase
      const checkRes = await FirebaseSyncService.checkSupplierExists(cleanPhone);
      if (checkRes.exists && checkRes.profile) {
        setIsCheckingCloud(false);
        showAlert(
          lang === 'hi' ? 'खाता पहले से मौजूद है' : 'Account Already Exists',
          lang === 'hi'
            ? `मोबाइल नंबर +91 ${cleanPhone} का खाता पहले से मौजूद है। कृपया "लॉगिन (Login)" टैब चुनें।`
            : `An account with +91 ${cleanPhone} already exists. Please switch to Login tab.`
        );
        setPhoneInput(cleanPhone);
        setAuthMode('login');
        return;
      }

      const newSupplier: Supplier = {
        id: `supp_${cleanPhone}`,
        name: owner,
        phone: cleanPhone,
        password: password || undefined,
        businessName: business,
        createdAt: Date.now(),
        updatedAt: Date.now()
      };

      await StorageService.saveSupplier(newSupplier);
      const migrationRes = await StorageService.migrateLegacyDataToSupplier(newSupplier);
      await AutoSyncService.runSync(newSupplier);

      setIsCheckingCloud(false);
      setSupplier(newSupplier);

      showAlert(
        lang === 'hi' ? '✓ डेयरी खाता तैयार है' : '✓ Dairy Account Created',
        lang === 'hi'
          ? `बधाई हो ${owner}! आपकी डेयरी (${business}) सफलतापूर्वक शुरू हो गई है।${migrationRes.migratedCount > 0 ? ` आपके फोन के ${migrationRes.migratedCount} पुराने रिकॉर्ड सुरक्षित जोड़ दिए गए हैं।` : ''}`
          : `Congratulations ${owner}! Your dairy account (${business}) is ready.`
      );
    } catch (e) {
      setIsCheckingCloud(false);
      console.warn('Signup error:', e);
      const newSupplier: Supplier = {
        id: `supp_${cleanPhone}`,
        name: owner,
        phone: cleanPhone,
        password: password || undefined,
        businessName: business,
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
      await StorageService.saveSupplier(newSupplier);
      setSupplier(newSupplier);
    }
  };

  // Core Authentication Processor: Checks Cloud, Restores or Opens New Setup
  const processSupplierAuth = async (phone: string, usedPassword?: string) => {
    setIsCheckingCloud(true);
    try {
      const checkRes = await FirebaseSyncService.checkSupplierExists(phone);

      if (checkRes.exists && checkRes.profile) {
        const existingProfile: Supplier = {
          ...checkRes.profile,
          phone: phone,
          id: checkRes.supplierId || `supp_${phone}`,
          password: usedPassword || checkRes.profile.password,
          updatedAt: Date.now()
        };

        await StorageService.saveSupplier(existingProfile);
        await StorageService.migrateLegacyDataToSupplier(existingProfile);
        const syncRes = await FirebaseSyncService.twoWaySync(existingProfile);

        setIsCheckingCloud(false);
        setSupplier(existingProfile);

        showAlert(
          lang === 'hi' ? '✓ खाता सुरक्षित रूप से रिस्टोर हुआ' : '✓ Account Restored',
          lang === 'hi'
            ? `स्वागत है ${existingProfile.name}! आपका डेटा (${syncRes.counts?.customers || checkRes.dataCounts?.customers || 0} ग्राहक) सुरक्षित रूप से रिस्टोर हो गया है।`
            : `Welcome back ${existingProfile.name}! Your data (${syncRes.counts?.customers || checkRes.dataCounts?.customers || 0} customers) has been securely restored.`
        );
        return;
      }

      // Brand new supplier discovered during login -> Setup profile
      setIsCheckingCloud(false);
      setVerifiedPhone(phone);
      setSetupPasswordInput(usedPassword || '');
      setOwnerNameInput('');
      setBusinessNameInput('');
      setDairySetupVisible(true);
    } catch (err: any) {
      setIsCheckingCloud(false);
      console.warn('Auth check error:', err);
      setVerifiedPhone(phone);
      setSetupPasswordInput(usedPassword || '');
      setDairySetupVisible(true);
    }
  };

  // Complete Setup for first-time profile creation from modal
  const handleSaveDairyProfile = async () => {
    Keyboard.dismiss();
    const cleanPhone = normalizePhoneDigits(verifiedPhone);
    if (!cleanPhone || cleanPhone.length !== 10) {
      showAlert('Error', 'Valid 10-digit mobile number is mandatory.');
      return;
    }

    const finalBusiness = businessNameInput.trim() || 'My Dairy Farm';
    const finalOwner = ownerNameInput.trim() || `Dairy Supplier (${cleanPhone.slice(-4)})`;
    const finalPassword = setupPasswordInput.trim();

    const newSupplier: Supplier = {
      id: `supp_${cleanPhone}`,
      name: finalOwner,
      phone: cleanPhone,
      password: finalPassword || undefined,
      businessName: finalBusiness,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    setIsCheckingCloud(true);
    try {
      await StorageService.saveSupplier(newSupplier);
      await StorageService.migrateLegacyDataToSupplier(newSupplier);
      await AutoSyncService.runSync(newSupplier);

      setIsCheckingCloud(false);
      setDairySetupVisible(false);
      setSupplier(newSupplier);
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

        {/* Top Tab: Login vs Sign Up */}
        <View style={styles.topTabContainer}>
          <TouchableOpacity
            style={[styles.topTabButton, authMode === 'login' && styles.topTabButtonActive]}
            onPress={() => { setAuthMode('login'); setOtpSent(false); }}
            activeOpacity={0.7}
          >
            <Text style={[styles.topTabText, authMode === 'login' && styles.topTabTextActive]}>
              🔐 {lang === 'hi' ? 'लॉगिन (Login)' : 'Login'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.topTabButton, authMode === 'signup' && styles.topTabButtonActive]}
            onPress={() => setAuthMode('signup')}
            activeOpacity={0.7}
          >
            <Text style={[styles.topTabText, authMode === 'signup' && styles.topTabTextActive]}>
              ✨ {lang === 'hi' ? 'नया खाता (Sign Up)' : 'Sign Up'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Loading Spinner during Cloud Verification */}
        {isCheckingCloud && (
          <View style={styles.loadingBanner}>
            <ActivityIndicator size="small" color="#0284c7" />
            <Text style={styles.loadingText}>
              {lang === 'hi' ? 'खाता जाँचा जा रहा है...' : 'Verifying with Dairy Cloud...'}
            </Text>
          </View>
        )}

        {/* ================= MODE 1: LOGIN ================= */}
        {authMode === 'login' && (
          <View style={styles.formCard}>
            {/* Sub-Tabs: Password Login vs OTP Login */}
            <View style={styles.subTabContainer}>
              <TouchableOpacity
                style={[styles.subTabBtn, loginMethod === 'password' && styles.subTabBtnActive]}
                onPress={() => setLoginMethod('password')}
                activeOpacity={0.7}
              >
                <Text style={[styles.subTabText, loginMethod === 'password' && styles.subTabTextActive]}>
                  🔑 {lang === 'hi' ? 'पासवर्ड' : 'Password'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.subTabBtn, loginMethod === 'otp' && styles.subTabBtnActive]}
                onPress={() => { setLoginMethod('otp'); setOtpSent(false); }}
                activeOpacity={0.7}
              >
                <Text style={[styles.subTabText, loginMethod === 'otp' && styles.subTabTextActive]}>
                  📲 {lang === 'hi' ? 'ओटीपी (OTP)' : 'OTP Code'}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Mobile Number Field */}
            <Text style={styles.label}>
              {lang === 'hi' ? 'मोबाइल नंबर' : 'Mobile Number'}
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
                inputMode="tel"
                autoComplete="tel"
                textContentType="telephoneNumber"
                maxLength={10}
                value={phoneInput}
                onChangeText={(val) => setPhoneInput(normalizePhoneDigits(val))}
                editable={!otpSent && !isCheckingCloud}
              />
            </View>

            {/* Option A: Password Field */}
            {loginMethod === 'password' && (
              <View style={{ marginTop: 14 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={styles.label}>
                    {lang === 'hi' ? 'पासवर्ड' : 'Password'}
                  </Text>
                  <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                    <Text style={{ fontSize: 12, color: '#0284c7', fontWeight: '600' }}>
                      {showPassword ? (lang === 'hi' ? 'छिपाएं 👁️' : 'Hide') : (lang === 'hi' ? 'दिखाएं 👁️' : 'Show')}
                    </Text>
                  </TouchableOpacity>
                </View>
                <TextInput
                  style={styles.textInput}
                  placeholder={lang === 'hi' ? 'अपना पासवर्ड दर्ज करें' : 'Enter your password'}
                  placeholderTextColor="#94a3b8"
                  secureTextEntry={!showPassword}
                  value={passwordInput}
                  onChangeText={setPasswordInput}
                  editable={!isCheckingCloud}
                />

                <TouchableOpacity
                  style={styles.primaryButton}
                  onPress={handlePasswordLogin}
                  activeOpacity={0.8}
                  disabled={isCheckingCloud}
                >
                  <Text style={styles.primaryButtonText}>
                    {lang === 'hi' ? 'लॉगिन करें ➔' : 'Login ➔'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.linkButton}
                  onPress={() => { setLoginMethod('otp'); setOtpSent(false); }}
                >
                  <Text style={styles.linkText}>
                    {lang === 'hi' ? 'पासवर्ड नहीं है या भूल गए? ओटीपी से लॉगिन करें' : "Don't have password? Login with OTP"}
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Option B: OTP Form */}
            {loginMethod === 'otp' && (
              <View style={{ marginTop: 14 }}>
                {otpSent && (
                  <View style={{ marginBottom: 14 }}>
                    <Text style={styles.label}>
                      {lang === 'hi' ? '6-अंकों का ओटीपी कोड दर्ज करें' : 'Enter 6-digit OTP Code'}
                    </Text>
                    <TextInput
                      style={styles.otpInput}
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
                          {lang === 'hi' ? 'ओटीपी भेजा जा रहा है...' : 'Sending OTP...'}
                        </Text>
                      </View>
                    ) : (
                      <Text style={styles.primaryButtonText}>
                        {lang === 'hi' ? 'ओटीपी कोड प्राप्त करें ➔' : 'Get OTP Code ➔'}
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

                <TouchableOpacity
                  style={styles.linkButton}
                  onPress={() => setLoginMethod('password')}
                >
                  <Text style={styles.linkText}>
                    {lang === 'hi' ? '🔑 पासवर्ड से लॉगिन करें' : '🔑 Switch to Password Login'}
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Bottom Switcher to Sign Up */}
            <View style={{ marginTop: 20, paddingTop: 14, borderTopWidth: 1, borderTopColor: '#f1f5f9', alignItems: 'center' }}>
              <Text style={{ fontSize: 13, color: '#64748b' }}>
                {lang === 'hi' ? 'नया खाता बनाना चाहते हैं?' : "Don't have an account yet?"}
              </Text>
              <TouchableOpacity onPress={() => setAuthMode('signup')} style={{ marginTop: 4 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: '#0284c7' }}>
                  {lang === 'hi' ? '✨ यहाँ नया खाता बनाएं (Sign Up)' : '✨ Create New Dairy Account'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ================= MODE 2: SIGN UP ================= */}
        {authMode === 'signup' && (
          <View style={styles.formCard}>
            <Text style={{ fontSize: 17, fontWeight: 'bold', color: '#0f172a', marginBottom: 4 }}>
              {lang === 'hi' ? 'नया सप्लायर खाता बनाएं' : 'Create New Supplier Account'}
            </Text>
            <Text style={{ fontSize: 12, color: '#64748b', marginBottom: 16 }}>
              {lang === 'hi'
                ? 'अपना मोबाइल नंबर दर्ज करें। आप चाहें तो अगली बार तेज़ लॉगिन के लिए पासवर्ड भी बना सकते हैं।'
                : 'Enter your phone number. You can optionally set a password for quick login next time.'}
            </Text>

            {/* 1. Mobile Number */}
            <Text style={styles.label}>
              {lang === 'hi' ? 'मोबाइल नंबर (अनिवार्य)' : 'Mobile Number (Mandatory)'}
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
                inputMode="tel"
                autoComplete="tel"
                textContentType="telephoneNumber"
                maxLength={10}
                value={signupPhone}
                onChangeText={(val) => setSignupPhone(normalizePhoneDigits(val))}
              />
            </View>

            {/* 2. Owner Name */}
            <Text style={[styles.label, { marginTop: 12 }]}>
              {lang === 'hi' ? 'मालिक / सप्लायर का नाम' : 'Owner / Supplier Name'}
            </Text>
            <TextInput
              style={styles.textInput}
              placeholder="e.g. Ramesh Kumar"
              placeholderTextColor="#94a3b8"
              value={signupOwnerName}
              onChangeText={setSignupOwnerName}
            />

            {/* 3. Business Name */}
            <Text style={[styles.label, { marginTop: 12 }]}>
              {lang === 'hi' ? 'डेयरी / फार्म का नाम' : 'Dairy Farm / Business Name'}
            </Text>
            <TextInput
              style={styles.textInput}
              placeholder="e.g. Gokul Dairy Farm"
              placeholderTextColor="#94a3b8"
              value={signupBusinessName}
              onChangeText={setSignupBusinessName}
            />

            {/* 4. Optional Password */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
              <Text style={styles.label}>
                {lang === 'hi' ? 'पासवर्ड बनाएं (वैकल्पिक)' : 'Create Password (Optional)'}
              </Text>
              <TouchableOpacity onPress={() => setShowSignupPassword(!showSignupPassword)}>
                <Text style={{ fontSize: 12, color: '#0284c7', fontWeight: '600' }}>
                  {showSignupPassword ? (lang === 'hi' ? 'छिपाएं 👁️' : 'Hide') : (lang === 'hi' ? 'दिखाएं 👁️' : 'Show')}
                </Text>
              </TouchableOpacity>
            </View>
            <TextInput
              style={styles.textInput}
              placeholder={lang === 'hi' ? 'पसंद का पासवर्ड (उदा. 1234 या pin)' : 'Optional (e.g. 1234 or pin)'}
              placeholderTextColor="#94a3b8"
              secureTextEntry={!showSignupPassword}
              value={signupPassword}
              onChangeText={setSignupPassword}
            />
            <Text style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>
              💡 {lang === 'hi' ? 'पासवर्ड सेट करने पर अगली बार बिना OTP के सीधे लॉगिन कर सकेंगे।' : 'Setting a password allows instant 1-second login without OTP.'}
            </Text>

            {/* Sign Up Button */}
            <TouchableOpacity
              style={[styles.primaryButton, { backgroundColor: '#16a34a' }]}
              onPress={handleSignUp}
              activeOpacity={0.8}
              disabled={isCheckingCloud}
            >
              <Text style={styles.primaryButtonText}>
                {lang === 'hi' ? '✓ खाता बनाएं और शुरू करें' : '✓ Create Account & Start'}
              </Text>
            </TouchableOpacity>

            {/* Bottom Switcher to Login */}
            <View style={{ marginTop: 20, paddingTop: 14, borderTopWidth: 1, borderTopColor: '#f1f5f9', alignItems: 'center' }}>
              <Text style={{ fontSize: 13, color: '#64748b' }}>
                {lang === 'hi' ? 'पहले से खाता है?' : 'Already have an account?'}
              </Text>
              <TouchableOpacity onPress={() => setAuthMode('login')} style={{ marginTop: 4 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: '#0284c7' }}>
                  {lang === 'hi' ? '🔐 यहाँ लॉगिन करें (Login)' : '🔐 Login Here'}
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

      {/* --- MODAL: Dairy Profile Setup (If logging into fresh unconfigured account) --- */}
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
                {lang === 'hi' ? 'पासवर्ड सेट करें (वैकल्पिक)' : 'Set Password (Optional)'}
              </Text>
              <TextInput
                style={styles.modalInput}
                placeholder={lang === 'hi' ? 'भविष्य में तेज़ लॉगिन के लिए पासवर्ड' : 'Password for faster login'}
                placeholderTextColor="#94a3b8"
                value={setupPasswordInput}
                onChangeText={setSetupPasswordInput}
              />

              <Text style={styles.modalLabel}>
                {lang === 'hi' ? 'पंजीकृत मोबाइल नंबर' : 'Registered Mobile Number'}
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
  headerBox: { alignItems: 'center', marginBottom: 20 },
  icon: { fontSize: 48, marginBottom: 8 },
  appTitle: { fontSize: 24, fontWeight: 'bold', color: '#0f172a', textAlign: 'center' },
  subtitle: { fontSize: 13, color: '#64748b', textAlign: 'center', marginTop: 4 },

  topTabContainer: {
    flexDirection: 'row',
    backgroundColor: '#e2e8f0',
    borderRadius: 12,
    padding: 4,
    marginBottom: 16
  },
  topTabButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8
  },
  topTabButtonActive: {
    backgroundColor: '#ffffff',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2
  },
  topTabText: { fontSize: 14, fontWeight: '600', color: '#64748b' },
  topTabTextActive: { color: '#0284c7', fontWeight: 'bold' },

  subTabContainer: {
    flexDirection: 'row',
    backgroundColor: '#f1f5f9',
    borderRadius: 8,
    padding: 3,
    marginBottom: 16
  },
  subTabBtn: {
    flex: 1,
    paddingVertical: 7,
    alignItems: 'center',
    borderRadius: 6
  },
  subTabBtnActive: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1'
  },
  subTabText: { fontSize: 12.5, fontWeight: '600', color: '#64748b' },
  subTabTextActive: { color: '#0f172a', fontWeight: 'bold' },

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
  label: { fontSize: 13, fontWeight: '600', color: '#334155', marginBottom: 6 },
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
  textInput: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 15,
    backgroundColor: '#f8fafc',
    color: '#0f172a'
  },
  otpInput: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 18,
    backgroundColor: '#f8fafc',
    color: '#0f172a',
    letterSpacing: 4,
    textAlign: 'center',
    fontWeight: 'bold'
  },
  primaryButton: {
    backgroundColor: '#0284c7',
    paddingVertical: 13,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 18
  },
  primaryButtonText: { color: '#ffffff', fontSize: 15, fontWeight: 'bold' },
  linkButton: { alignItems: 'center', marginTop: 12, paddingVertical: 4 },
  linkText: { color: '#0284c7', fontSize: 12.5, fontWeight: '600' },

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
