import React from 'react';
import { View, ActivityIndicator, Modal } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { AppNavigator } from './AppNavigator';
import { LoginScreen } from '../screens/auth/LoginScreen';
import { useApp } from '../context/AppContext';

const Stack = createNativeStackNavigator();

export const RootNavigator = () => {
  const { isLoading, isAuthModalVisible, closeAuthModal } = useApp();

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f8fafc' }}>
        <ActivityIndicator size="large" color="#0284c7" />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="MainApp" component={AppNavigator} />
        <Stack.Screen name="Login" component={LoginScreen} options={{ presentation: 'modal' }} />
      </Stack.Navigator>

      {/* Global Auth Modal for Seamless Entry-gated Action Verification */}
      <Modal
        visible={isAuthModalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={closeAuthModal}
      >
        <LoginScreen onClose={closeAuthModal} />
      </Modal>
    </NavigationContainer>
  );
};

