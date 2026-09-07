import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as ScreenCapture from 'expo-screen-capture';
import { AppProvider } from './src/context/AppContext';
import { RootNavigator } from './src/navigation/RootNavigator';

export default function App() {
  useEffect(() => {
    // Explicitly unblock screenshot taking across Android and iOS devices
    if (Platform.OS !== 'web') {
      ScreenCapture.allowScreenCaptureAsync().catch(() => {});
    }
  }, []);

  return (
    <SafeAreaProvider>
      <AppProvider>
        <StatusBar style="auto" />
        <RootNavigator />
      </AppProvider>
    </SafeAreaProvider>
  );
}
