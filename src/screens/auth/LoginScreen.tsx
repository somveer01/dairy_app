import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Keyboard
} from 'react-native';
import { useApp } from '../../context/AppContext';
import { StorageService } from '../../services/storageService';

export const LoginScreen = ({ navigation }: any) => {
  const { t, setSupplier } = useApp();
  const [loginMethod, setLoginMethod] = useState<'phone' | 'email'>('phone');
  
  // Phone OTP state
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);

  // Email state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSendOtp = () => {
    Keyboard.dismiss();
    if (!phone || phone.length < 10) {
      Alert.alert('Invalid Phone', 'Please enter a valid 10-digit mobile number.');
      return;
    }
    setOtpSent(true);
    Alert.alert('OTP Sent', `Verification code sent to +91 ${phone}.\n(Use test OTP: 123456)`);
  };

  const handleVerifyOtp = async () => {
    Keyboard.dismiss();
    if (otp === '123456' || otp.length === 6) {
      const user = {
        id: 'supp_' + phone,
        name: 'Dairy Supplier (' + phone.slice(-4) + ')',
        phone: phone,
        businessName: 'Krishna Fresh Dairy',
        createdAt: Date.now()
      };
      await StorageService.saveSupplier(user);
      setSupplier(user);
    } else {
      Alert.alert('Invalid OTP', 'Please enter a valid 6-digit OTP code.');
    }
  };

  const handleEmailLogin = async () => {
    Keyboard.dismiss();
    if (!email || !password) {
      Alert.alert('Error', 'Please enter email and password.');
      return;
    }
    const user = {
      id: 'supp_email_' + Date.now(),
      name: email.split('@')[0],
      phone: '9876543210',
      email: email,
      businessName: 'Shree Dairy Farm',
      createdAt: Date.now()
    };
    await StorageService.saveSupplier(user);
    setSupplier(user);
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
          <Text style={styles.subtitle}>Dairy Management & Milk Due Register</Text>
        </View>

        {/* Tab Switcher: Phone vs Email */}
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
            style={[styles.tabButton, loginMethod === 'email' && styles.tabButtonActive]}
            onPress={() => setLoginMethod('email')}
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={[styles.tabText, loginMethod === 'email' && styles.tabTextActive]}>
              ✉️ Email & Pass
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.formCard}>
          {loginMethod === 'phone' ? (
            <>
              <Text style={styles.label}>Mobile Number (+91)</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter 10-digit mobile number"
                placeholderTextColor="#94a3b8"
                keyboardType="phone-pad"
                maxLength={10}
                value={phone}
                onChangeText={setPhone}
              />

              {otpSent ? (
                <>
                  <Text style={styles.label}>Enter 6-digit OTP</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g. 123456"
                    placeholderTextColor="#94a3b8"
                    keyboardType="number-pad"
                    maxLength={6}
                    value={otp}
                    onChangeText={setOtp}
                  />
                  <TouchableOpacity
                    style={styles.primaryButton}
                    onPress={handleVerifyOtp}
                    activeOpacity={0.8}
                    hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                  >
                    <Text style={styles.primaryButtonText}>Verify OTP & Login</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setOtpSent(false)}
                    style={styles.linkButton}
                    activeOpacity={0.7}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Text style={styles.linkText}>Change Phone Number</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <TouchableOpacity
                  style={styles.primaryButton}
                  onPress={handleSendOtp}
                  activeOpacity={0.8}
                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                >
                  <Text style={styles.primaryButtonText}>Send OTP via SMS</Text>
                </TouchableOpacity>
              )}
            </>
          ) : (
            <>
              <Text style={styles.label}>Email Address</Text>
              <TextInput
                style={styles.input}
                placeholder="supplier@example.com"
                placeholderTextColor="#94a3b8"
                keyboardType="email-address"
                autoCapitalize="none"
                value={email}
                onChangeText={setEmail}
              />

              <Text style={styles.label}>Password</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter your password"
                placeholderTextColor="#94a3b8"
                secureTextEntry
                value={password}
                onChangeText={setPassword}
              />

              <TouchableOpacity
                style={styles.primaryButton}
                onPress={handleEmailLogin}
                activeOpacity={0.8}
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              >
                <Text style={styles.primaryButtonText}>Sign In</Text>
              </TouchableOpacity>
            </>
          )}
        </View>

        <View style={styles.footerNote}>
          <Text style={styles.footerText}>Designed for independent milk sellers & dairies</Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f7fb' },
  scrollContent: { padding: 20, justifyContent: 'center', minHeight: '100%' },
  headerBox: { alignItems: 'center', marginBottom: 24 },
  icon: { fontSize: 52, marginBottom: 8 },
  appTitle: { fontSize: 24, fontWeight: 'bold', color: '#1a365d' },
  subtitle: { fontSize: 13, color: '#64748b', marginTop: 4 },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#e2e8f0',
    borderRadius: 12,
    padding: 4,
    marginBottom: 16
  },
  tabButton: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 8
  },
  tabButtonActive: {
    backgroundColor: '#ffffff',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2
  },
  tabText: { fontSize: 14, color: '#64748b', fontWeight: '500' },
  tabTextActive: { color: '#0284c7', fontWeight: 'bold' },
  formCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 18,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3
  },
  label: { fontSize: 13, fontWeight: '600', color: '#334155', marginBottom: 6, marginTop: 10 },
  input: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    backgroundColor: '#f8fafc',
    color: '#0f172a'
  },
  primaryButton: {
    backgroundColor: '#0284c7',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 20
  },
  primaryButtonText: { color: '#ffffff', fontSize: 16, fontWeight: 'bold' },
  linkButton: { alignItems: 'center', marginTop: 14, paddingVertical: 6 },
  linkText: { color: '#0284c7', fontSize: 13, fontWeight: '500' },
  footerNote: { alignItems: 'center', marginTop: 24 },
  footerText: { fontSize: 12, color: '#94a3b8' }
});
