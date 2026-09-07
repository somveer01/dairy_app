import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text } from 'react-native';
import { DashboardScreen } from '../screens/dashboard/DashboardScreen';
import { DailyRegisterScreen } from '../screens/register/DailyRegisterScreen';
import { CustomerListScreen } from '../screens/customers/CustomerListScreen';
import { DueReportsScreen } from '../screens/reports/DueReportsScreen';
import { SettingsScreen } from '../screens/settings/SettingsScreen';
import { useApp } from '../context/AppContext';

const Tab = createBottomTabNavigator();

export const AppNavigator = () => {
  const { t } = useApp();

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: true,
        tabBarActiveTintColor: '#0284c7',
        tabBarInactiveTintColor: '#94a3b8',
        tabBarStyle: { height: 60, paddingBottom: 8, paddingTop: 6 }
      }}
    >
      <Tab.Screen
        name="DashboardTab"
        component={DashboardScreen}
        options={{
          title: t.dashboard,
          tabBarLabel: t.dashboard,
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 20 }}>🏠</Text>
        }}
      />
      <Tab.Screen
        name="RegisterTab"
        component={DailyRegisterScreen}
        options={{
          title: t.register,
          tabBarLabel: t.register,
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 20 }}>📋</Text>
        }}
      />
      <Tab.Screen
        name="CustomersTab"
        component={CustomerListScreen}
        options={{
          title: t.customers,
          tabBarLabel: t.customers,
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 20 }}>👥</Text>
        }}
      />
      <Tab.Screen
        name="ReportsTab"
        component={DueReportsScreen}
        options={{
          title: t.reports,
          tabBarLabel: t.reports,
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 20 }}>📊</Text>
        }}
      />
      <Tab.Screen
        name="SettingsTab"
        component={SettingsScreen}
        options={{
          title: t.settings,
          tabBarLabel: t.settings,
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 20 }}>⚙️</Text>
        }}
      />
    </Tab.Navigator>
  );
};
