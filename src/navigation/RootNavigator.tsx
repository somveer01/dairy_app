import React from 'react';
import { View, ActivityIndicator } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { AppNavigator } from './AppNavigator';
import { LoginScreen } from '../screens/auth/LoginScreen';
import { useApp } from '../context/AppContext';

const Stack = createNativeStackNavigator();

export const RootNavigator = () => {
  const { supplier, isLoading } = useApp();

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f8fafc' }}>
        <ActivityIndicator size="large" color="#0284c7" />
      </View>
    );
  }

  const isFullyAuthenticated = Boolean(
    supplier && supplier.id && supplier.phone && supplier.phone.length >= 10
  );

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {!isFullyAuthenticated ? (
          <Stack.Screen name="Login" component={LoginScreen} />
        ) : (
          <Stack.Screen name="MainApp" component={AppNavigator} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
};
