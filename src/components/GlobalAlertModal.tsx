import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  TouchableWithoutFeedback
} from 'react-native';
import { registerDialogListener, DialogConfig } from '../utils/alertUtils';

export const GlobalAlertModal: React.FC = () => {
  const [config, setConfig] = useState<DialogConfig | null>(null);

  useEffect(() => {
    const unregister = registerDialogListener(setConfig);
    return unregister;
  }, []);

  if (!config) return null;

  const isDeleteOrDestructive =
    config.isDestructive !== false &&
    (config.isDestructive === true ||
      config.title.toLowerCase().includes('delete') ||
      config.title.toLowerCase().includes('remove') ||
      config.title.toLowerCase().includes('reset') ||
      config.title.includes('हटाएं') ||
      config.title.includes('मिटाएं') ||
      config.title.includes('रीसेट'));

  const getIcon = () => {
    if (config.icon) return config.icon;
    const lowerTitle = config.title.toLowerCase();
    if (lowerTitle.includes('delete') || lowerTitle.includes('remove') || config.title.includes('हटाएं')) return '🗑️';
    if (lowerTitle.includes('reset') || lowerTitle.includes('clear') || config.title.includes('रीसेट')) return '⚠️';
    if (lowerTitle.includes('cloud') || lowerTitle.includes('restore') || config.title.includes('रिस्टोर')) return '☁️';
    if (lowerTitle.includes('success') || lowerTitle.includes('complete') || lowerTitle.includes('saved')) return '✅';
    if (lowerTitle.includes('mark all') || lowerTitle.includes('delivery')) return '📋';
    return 'ℹ️';
  };

  const handleConfirm = async () => {
    const cb = config.onConfirm;
    setConfig(null);
    if (cb) {
      try {
        await cb();
      } catch (err) {
        console.error('Error executing confirm callback:', err);
      }
    }
  };

  const handleCancel = () => {
    const cb = config.onCancel;
    setConfig(null);
    if (cb) {
      cb();
    }
  };

  // Format message lines (distinguish normal paragraph vs bullet points)
  const lines = config.message ? config.message.split('\n').map(l => l.trim()).filter(Boolean) : [];
  const bulletLines = lines.filter(l => l.startsWith('•') || l.startsWith('-'));
  const headerLines = lines.filter(l => !l.startsWith('•') && !l.startsWith('-'));

  return (
    <Modal
      visible={true}
      transparent
      animationType="fade"
      onRequestClose={handleCancel}
    >
      <TouchableWithoutFeedback onPress={handleCancel}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback>
            <View style={styles.dialogCard}>
              {/* Header Icon */}
              <View style={[styles.iconBox, isDeleteOrDestructive ? styles.iconBoxDanger : styles.iconBoxPrimary]}>
                <Text style={styles.iconText}>{getIcon()}</Text>
              </View>

              {/* Title */}
              <Text style={styles.titleText}>{config.title}</Text>

              {/* Message Content */}
              <ScrollView style={styles.messageScroll} bounces={false}>
                {headerLines.map((line, idx) => (
                  <Text key={`hdr_${idx}`} style={styles.messageText}>
                    {line}
                  </Text>
                ))}

                {bulletLines.length > 0 && (
                  <View style={styles.detailBox}>
                    {bulletLines.map((bLine, idx) => (
                      <View key={`bl_${idx}`} style={styles.bulletRow}>
                        <Text style={styles.bulletDot}>●</Text>
                        <Text style={styles.bulletText}>{bLine.replace(/^[•-]\s*/, '')}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </ScrollView>

              {/* Action Buttons */}
              <View style={styles.btnRow}>
                {config.type === 'confirm' && (
                  <TouchableOpacity
                    style={styles.cancelBtn}
                    onPress={handleCancel}
                    activeOpacity={0.7}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Text style={styles.cancelBtnText}>{config.cancelText || 'Cancel (रद्द करें)'}</Text>
                  </TouchableOpacity>
                )}

                <TouchableOpacity
                  style={[
                    styles.confirmBtn,
                    isDeleteOrDestructive ? styles.confirmBtnDanger : styles.confirmBtnPrimary,
                    config.type === 'alert' && { flex: 1 }
                  ]}
                  onPress={handleConfirm}
                  activeOpacity={0.8}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={styles.confirmBtnText}>
                    {config.confirmText || (config.type === 'alert' ? 'ठीक है (OK)' : 'OK')}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20
  },
  dialogCard: {
    backgroundColor: '#ffffff',
    borderRadius: 22,
    padding: 22,
    width: '100%',
    maxWidth: 420,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 10
  },
  iconBox: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14
  },
  iconBoxDanger: {
    backgroundColor: '#fee2e2',
    borderWidth: 2,
    borderColor: '#fecaca'
  },
  iconBoxPrimary: {
    backgroundColor: '#e0f2fe',
    borderWidth: 2,
    borderColor: '#bae6fd'
  },
  iconText: {
    fontSize: 26
  },
  titleText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#0f172a',
    textAlign: 'center',
    marginBottom: 10
  },
  messageScroll: {
    maxHeight: 260,
    width: '100%',
    marginBottom: 18
  },
  messageText: {
    fontSize: 14,
    color: '#334155',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 6
  },
  detailBox: {
    backgroundColor: '#f8fafc',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginTop: 8,
    width: '100%'
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginVertical: 4
  },
  bulletDot: {
    fontSize: 10,
    color: '#0284c7',
    marginRight: 8,
    marginTop: 4
  },
  bulletText: {
    flex: 1,
    fontSize: 13,
    color: '#1e293b',
    lineHeight: 18,
    fontWeight: '500'
  },
  btnRow: {
    flexDirection: 'row',
    gap: 12,
    width: '100%'
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 12,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#cbd5e1'
  },
  cancelBtnText: {
    color: '#475569',
    fontSize: 14,
    fontWeight: '600'
  },
  confirmBtn: {
    flex: 1.2,
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3
  },
  confirmBtnDanger: {
    backgroundColor: '#dc2626'
  },
  confirmBtnPrimary: {
    backgroundColor: '#0284c7'
  },
  confirmBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: 'bold'
  }
});
