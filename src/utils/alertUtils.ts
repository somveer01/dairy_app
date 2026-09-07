import { Alert, Platform } from 'react-native';

export const confirmAction = (
  title: string,
  message: string,
  onConfirm: () => void | Promise<void>,
  confirmText = 'OK',
  cancelText = 'Cancel'
) => {
  if (Platform.OS === 'web') {
    const fullMessage = title ? `${title}\n\n${message}` : message;
    const confirmed = typeof window !== 'undefined' ? window.confirm(fullMessage) : true;
    if (confirmed) {
      void onConfirm();
    }
  } else {
    Alert.alert(title, message, [
      { text: cancelText, style: 'cancel' },
      { text: confirmText, style: 'destructive', onPress: onConfirm }
    ]);
  }
};

export const showAlert = (title: string, message?: string) => {
  if (Platform.OS === 'web') {
    const fullMessage = title && message ? `${title}\n\n${message}` : (title || message || '');
    if (typeof window !== 'undefined') {
      window.alert(fullMessage);
    }
  } else {
    Alert.alert(title, message);
  }
};
