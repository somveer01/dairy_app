import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  Modal,
  Alert,
  Keyboard,
  ActivityIndicator
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Contacts from 'expo-contacts';
import { Contact } from 'expo-contacts';
import { useApp } from '../../context/AppContext';
import { StorageService } from '../../services/storageService';
import { Customer, MilkType } from '../../types';
import { confirmAction, showAlert } from '../../utils/alertUtils';

interface PhoneContactItem {
  id: string;
  name: string;
  phone: string;
  email?: string;
  hasPhone: boolean;
  isSelected: boolean;
}

export const CustomerListScreen = () => {
  const { t, customers, refreshCustomers, supplier } = useApp();
  const [search, setSearch] = useState('');
  const [modalVisible, setModalVisible] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);

  // Form State for Single Add / Edit
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [milkType, setMilkType] = useState<MilkType>('cow');
  const [defaultLitres, setDefaultLitres] = useState('2.0');
  const [ratePerLitre, setRatePerLitre] = useState('55');
  const [notes, setNotes] = useState('');

  // Contact Import Modal State
  const [contactModalVisible, setContactModalVisible] = useState(false);
  const [deviceContacts, setDeviceContacts] = useState<PhoneContactItem[]>([]);
  const [contactSearch, setContactSearch] = useState('');
  const [isLoadingContacts, setIsLoadingContacts] = useState(false);
  const [importMilkType, setImportMilkType] = useState<MilkType>('cow');
  const [importLitres, setImportLitres] = useState('2.0');
  const [importRate, setImportRate] = useState('55');

  const openAddModal = () => {
    Keyboard.dismiss();
    setEditingCustomer(null);
    setName('');
    setPhone('');
    setAddress('');
    setMilkType('cow');
    setDefaultLitres('2.0');
    setRatePerLitre('55');
    setNotes('');
    setModalVisible(true);
  };

  const openEditModal = (cust: Customer) => {
    Keyboard.dismiss();
    setEditingCustomer(cust);
    setName(cust.name);
    setPhone(cust.phone);
    setAddress(cust.address || '');
    setMilkType(cust.milkType);
    setDefaultLitres(cust.defaultLitres.toString());
    setRatePerLitre(cust.ratePerLitre.toString());
    setNotes(cust.notes || '');
    setModalVisible(true);
  };

  const handleSave = async () => {
    Keyboard.dismiss();
    if (!name.trim()) {
      Alert.alert('Validation Error', 'Please enter customer name.');
      return;
    }
    if (!phone.trim()) {
      Alert.alert('Validation Error', 'Please enter customer phone number.');
      return;
    }

    const litres = parseFloat(defaultLitres) || 1.0;
    const rate = parseFloat(ratePerLitre) || 50;

    const customerData: Customer = {
      id: editingCustomer ? editingCustomer.id : 'cust_' + Date.now(),
      supplierId: supplier?.id || 'supp_default',
      name: name.trim(),
      phone: phone.trim(),
      address: address.trim(),
      milkType: milkType,
      defaultLitres: litres,
      ratePerLitre: rate,
      notes: notes.trim(),
      createdAt: editingCustomer ? editingCustomer.createdAt : Date.now()
    };

    await StorageService.saveCustomer(customerData);
    await refreshCustomers();
    setModalVisible(false);
  };

  const handleDelete = (id: string, custName: string) => {
    confirmAction(
      'Delete Customer',
      `Are you sure you want to delete ${custName}?`,
      async () => {
        await StorageService.deleteCustomer(id);
        await refreshCustomers();
      },
      'Delete',
      'Cancel'
    );
  };

  // --- CONTACTS IMPORT FLOW ---
  const openContactsImportModal = async () => {
    Keyboard.dismiss();
    setIsLoadingContacts(true);
    setContactModalVisible(true);
    setContactSearch('');

    try {
      // 1. Request permission safely
      const permissionRes = await Contacts.requestPermissionsAsync();
      if (permissionRes.status !== 'granted') {
        setIsLoadingContacts(false);
        Alert.alert(
          'Permission Denied',
          'Please allow contact permissions in your phone settings to import contacts directly.'
        );
        setContactModalVisible(false);
        return;
      }

      const existingPhones = new Set(customers.map(c => c.phone.replace(/[^0-9]/g, '')));
      const validList: PhoneContactItem[] = [];

      // 2. Fetch contacts across all accounts (Device, SIM, Google, Outlook)
      // We set high limits (2000) so Google/cloud-synced contacts aren't cut off
      let contactRecords: any[] = [];
      try {
        if (typeof Contact?.getAllDetails === 'function') {
          contactRecords = await Contact.getAllDetails(
            ['givenName', 'familyName', 'fullName', 'phones', 'emails'] as any,
            { limit: 2000 }
          );
        }
      } catch (classErr) {
        console.warn('Class-based getAllDetails failed, trying legacy fallback:', classErr);
      }

      // Fallback: If getAllDetails returned empty or failed, try legacy import
      if (!contactRecords || contactRecords.length === 0) {
        try {
          const LegacyContacts = require('expo-contacts/legacy');
          if (LegacyContacts && typeof LegacyContacts.getContactsAsync === 'function') {
            const legacyRes = await LegacyContacts.getContactsAsync({
              fields: [
                LegacyContacts.Fields.PhoneNumbers,
                LegacyContacts.Fields.Name,
                LegacyContacts.Fields.FirstName,
                LegacyContacts.Fields.LastName,
                LegacyContacts.Fields.Emails
              ],
              pageSize: 2000
            });
            contactRecords = legacyRes?.data || [];
          }
        } catch (legacyErr) {
          console.warn('Legacy getContactsAsync failed:', legacyErr);
        }
      }

      // 3. Process retrieved contacts across all accounts
      if (contactRecords && contactRecords.length > 0) {
        contactRecords.forEach((c: any, index: number) => {
          // A. Extract Contact Display Name
          let displayName = '';
          if (c.name && typeof c.name === 'string' && c.name.trim()) {
            displayName = c.name.trim();
          } else if (c.fullName && typeof c.fullName === 'string' && c.fullName.trim()) {
            displayName = c.fullName.trim();
          } else if (c.givenName || c.familyName) {
            displayName = `${c.givenName || ''} ${c.familyName || ''}`.trim();
          } else if (c.firstName || c.lastName) {
            displayName = `${c.firstName || ''} ${c.lastName || ''}`.trim();
          }

          // B. Extract Phone number from all phone entries
          const phones = c.phones || c.phoneNumbers || [];
          let extractedPhone = '';
          if (Array.isArray(phones)) {
            for (const p of phones) {
              const rawStr = p?.number || p?.digits || '';
              const cleanStr = rawStr.replace(/[^0-9]/g, '');
              if (cleanStr.length >= 10) {
                extractedPhone = cleanStr.slice(-10);
                break;
              } else if (cleanStr.length > 0 && !extractedPhone) {
                extractedPhone = cleanStr;
              }
            }
          }

          // C. Extract Email address (for Google/email contacts)
          const emails = c.emails || [];
          let extractedEmail = '';
          if (Array.isArray(emails) && emails.length > 0) {
            extractedEmail = emails[0]?.email || emails[0]?.address || (typeof emails[0] === 'string' ? emails[0] : '');
          }

          // Fallback name if neither first nor last name given
          if (!displayName) {
            if (extractedEmail) {
              displayName = extractedEmail.split('@')[0];
            } else if (extractedPhone) {
              displayName = `Contact ${extractedPhone}`;
            } else {
              displayName = `Contact ${index + 1}`;
            }
          }

          // Must have at least a phone number or an email
          if (extractedPhone || extractedEmail) {
            const isAlreadyCustomer = extractedPhone && existingPhones.has(extractedPhone);
            if (!isAlreadyCustomer) {
              validList.push({
                id: c.id || `contact_${index}_${Math.random().toString(36).substring(7)}`,
                name: displayName,
                phone: extractedPhone,
                email: extractedEmail,
                hasPhone: extractedPhone.length >= 10,
                isSelected: false
              });
            }
          }
        });

        // Sort alphabetically by name
        validList.sort((a, b) => a.name.localeCompare(b.name));
        setDeviceContacts(validList);
      } else {
        setDeviceContacts([]);
      }
    } catch (error: any) {
      console.warn('Contact read error:', error);
      Alert.alert(
        'Contacts Notice',
        `Unable to read contacts directly: ${error?.message || 'Permission or device restriction'}.\n\nTip: You can use the "+ Add" button to quickly add customers.`
      );
    } finally {
      setIsLoadingContacts(false);
    }
  };

  // Launch Android native contact picker for 1-tap selection across any Google account
  const handlePickFromNativeContacts = async () => {
    try {
      let picked: any = null;
      if (typeof Contact?.presentPicker === 'function') {
        picked = await (Contact as any).presentPicker();
      } else {
        const LegacyContacts = require('expo-contacts/legacy');
        if (LegacyContacts?.presentContactPickerAsync) {
          picked = await LegacyContacts.presentContactPickerAsync();
        }
      }

      if (picked) {
        let pName = picked.name || picked.fullName || `${picked.givenName || ''} ${picked.familyName || ''}`.trim() || 'New Customer';
        const phones = picked.phones || picked.phoneNumbers || [];
        let pPhone = '';
        if (Array.isArray(phones)) {
          for (const p of phones) {
            const num = (p?.number || p?.digits || '').replace(/[^0-9]/g, '');
            if (num.length >= 10) {
              pPhone = num.slice(-10);
              break;
            }
          }
        }

        // Close contact modal and open Add modal prefilled
        setContactModalVisible(false);
        setEditingCustomer(null);
        setName(pName);
        setPhone(pPhone);
        setAddress('');
        setMilkType('cow');
        setDefaultLitres('2.0');
        setRatePerLitre('55');
        setNotes('Picked from phone contacts');
        setModalVisible(true);
      }
    } catch (pickerErr: any) {
      console.warn('Native picker error:', pickerErr);
      Alert.alert('Notice', 'Could not open native contact picker.');
    }
  };

  // Toggle selection for a contact item
  const toggleContactSelection = (contactId: string) => {
    setDeviceContacts(prev =>
      prev.map(c => (c.id === contactId ? { ...c, isSelected: !c.isSelected } : c))
    );
  };

  // Select all or deselect all
  const toggleSelectAllContacts = () => {
    const hasUnselected = deviceContacts.some(c => !c.isSelected);
    setDeviceContacts(prev => prev.map(c => ({ ...c, isSelected: hasUnselected })));
  };

  // Import selected contacts in batch
  const handleImportSelected = async () => {
    const selected = deviceContacts.filter(c => c.isSelected);
    if (selected.length === 0) {
      Alert.alert('No Selection', 'Please select at least one contact to import.');
      return;
    }

    const litres = parseFloat(importLitres) || 2.0;
    const rate = parseFloat(importRate) || (importMilkType === 'cow' ? 55 : 70);

    const newCustomers: Customer[] = selected.map((c, idx) => ({
      id: `cust_contact_${Date.now()}_${idx}`,
      supplierId: supplier?.id || 'supp_default',
      name: c.name,
      phone: c.phone || '9876500000',
      address: c.email ? `Email: ${c.email}` : '',
      milkType: importMilkType,
      defaultLitres: litres,
      ratePerLitre: rate,
      notes: c.email ? `Google contact: ${c.email}` : 'Imported from phone contacts',
      createdAt: Date.now()
    }));

    await StorageService.saveCustomersBatch(newCustomers);
    await refreshCustomers();
    setContactModalVisible(false);
    Alert.alert('Success', `Successfully imported ${selected.length} customer(s) from contacts!`);
  };

  const filteredCustomers = customers.filter(
    c =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.phone.includes(search) ||
      (c.address && c.address.toLowerCase().includes(search.toLowerCase()))
  );

  const filteredPhoneContacts = deviceContacts.filter(
    c =>
      c.name.toLowerCase().includes(contactSearch.toLowerCase()) ||
      c.phone.includes(contactSearch) ||
      (c.email && c.email.toLowerCase().includes(contactSearch.toLowerCase()))
  );

  const selectedCount = deviceContacts.filter(c => c.isSelected).length;

  return (
    <SafeAreaView style={styles.safeArea} edges={['left', 'right']}>
      <View style={styles.container}>
        {/* Search Bar & Add / Import Buttons */}
        <View style={styles.topBar}>
          <TextInput
            style={styles.searchInput}
            placeholder={t.searchCustomers}
            placeholderTextColor="#94a3b8"
            value={search}
            onChangeText={setSearch}
          />
          <TouchableOpacity
            style={styles.contactImportBtn}
            onPress={openContactsImportModal}
            activeOpacity={0.8}
            hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
          >
            <Text style={styles.contactImportBtnText}>📱 Contacts</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.addButton}
            onPress={openAddModal}
            activeOpacity={0.8}
            hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
          >
            <Text style={styles.addButtonText}>+ Add</Text>
          </TouchableOpacity>
        </View>

        {/* Customer List */}
        <FlatList
          data={filteredCustomers}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="always"
          keyboardDismissMode="on-drag"
          initialNumToRender={15}
          maxToRenderPerBatch={20}
          windowSize={10}
          removeClippedSubviews={true}
          renderItem={({ item, index }) => (
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={{ flex: 1, marginRight: 8 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Text style={styles.indexNum}>{index + 1}. </Text>
                    <Text style={styles.customerName}>{item.name}</Text>
                  </View>
                  <Text style={styles.customerPhone}>📞 {item.phone}</Text>
                  {item.address ? <Text style={styles.customerAddress} numberOfLines={1}>📍 {item.address}</Text> : null}
                </View>
                <View style={[styles.milkTypeBadge, item.milkType === 'cow' ? styles.cowBadge : styles.buffaloBadge]}>
                  <Text style={styles.milkTypeText}>
                    {item.milkType === 'cow' ? '🐄 Cow' : '🐃 Buffalo'}
                  </Text>
                </View>
              </View>

              <View style={styles.detailsRow}>
                <View style={styles.detailBox}>
                  <Text style={styles.detailLabel}>{t.defaultLitres}</Text>
                  <Text style={styles.detailValue}>{item.defaultLitres} L</Text>
                </View>
                <View style={styles.detailBox}>
                  <Text style={styles.detailLabel}>{t.ratePerLitre}</Text>
                  <Text style={styles.detailValue}>₹{item.ratePerLitre}</Text>
                </View>
                <View style={styles.detailBox}>
                  <Text style={styles.detailLabel}>Daily Est.</Text>
                  <Text style={[styles.detailValue, { color: '#059669' }]}>
                    ₹{(item.defaultLitres * item.ratePerLitre).toFixed(0)}
                  </Text>
                </View>
              </View>

              <View style={styles.actionsRow}>
                <TouchableOpacity
                  style={styles.editBtn}
                  onPress={() => openEditModal(item)}
                  activeOpacity={0.7}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={styles.editBtnText}>✏️ Edit</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.deleteBtn}
                  onPress={() => handleDelete(item.id, item.name)}
                  activeOpacity={0.7}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={styles.deleteBtnText}>🗑️ Delete</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyEmoji}>👥</Text>
              <Text style={styles.emptyText}>{t.noCustomersFound}</Text>
              <TouchableOpacity
                style={styles.emptyImportBtn}
                onPress={openContactsImportModal}
              >
                <Text style={styles.emptyImportBtnText}>📱 Import from Contacts</Text>
              </TouchableOpacity>
            </View>
          }
        />

        {/* --- CONTACTS IMPORT MODAL (MULTIPLE SELECTION) --- */}
        <Modal visible={contactModalVisible} animationType="slide" transparent>
          <View style={styles.modalOverlay}>
            <View style={styles.contactModalContent}>
              <View style={styles.contactModalHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.contactModalTitle}>Import Contacts</Text>
                  <Text style={styles.contactModalSubtitle}>
                    Select from Phone, Google & SIM contacts
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => setContactModalVisible(false)}
                  style={styles.closeBtn}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={styles.closeBtnText}>✕</Text>
                </TouchableOpacity>
              </View>

              {/* Native Android Contact App Picker Button */}
              <TouchableOpacity
                style={styles.nativePickerBtn}
                onPress={handlePickFromNativeContacts}
                activeOpacity={0.8}
              >
                <Text style={styles.nativePickerBtnText}>📱 Open Phone Contacts App (Pick Single Contact)</Text>
              </TouchableOpacity>

              {/* Account Sync Tip Banner */}
              <View style={styles.tipBanner}>
                <Text style={styles.tipText}>
                  💡 Tip: To show Google/Gmail contacts, ensure "Contacts Sync" is toggled ON in Android Settings → Accounts → Google.
                </Text>
              </View>

              {/* Default settings for imported contacts */}
              <View style={styles.importPresetBox}>
                <Text style={styles.presetHeading}>Set Default Milk for Selected:</Text>
                <View style={styles.presetRow}>
                  <TouchableOpacity
                    style={[styles.presetTypeBtn, importMilkType === 'cow' && styles.presetCowActive]}
                    onPress={() => { setImportMilkType('cow'); setImportRate('55'); }}
                  >
                    <Text style={styles.presetTypeText}>🐄 Cow (₹55)</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.presetTypeBtn, importMilkType === 'buffalo' && styles.presetBuffaloActive]}
                    onPress={() => { setImportMilkType('buffalo'); setImportRate('70'); }}
                  >
                    <Text style={styles.presetTypeText}>🐃 Buffalo (₹70)</Text>
                  </TouchableOpacity>
                  <TextInput
                    style={styles.presetQtyInput}
                    placeholder="2.0L"
                    placeholderTextColor="#94a3b8"
                    keyboardType="decimal-pad"
                    value={importLitres}
                    onChangeText={setImportLitres}
                  />
                </View>
              </View>

              {/* Search Inside Contacts & Select All */}
              <View style={styles.contactSearchRow}>
                <TextInput
                  style={styles.contactSearchInput}
                  placeholder="Search by name, phone or email..."
                  placeholderTextColor="#94a3b8"
                  value={contactSearch}
                  onChangeText={setContactSearch}
                />
                <TouchableOpacity
                  style={styles.selectAllBtn}
                  onPress={toggleSelectAllContacts}
                >
                  <Text style={styles.selectAllText}>
                    {deviceContacts.every(c => c.isSelected) ? 'Deselect All' : 'Select All'}
                  </Text>
                </TouchableOpacity>
              </View>

              {isLoadingContacts ? (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator size="large" color="#0284c7" />
                  <Text style={styles.loadingText}>Reading contacts from all accounts...</Text>
                </View>
              ) : (
                <FlatList
                  data={filteredPhoneContacts}
                  keyExtractor={item => item.id}
                  contentContainerStyle={styles.contactListContent}
                  keyboardShouldPersistTaps="always"
                  renderItem={({ item }) => (
                    <TouchableOpacity
                      style={[styles.contactItem, item.isSelected && styles.contactItemSelected]}
                      onPress={() => toggleContactSelection(item.id)}
                      activeOpacity={0.7}
                    >
                      <View style={[styles.checkbox, item.isSelected && styles.checkboxActive]}>
                        {item.isSelected && <Text style={styles.checkmarkText}>✓</Text>}
                      </View>
                      <View style={styles.contactInfo}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Text style={styles.contactName} numberOfLines={1}>{item.name}</Text>
                          {item.email && !item.hasPhone && (
                            <View style={styles.emailBadge}>
                              <Text style={styles.emailBadgeText}>Google Account</Text>
                            </View>
                          )}
                        </View>
                        <Text style={styles.contactPhone}>
                          {item.hasPhone ? `📞 +91 ${item.phone}` : `📧 ${item.email}`}
                          {item.hasPhone && item.email ? ` • ${item.email}` : ''}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  )}
                  ListEmptyComponent={
                    <View style={styles.emptyContactsBox}>
                      <Text style={styles.emptyContactsText}>
                        {contactSearch
                          ? 'No contacts match your search.'
                          : 'No contacts found. Tap "Open Phone Contacts App" above to select from your phone.'}
                      </Text>
                    </View>
                  }
                />
              )}

              {/* Bottom Import Confirmation Action */}
              <View style={styles.importActionBar}>
                <Text style={styles.selectedCountText}>
                  {selectedCount} contact{selectedCount !== 1 ? 's' : ''} selected
                </Text>
                <TouchableOpacity
                  style={[styles.importConfirmBtn, selectedCount === 0 && styles.importConfirmDisabled]}
                  onPress={handleImportSelected}
                  disabled={selectedCount === 0}
                  activeOpacity={0.8}
                >
                  <Text style={styles.importConfirmBtnText}>
                    Import ({selectedCount})
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* Add/Edit Modal */}
        <Modal visible={modalVisible} animationType="slide" transparent>
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>
                {editingCustomer ? 'Edit Customer' : 'Add New Customer'}
              </Text>

              <Text style={styles.label}>Customer Name *</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="e.g. Ramesh Kumar"
                placeholderTextColor="#94a3b8"
                value={name}
                onChangeText={setName}
              />

              <Text style={styles.label}>Phone Number (+91) *</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="10-digit mobile"
                placeholderTextColor="#94a3b8"
                keyboardType="phone-pad"
                maxLength={10}
                value={phone}
                onChangeText={setPhone}
              />

              <Text style={styles.label}>Address</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="House / Flat / Area"
                placeholderTextColor="#94a3b8"
                value={address}
                onChangeText={setAddress}
              />

              {/* Milk Type Selector: Cow vs Buffalo */}
              <Text style={styles.label}>{t.selectMilkType} *</Text>
              <View style={styles.typeSelectorRow}>
                <TouchableOpacity
                  style={[
                    styles.typeOption,
                    milkType === 'cow' && styles.typeOptionSelectedCow
                  ]}
                  onPress={() => {
                    setMilkType('cow');
                    if (!editingCustomer) setRatePerLitre('55');
                  }}
                  activeOpacity={0.7}
                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                >
                  <Text style={styles.typeOptionText}>🐄 Cow Milk</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.typeOption,
                    milkType === 'buffalo' && styles.typeOptionSelectedBuffalo
                  ]}
                  onPress={() => {
                    setMilkType('buffalo');
                    if (!editingCustomer) setRatePerLitre('70');
                  }}
                  activeOpacity={0.7}
                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                >
                  <Text style={styles.typeOptionText}>🐃 Buffalo Milk</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.rowTwoInputs}>
                <View style={{ flex: 1, marginRight: 8 }}>
                  <Text style={styles.label}>Default Litres / Day</Text>
                  <TextInput
                    style={styles.modalInput}
                    placeholder="e.g. 2.0"
                    placeholderTextColor="#94a3b8"
                    keyboardType="decimal-pad"
                    value={defaultLitres}
                    onChangeText={setDefaultLitres}
                  />
                </View>
                <View style={{ flex: 1, marginLeft: 8 }}>
                  <Text style={styles.label}>Rate per Litre (₹)</Text>
                  <TextInput
                    style={styles.modalInput}
                    placeholder="e.g. 55"
                    placeholderTextColor="#94a3b8"
                    keyboardType="numeric"
                    value={ratePerLitre}
                    onChangeText={setRatePerLitre}
                  />
                </View>
              </View>

              <View style={styles.modalButtonRow}>
                <TouchableOpacity
                  style={styles.modalCancelBtn}
                  onPress={() => setModalVisible(false)}
                  activeOpacity={0.7}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={styles.modalCancelBtnText}>{t.cancel}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.modalSaveBtn}
                  onPress={handleSave}
                  activeOpacity={0.8}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={styles.modalSaveBtnText}>{t.save}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#f8fafc' },
  container: { flex: 1, padding: 14 },
  topBar: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  searchInput: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 13,
    color: '#0f172a'
  },
  contactImportBtn: {
    backgroundColor: '#e0f2fe',
    borderWidth: 1,
    borderColor: '#38bdf8',
    paddingHorizontal: 12,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center'
  },
  contactImportBtnText: { color: '#0284c7', fontWeight: 'bold', fontSize: 13 },
  addButton: {
    backgroundColor: '#0284c7',
    paddingHorizontal: 14,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center'
  },
  addButtonText: { color: '#ffffff', fontWeight: 'bold', fontSize: 13 },
  listContent: { paddingBottom: 30 },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  indexNum: { fontSize: 14, fontWeight: 'bold', color: '#94a3b8' },
  customerName: { fontSize: 16, fontWeight: '700', color: '#0f172a' },
  customerPhone: { fontSize: 13, color: '#64748b', marginTop: 2 },
  customerAddress: { fontSize: 12, color: '#94a3b8', marginTop: 2 },
  milkTypeBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  cowBadge: { backgroundColor: '#fef3c7' },
  buffaloBadge: { backgroundColor: '#e0e7ff' },
  milkTypeText: { fontSize: 12, fontWeight: 'bold', color: '#1e293b' },
  detailsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    padding: 10,
    marginVertical: 10
  },
  detailBox: { alignItems: 'center' },
  detailLabel: { fontSize: 11, color: '#64748b' },
  detailValue: { fontSize: 14, fontWeight: '700', color: '#0f172a', marginTop: 2 },
  actionsRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10 },
  editBtn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: '#f1f5f9'
  },
  editBtnText: { fontSize: 12, color: '#334155', fontWeight: '600' },
  deleteBtn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: '#fee2e2'
  },
  deleteBtnText: { fontSize: 12, color: '#dc2626', fontWeight: '600' },
  emptyContainer: { alignItems: 'center', marginTop: 60 },
  emptyEmoji: { fontSize: 44, marginBottom: 10 },
  emptyText: { color: '#94a3b8', fontSize: 15, marginBottom: 14 },
  emptyImportBtn: {
    backgroundColor: '#0284c7',
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 10
  },
  emptyImportBtnText: { color: '#ffffff', fontWeight: 'bold', fontSize: 14 },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 16
  },
  contactModalContent: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    maxHeight: '85%',
    padding: 18,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6
  },
  contactModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10
  },
  contactModalTitle: { fontSize: 18, fontWeight: 'bold', color: '#0f172a' },
  contactModalSubtitle: { fontSize: 12, color: '#64748b', marginTop: 2 },
  closeBtn: { padding: 6 },
  closeBtnText: { fontSize: 18, color: '#64748b', fontWeight: 'bold' },
  importPresetBox: {
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    padding: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0'
  },
  presetHeading: { fontSize: 11, fontWeight: '600', color: '#475569', marginBottom: 6 },
  presetRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  presetTypeBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1'
  },
  presetCowActive: { backgroundColor: '#fef3c7', borderColor: '#d97706' },
  presetBuffaloActive: { backgroundColor: '#e0e7ff', borderColor: '#4338ca' },
  presetTypeText: { fontSize: 12, fontWeight: 'bold', color: '#1e293b' },
  presetQtyInput: {
    width: 65,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
    fontSize: 12,
    textAlign: 'center'
  },
  contactSearchRow: { flexDirection: 'row', gap: 8, marginBottom: 10, alignItems: 'center' },
  contactSearchInput: {
    flex: 1,
    backgroundColor: '#f1f5f9',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    color: '#0f172a'
  },
  selectAllBtn: { paddingHorizontal: 10, paddingVertical: 8 },
  selectAllText: { fontSize: 12, color: '#0284c7', fontWeight: 'bold' },
  loadingContainer: { padding: 40, alignItems: 'center' },
  loadingText: { color: '#64748b', fontSize: 13, marginTop: 10 },
  contactListContent: { maxHeight: 280 },
  contactItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9'
  },
  contactItemSelected: { backgroundColor: '#f0f9ff', borderRadius: 8 },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: '#cbd5e1',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    backgroundColor: '#ffffff'
  },
  checkboxActive: { backgroundColor: '#0284c7', borderColor: '#0284c7' },
  checkmarkText: { color: '#ffffff', fontSize: 13, fontWeight: 'bold' },
  contactInfo: { flex: 1 },
  contactName: { fontSize: 14, fontWeight: '600', color: '#0f172a' },
  contactPhone: { fontSize: 12, color: '#64748b', marginTop: 1 },
  emptyContactsBox: { padding: 30, alignItems: 'center' },
  emptyContactsText: { color: '#94a3b8', fontSize: 13, textAlign: 'center' },
  importActionBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0'
  },
  selectedCountText: { fontSize: 13, color: '#475569', fontWeight: '600' },
  importConfirmBtn: {
    backgroundColor: '#0284c7',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 10
  },
  importConfirmDisabled: { backgroundColor: '#94a3b8' },
  importConfirmBtnText: { color: '#ffffff', fontWeight: 'bold', fontSize: 14 },
  modalContent: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    padding: 20,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5
  },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: '#0f172a', marginBottom: 12 },
  label: { fontSize: 12, fontWeight: '600', color: '#475569', marginBottom: 4, marginTop: 8 },
  modalInput: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    backgroundColor: '#f8fafc',
    color: '#0f172a'
  },
  typeSelectorRow: { flexDirection: 'row', gap: 10, marginTop: 4, marginBottom: 8 },
  typeOption: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    alignItems: 'center',
    backgroundColor: '#f8fafc'
  },
  typeOptionSelectedCow: {
    borderColor: '#d97706',
    backgroundColor: '#fef3c7'
  },
  typeOptionSelectedBuffalo: {
    borderColor: '#4338ca',
    backgroundColor: '#e0e7ff'
  },
  typeOptionText: { fontSize: 13, fontWeight: 'bold', color: '#1e293b' },
  rowTwoInputs: { flexDirection: 'row', marginTop: 6 },
  modalButtonRow: { flexDirection: 'row', gap: 12, marginTop: 20 },
  modalCancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    backgroundColor: '#f1f5f9'
  },
  modalCancelBtnText: { color: '#475569', fontWeight: '600' },
  modalSaveBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    backgroundColor: '#0284c7'
  },
  modalSaveBtnText: { color: '#ffffff', fontWeight: 'bold' },

  // Native Picker & Google Contact Sync styles
  nativePickerBtn: {
    backgroundColor: '#0284c715',
    borderWidth: 1,
    borderColor: '#0284c7',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    marginBottom: 8
  },
  nativePickerBtnText: { color: '#0284c7', fontWeight: '700', fontSize: 12 },
  tipBanner: {
    backgroundColor: '#eff6ff',
    borderRadius: 8,
    padding: 8,
    marginBottom: 10,
    borderLeftWidth: 3,
    borderLeftColor: '#0284c7'
  },
  tipText: { fontSize: 10.5, color: '#1e40af', lineHeight: 14 },
  emailBadge: {
    backgroundColor: '#e0f2fe',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4
  },
  emailBadgeText: { fontSize: 9.5, color: '#0369a1', fontWeight: '700' }
});
