import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  Platform
} from 'react-native';

interface InstallAppModalProps {
  visible: boolean;
  onClose: () => void;
}

export const InstallAppModal: React.FC<InstallAppModalProps> = ({ visible, onClose }) => {
  const [activeTab, setActiveTab] = useState<'android' | 'ios'>('android');

  const handleNativePrompt = () => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const prompt = (window as any).pwaDeferredPrompt;
      if (prompt) {
        prompt.prompt();
        prompt.userChoice.then((choice: any) => {
          if (choice.outcome === 'accepted') {
            onClose();
          }
          (window as any).pwaDeferredPrompt = null;
        });
        return;
      }
    }
  };

  const hasDeferredPrompt = Platform.OS === 'web' && typeof window !== 'undefined' && !!(window as any).pwaDeferredPrompt;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.content}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerIconBox}>
              <Text style={styles.headerIcon}>📲</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Install Dairy App on Phone</Text>
              <Text style={styles.subtitle}>फोन पर ऐप इंस्टॉल करें (1-टैप में खोलें)</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Direct 1-Click Install Button if browser supports beforeinstallprompt */}
          {hasDeferredPrompt && (
            <TouchableOpacity style={styles.instantInstallBtn} onPress={handleNativePrompt} activeOpacity={0.8}>
              <Text style={styles.instantInstallText}>⚡ 1-Click Direct Install (तुरंत इंस्टॉल करें)</Text>
            </TouchableOpacity>
          )}

          {/* OS Switcher Tabs */}
          <View style={styles.tabsRow}>
            <TouchableOpacity
              style={[styles.tabBtn, activeTab === 'android' && styles.tabBtnActive]}
              onPress={() => setActiveTab('android')}
              activeOpacity={0.7}
            >
              <Text style={[styles.tabBtnText, activeTab === 'android' && styles.tabBtnTextActive]}>
                🤖 Android (Chrome)
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tabBtn, activeTab === 'ios' && styles.tabBtnActive]}
              onPress={() => setActiveTab('ios')}
              activeOpacity={0.7}
            >
              <Text style={[styles.tabBtnText, activeTab === 'ios' && styles.tabBtnTextActive]}>
                🍎 iPhone / iPad (Safari)
              </Text>
            </TouchableOpacity>
          </View>

          {/* Step-by-Step Instructions */}
          <ScrollView style={styles.stepsContainer} showsVerticalScrollIndicator={false}>
            {activeTab === 'android' ? (
              <View>
                <View style={styles.stepItem}>
                  <View style={styles.stepBadge}><Text style={styles.stepBadgeText}>1</Text></View>
                  <View style={styles.stepInfo}>
                    <Text style={styles.stepTitle}>Tap Chrome Menu (3 Dots ⋮)</Text>
                    <Text style={styles.stepDesc}>
                      अपने Chrome ब्राउज़र के ऊपर दाईं ओर 3 बिंदु (⋮) पर टैप करें।
                    </Text>
                  </View>
                </View>

                <View style={styles.stepItem}>
                  <View style={styles.stepBadge}><Text style={styles.stepBadgeText}>2</Text></View>
                  <View style={styles.stepInfo}>
                    <Text style={styles.stepTitle}>Select "Install App" or "Add to Home screen"</Text>
                    <Text style={styles.stepDesc}>
                      मेन्यू में <Text style={styles.bold}>"Install app"</Text> या <Text style={styles.bold}>"Add to Home screen"</Text> (होम स्क्रीन पर जोड़ें) चुनें।
                    </Text>
                  </View>
                </View>

                <View style={styles.stepItem}>
                  <View style={styles.stepBadge}><Text style={styles.stepBadgeText}>3</Text></View>
                  <View style={styles.stepInfo}>
                    <Text style={styles.stepTitle}>Confirm "Install" (कन्फर्म करें)</Text>
                    <Text style={styles.stepDesc}>
                      पॉपअप में Install पर टैप करें। Dairy App का आइकॉन सीधे आपकी मोबाइल स्क्रीन पर आ जाएगा और बिना इंटरनेट भी काम करेगा!
                    </Text>
                  </View>
                </View>
              </View>
            ) : (
              <View>
                <View style={styles.stepItem}>
                  <View style={styles.stepBadge}><Text style={styles.stepBadgeText}>1</Text></View>
                  <View style={styles.stepInfo}>
                    <Text style={styles.stepTitle}>Tap Share Button (⎋)</Text>
                    <Text style={styles.stepDesc}>
                      Safari ब्राउज़र में नीचे बीच में मौजूद <Text style={styles.bold}>Share आइकॉन (⎋)</Text> पर टैप करें।
                    </Text>
                  </View>
                </View>

                <View style={styles.stepItem}>
                  <View style={styles.stepBadge}><Text style={styles.stepBadgeText}>2</Text></View>
                  <View style={styles.stepInfo}>
                    <Text style={styles.stepTitle}>Tap "Add to Home Screen" (+)</Text>
                    <Text style={styles.stepDesc}>
                      नीचे स्क्रॉल करें और <Text style={styles.bold}>"Add to Home Screen"</Text> (होम स्क्रीन पर जोड़ें) पर टैप करें।
                    </Text>
                  </View>
                </View>

                <View style={styles.stepItem}>
                  <View style={styles.stepBadge}><Text style={styles.stepBadgeText}>3</Text></View>
                  <View style={styles.stepInfo}>
                    <Text style={styles.stepTitle}>Tap "Add" at Top Right (जोड़ें)</Text>
                    <Text style={styles.stepDesc}>
                      ऊपर दाईं ओर "Add" बटन पर टैप करें। ऐप आपके iPhone की स्क्रीन पर इंस्टॉल हो जाएगा!
                    </Text>
                  </View>
                </View>
              </View>
            )}

            <View style={styles.benefitBox}>
              <Text style={styles.benefitTitle}>✨ Benefits of Installing (इंस्टॉल करने के फायदे):</Text>
              <Text style={styles.benefitText}>• Works completely offline without internet (बिना इंटरनेट भी चलेगा)</Text>
              <Text style={styles.benefitText}>• Full screen experience like native app (असली ऐप की तरह फुल स्क्रीन)</Text>
              <Text style={styles.benefitText}>• Fast 1-tap launch from phone screen (होम स्क्रीन से 1-टैप में चालू)</Text>
            </View>
          </ScrollView>

          {/* Footer Action */}
          <View style={styles.footer}>
            <TouchableOpacity style={styles.gotItBtn} onPress={onClose} activeOpacity={0.8}>
              <Text style={styles.gotItBtnText}>समझ गया / Got It ✓</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    padding: 16
  },
  content: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 20,
    maxHeight: '90%',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 10
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
    gap: 12
  },
  headerIconBox: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#e0f2fe',
    alignItems: 'center',
    justifyContent: 'center'
  },
  headerIcon: {
    fontSize: 24
  },
  title: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#0f172a'
  },
  subtitle: {
    fontSize: 12,
    color: '#0284c7',
    fontWeight: '600',
    marginTop: 2
  },
  closeBtn: {
    padding: 6,
    borderRadius: 16,
    backgroundColor: '#f1f5f9'
  },
  closeBtnText: {
    fontSize: 16,
    color: '#64748b',
    fontWeight: 'bold'
  },
  instantInstallBtn: {
    backgroundColor: '#16a34a',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 14,
    shadowColor: '#16a34a',
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 3
  },
  instantInstallText: {
    color: '#ffffff',
    fontWeight: 'bold',
    fontSize: 14
  },
  tabsRow: {
    flexDirection: 'row',
    backgroundColor: '#f1f5f9',
    borderRadius: 12,
    padding: 4,
    marginBottom: 16
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 9,
    alignItems: 'center'
  },
  tabBtnActive: {
    backgroundColor: '#ffffff',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2
  },
  tabBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748b'
  },
  tabBtnTextActive: {
    color: '#0284c7',
    fontWeight: 'bold'
  },
  stepsContainer: {
    maxHeight: 280,
    marginBottom: 14
  },
  stepItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 14,
    gap: 12
  },
  stepBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#0284c7',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2
  },
  stepBadgeText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: 'bold'
  },
  stepInfo: {
    flex: 1
  },
  stepTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#1e293b',
    marginBottom: 2
  },
  stepDesc: {
    fontSize: 12,
    color: '#475569',
    lineHeight: 18
  },
  bold: {
    fontWeight: 'bold',
    color: '#0284c7'
  },
  benefitBox: {
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginTop: 6
  },
  benefitTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#334155',
    marginBottom: 6
  },
  benefitText: {
    fontSize: 11,
    color: '#64748b',
    lineHeight: 16,
    marginBottom: 2
  },
  footer: {
    marginTop: 6
  },
  gotItBtn: {
    backgroundColor: '#0284c7',
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: 'center'
  },
  gotItBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: 'bold'
  }
});
