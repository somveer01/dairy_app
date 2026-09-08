import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text, View, StyleSheet, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DashboardScreen } from '../screens/dashboard/DashboardScreen';
import { DailyRegisterScreen } from '../screens/register/DailyRegisterScreen';
import { CustomerListScreen } from '../screens/customers/CustomerListScreen';
import { DueReportsScreen } from '../screens/reports/DueReportsScreen';
import { SettingsScreen } from '../screens/settings/SettingsScreen';
import { useApp } from '../context/AppContext';

const Tab = createBottomTabNavigator();

export const AppNavigator = () => {
  const { t, lang } = useApp();
  const insets = useSafeAreaInsets();

  // Calculate safe bottom padding ensuring plenty of vertical space for both icon AND full caption label
  const safeBottom = insets.bottom > 0 ? insets.bottom : (Platform.OS === 'ios' ? 8 : 6);
  const barHeight = Platform.OS === 'ios' ? (62 + insets.bottom) : 66;

  const renderTabIcon = (emoji: string, focused: boolean) => (
    <View style={[styles.tabIconWrap, focused && styles.tabIconWrapActive]}>
      <Text style={styles.tabIconEmoji}>{emoji}</Text>
    </View>
  );

  return (
    <Tab.Navigator
      key={lang}
      screenOptions={{

        headerShown: true,
        headerStyle: {
          backgroundColor: '#ffffff',
          elevation: 2,
          shadowColor: '#000',
          shadowOpacity: 0.05,
          shadowRadius: 3,
          shadowOffset: { width: 0, height: 1 }
        },
        headerTitleStyle: {
          fontWeight: '700',
          fontSize: 17,
          color: '#0f172a'
        },
        headerTitleAlign: 'center',
        tabBarActiveTintColor: '#0284c7',
        tabBarInactiveTintColor: '#64748b',
        tabBarHideOnKeyboard: true,
        tabBarAllowFontScaling: false,
        tabBarStyle: {
          height: barHeight,
          paddingTop: 4,
          paddingBottom: safeBottom,
          backgroundColor: '#ffffff',
          borderTopWidth: 1,
          borderTopColor: '#e2e8f0',
          elevation: 10,
          shadowColor: '#000',
          shadowOpacity: 0.08,
          shadowRadius: 6,
          shadowOffset: { width: 0, height: -3 }
        },
        tabBarItemStyle: {
          paddingVertical: 2,
          paddingHorizontal: 0,
          justifyContent: 'center',
          alignItems: 'center'
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
          letterSpacing: -0.2,
          marginTop: 2,
          lineHeight: 14
        }
      }}
    >
      <Tab.Screen
        name="DashboardTab"
        component={DashboardScreen}
        options={{
          title: t.dashboard,
          tabBarLabel: t.tabDashboard,
          tabBarIcon: ({ focused }) => renderTabIcon('🏠', focused)
        }}
      />
      <Tab.Screen
        name="RegisterTab"
        component={DailyRegisterScreen}
        options={{
          title: t.register,
          tabBarLabel: t.tabRegister,
          tabBarIcon: ({ focused }) => renderTabIcon('📋', focused)
        }}
      />
      <Tab.Screen
        name="CustomersTab"
        component={CustomerListScreen}
        options={{
          title: t.customers,
          tabBarLabel: t.tabCustomers,
          tabBarIcon: ({ focused }) => renderTabIcon('👥', focused)
        }}
      />
      <Tab.Screen
        name="ReportsTab"
        component={DueReportsScreen}
        options={{
          title: t.reports,
          tabBarLabel: t.tabReports,
          tabBarIcon: ({ focused }) => renderTabIcon('📊', focused)
        }}
      />
      <Tab.Screen
        name="SettingsTab"
        component={SettingsScreen}
        options={{
          title: t.settings,
          tabBarLabel: t.tabSettings,
          tabBarIcon: ({ focused }) => renderTabIcon('⚙️', focused)
        }}
      />
    </Tab.Navigator>
  );
};

const styles = StyleSheet.create({
  tabIconWrap: {
    paddingHorizontal: 10,
    height: 26,
    borderRadius: 13,
    justifyContent: 'center',
    alignItems: 'center'
  },
  tabIconWrapActive: {
    backgroundColor: '#e0f2fe'
  },
  tabIconEmoji: {
    fontSize: 17,
    lineHeight: 20
  }
});
