import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { AppNavigator } from './AppNavigator';
import { LoginScreen } from '../screens/auth/LoginScreen';
import { useApp } from '../context/AppContext';

const Stack = createNativeStackNavigator();

export const RootNavigator = () => {
  const { supplier } = useApp();

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {!supplier ? (
          <Stack.Screen name="Login" component={LoginScreen} />
        ) : (
          <Stack.Screen name="MainApp" component={AppNavigator} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
};
