import { Alert } from 'react-native';

export type DialogType = 'confirm' | 'alert';

export interface DialogConfig {
  type: DialogType;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  isDestructive?: boolean;
  icon?: string;
  onConfirm?: () => void | Promise<void>;
  onCancel?: () => void;
}

let activeListener: ((config: DialogConfig | null) => void) | null = null;

export const registerDialogListener = (listener: (config: DialogConfig | null) => void) => {
  activeListener = listener;
  return () => {
    if (activeListener === listener) {
      activeListener = null;
    }
  };
};

export const confirmAction = (
  title: string,
  message: string,
  onConfirm: () => void | Promise<void>,
  confirmText = 'हटाएं (Delete)',
  cancelText = 'रद्द करें (Cancel)',
  isDestructive = true
) => {
  if (activeListener) {
    activeListener({
      type: 'confirm',
      title,
      message,
      confirmText,
      cancelText,
      isDestructive,
      onConfirm
    });
  } else {
    Alert.alert(title, message, [
      { text: cancelText, style: 'cancel' },
      { text: confirmText, style: isDestructive ? 'destructive' : 'default', onPress: onConfirm }
    ]);
  }
};

export const showAlert = (title: string, message?: string) => {
  if (activeListener) {
    activeListener({
      type: 'alert',
      title,
      message: message || '',
      confirmText: 'ठीक है (OK)'
    });
  } else {
    Alert.alert(title, message);
  }
};
