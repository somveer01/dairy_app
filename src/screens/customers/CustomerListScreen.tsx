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
  ActivityIndicator,
  Platform,
  Linking,
  ScrollView
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Contacts from 'expo-contacts';
import { Contact } from 'expo-contacts';
import { useApp } from '../../context/AppContext';
import { StorageService } from '../../services/storageService';
import { CardSyncService } from '../../services/cardSyncService';
import { Customer, MilkType } from '../../types';
import { confirmAction, showAlert } from '../../utils/alertUtils';
import { parseWhatsAppText, ParsedWhatsAppCustomer, extractWhatsAppGroupName } from '../../utils/whatsappParser';
import JSZip from 'jszip';

interface PhoneContactItem {
  id: string;
  name: string;
  phone: string;
  email?: string;
  hasPhone: boolean;
  isSelected: boolean;
  isNameUpdate?: boolean;
  existingCustomerId?: string;
  existingName?: string;
}

const normalizePhoneDigits = (raw?: string | null): string => {
  if (!raw) return '';
  const digits = raw.replace(/\D/g, '');
  return digits.length > 10 ? digits.slice(-10) : digits;
};

const cleanPhoneInput = (raw?: string | null): string => {
  if (!raw) return '';
  const text = raw.trim();
  const digits = text.replace(/\D/g, '');

  // If text starts with '+' and starts with '91' with at least 12 digits (e.g. +91 8721873433)
  if (text.startsWith('+') && digits.startsWith('91') && digits.length >= 12) {
    return digits.slice(2, 12);
  }

  // If 12 digits starting with 91 (e.g. 918721873433 without plus)
  if (digits.length === 12 && digits.startsWith('91')) {
    return digits.slice(2, 12);
  }

  // If 11 digits starting with 0 (e.g. 08721873433)
  if (digits.length === 11 && digits.startsWith('0')) {
    return digits.slice(1, 11);
  }

  // If more than 10 digits, take the last 10 digits
  if (digits.length > 10) {
    return digits.slice(-10);
  }

  // 10 or fewer digits (user typing or 10-digit paste)
  return digits;
};

export const CustomerListScreen = () => {
  const { t, lang, customers, refreshCustomers, milkEntries, refreshMilkEntries, payments, refreshPayments, supplier, requireAuth } = useApp();
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

  // WhatsApp Import Modal State
  const [whatsappModalVisible, setWhatsappModalVisible] = useState(false);
  const [whatsappGroupName, setWhatsappGroupName] = useState('');
  const [parsedWhatsAppCustomers, setParsedWhatsAppCustomers] = useState<ParsedWhatsAppCustomer[]>([]);
  const [isScanningWhatsApp, setIsScanningWhatsApp] = useState(false);
  const [whatsappDefaultCowRate, setWhatsappDefaultCowRate] = useState('55');
  const [whatsappDefaultBuffaloRate, setWhatsappDefaultBuffaloRate] = useState('70');

  const openWhatsAppModal = () => {
    Keyboard.dismiss();
    requireAuth(() => {
      setWhatsappGroupName('');
      setParsedWhatsAppCustomers([]);
      setWhatsappModalVisible(true);
    });
  };

  // Check for incoming shared WhatsApp chat files from Android Share Sheet (Web Share Target)
  React.useEffect(() => {
    const checkIncomingSharedFile = async () => {
      if (Platform.OS !== 'web' || typeof window === 'undefined' || !('caches' in window)) return;
      try {
        const cache = await caches.open('dairy-shared-cache');
        const match = await cache.match('/dairy_app/last-shared-file');
        if (match) {
          const rawFileName = match.headers.get('X-Shared-Filename') || 'whatsapp_chat.txt';
          const fileName = decodeURIComponent(rawFileName);
          const blob = await match.blob();
          await cache.delete('/dairy_app/last-shared-file');

          // Clean up URL without page reload
          if (window.location.search.includes('whatsapp_share')) {
            window.history.replaceState({}, document.title, window.location.pathname);
          }

          setIsScanningWhatsApp(true);
          setWhatsappModalVisible(true);

          let text = '';
          if (fileName.toLowerCase().endsWith('.zip')) {
            const zip = await JSZip.loadAsync(blob);
            const txtEntry = Object.values(zip.files).find(
              f => f.name.toLowerCase().endsWith('.txt') && !f.dir
            );
            if (txtEntry) {
              text = await txtEntry.async('text');
            }
          } else {
            text = await blob.text();
          }

          if (text) {
            const extractedGroupName = extractWhatsAppGroupName(fileName, text) || fileName.replace(/\.[^/.]+$/, '');
            setWhatsappGroupName(extractedGroupName);

            const cowR = parseFloat(whatsappDefaultCowRate) || 55;
            const buffR = parseFloat(whatsappDefaultBuffaloRate) || 70;
            const parsed = parseWhatsAppText(text, customers, cowR, buffR);
            setParsedWhatsAppCustomers(parsed);
          }
          setIsScanningWhatsApp(false);
        }
      } catch (e) {
        console.warn('Error checking shared file:', e);
        setIsScanningWhatsApp(false);
      }
    };

    checkIncomingSharedFile();
  }, [customers]);

  const handleSelectWhatsAppGroupFile = () => {
    if (typeof document !== 'undefined') {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.txt,.zip,text/plain,application/zip';
      input.onchange = async (event: any) => {
        const file = event.target?.files?.[0];
        if (!file) return;
        try {
          setIsScanningWhatsApp(true);
          let text = '';
          if (file.name.toLowerCase().endsWith('.zip')) {
            const zip = await JSZip.loadAsync(file);
            const txtEntry = Object.values(zip.files).find(
              f => f.name.toLowerCase().endsWith('.txt') && !f.dir
            );
            if (!txtEntry) {
              showAlert(
                lang === 'hi' ? 'चैट फाइल नहीं मिली' : 'No Chat File Found',
                lang === 'hi'
                  ? 'इस .zip फाइल में कोई .txt चैट फाइल नहीं मिली। कृपया व्हाट्सएप से चैट बिना मीडिया (Without Media) एक्सपोर्ट करें।'
                  : 'No .txt chat file found inside this .zip file. Please export without media from WhatsApp.'
              );
              return;
            }
            text = await txtEntry.async('text');
          } else {
            text = await file.text();
          }

          const extractedGroupName = extractWhatsAppGroupName(file.name, text) || file.name.replace(/\.[^/.]+$/, '');
          setWhatsappGroupName(extractedGroupName);

          const cowR = parseFloat(whatsappDefaultCowRate) || 55;
          const buffR = parseFloat(whatsappDefaultBuffaloRate) || 70;
          const parsed = parseWhatsAppText(text, customers, cowR, buffR);
          setParsedWhatsAppCustomers(parsed);

          if (parsed.length === 0) {
            showAlert(
              lang === 'hi' ? 'कोई संपर्क नहीं मिला' : 'No Contacts Found',
              lang === 'hi'
                ? 'इस ग्रुप फाइल में कोई 10-अंकों का मोबाइल नंबर नहीं मिला। कृपया सुनिश्चित करें कि आपने ग्राहक ग्रुप का चैट एक्सपोर्ट चुना है।'
                : 'No 10-digit mobile numbers found in this group file. Please ensure you selected a customer group chat export.'
            );
          }
        } catch (err) {
          showAlert('Error', 'Could not read WhatsApp group file.');
        } finally {
          setIsScanningWhatsApp(false);
        }
      };
      input.click();
    }
  };

  const handleToggleWhatsAppCustomer = (id: string) => {
    setParsedWhatsAppCustomers(prev =>
      prev.map(c => (c.id === id ? { ...c, isSelected: !c.isSelected } : c))
    );
  };

  const handleToggleAllWhatsApp = (selectAll: boolean) => {
    setParsedWhatsAppCustomers(prev =>
      prev.map(c => ({ ...c, isSelected: selectAll }))
    );
  };

  const handleUpdateWhatsAppCustomerName = (id: string, newName: string) => {
    setParsedWhatsAppCustomers(prev =>
      prev.map(c => (c.id === id ? { ...c, name: newName } : c))
    );
  };

  const handleUpdateWhatsAppCustomerLitres = (id: string, litres: number) => {
    setParsedWhatsAppCustomers(prev =>
      prev.map(c => (c.id === id ? { ...c, defaultLitres: Math.max(0.5, Math.round(litres * 10) / 10) } : c))
    );
  };

  const handleUpdateWhatsAppCustomerMilkType = (id: string, milkType: MilkType) => {
    const rate = milkType === 'buffalo' ? (parseFloat(whatsappDefaultBuffaloRate) || 70) : (parseFloat(whatsappDefaultCowRate) || 55);
    setParsedWhatsAppCustomers(prev =>
      prev.map(c => (c.id === id ? { ...c, milkType, ratePerLitre: rate } : c))
    );
  };

  const handleBatchImportWhatsApp = async () => {
    const selected = parsedWhatsAppCustomers.filter(c => c.isSelected && c.name.trim() && c.phone.length === 10);
    if (selected.length === 0) {
      showAlert(
        lang === 'hi' ? 'कोई ग्राहक नहीं चुना गया' : 'No Customers Selected',
        lang === 'hi' ? 'कृपया कम से कम एक ग्राहक चुनें।' : 'Please select at least one customer to import.'
      );
      return;
    }

    try {
      setIsScanningWhatsApp(true);
      const newCustomers: Customer[] = selected.map(item => ({
        id: item.isExisting && item.existingCustomerId ? item.existingCustomerId : 'cust_' + item.phone,
        supplierId: supplier?.id || 'supp_1',
        name: item.name.trim(),
        phone: item.phone,
        milkType: item.milkType,
        defaultLitres: item.defaultLitres,
        ratePerLitre: item.ratePerLitre,
        notes: item.sourceNote || 'Imported from WhatsApp',
        createdAt: Date.now()
      }));

      await StorageService.saveCustomersBatch(newCustomers);
      await refreshCustomers();
      // Background sync all cards
      CardSyncService.syncAllCards(supplier);

      setWhatsappModalVisible(false);
      showAlert(
        lang === 'hi' ? '✓ ग्राहक सफलतापूर्वक जुड़े' : '✓ Customers Imported',
        lang === 'hi'
          ? `${selected.length} ग्राहक WhatsApp से आपकी डेयरी में सफलतापूर्वक जुड़ गए हैं!`
          : `Successfully imported ${selected.length} customer(s) from WhatsApp into your Dairy App!`
      );
    } catch (err) {
      showAlert('Error', 'Failed to import customers from WhatsApp.');
    } finally {
      setIsScanningWhatsApp(false);
    }
  };

  const openAddModal = () => {
    Keyboard.dismiss();
    requireAuth(() => {
      setEditingCustomer(null);
      setName('');
      setPhone('');
      setAddress('');
      setMilkType('cow');
      setDefaultLitres('2.0');
      setRatePerLitre('55');
      setNotes('');
      setModalVisible(true);
    });
  };

  const openEditModal = (cust: Customer) => {
    Keyboard.dismiss();
    requireAuth(() => {
      setEditingCustomer(cust);
      setName(cust.name);
      setPhone(cust.phone);
      setAddress(cust.address || '');
      setMilkType(cust.milkType);
      setDefaultLitres(cust.defaultLitres.toString());
      setRatePerLitre(cust.ratePerLitre.toString());
      setNotes(cust.notes || '');
      setModalVisible(true);
    });
  };

  const handleSave = async () => {
    Keyboard.dismiss();
    requireAuth(async () => {
      const trimmedName = name.trim();
      if (!trimmedName) {
        showAlert(
          lang === 'hi' ? 'नाम आवश्यक है' : 'Validation Error',
          lang === 'hi' ? 'कृपया ग्राहक का नाम दर्ज करें।' : 'Please enter customer name.'
        );
        return;
      }

      const normPhone = normalizePhoneDigits(phone);
      if (!normPhone || normPhone.length < 10) {
        showAlert(
          lang === 'hi' ? 'अमान्य मोबाइल नंबर' : 'Invalid Phone Number',
          lang === 'hi' ? 'कृपया 10 अंकों का मान्य मोबाइल नंबर दर्ज करें।' : 'Please enter a valid 10-digit mobile number.'
        );
        return;
      }

      // Check if phone number already exists under another customer
      const existingMatch = customers.find(c => {
        if (editingCustomer && c.id === editingCustomer.id) return false;
        const cNorm = normalizePhoneDigits(c.phone);
        return cNorm && cNorm === normPhone;
      });

      if (existingMatch) {
        showAlert(
          lang === 'hi' ? 'मोबाइल नंबर पहले से मौजूद है' : 'Phone Number Already Exists',
          lang === 'hi'
            ? `यह मोबाइल नंबर (${phone}) पहले से ग्राहक "${existingMatch.name}" के नाम पर दर्ज है। कृपया दूसरा नंबर दर्ज करें या मौजूदा ग्राहक का विवरण बदलें।`
            : `This phone number (${phone}) is already registered under customer "${existingMatch.name}". Please enter a different number or edit the existing customer.`
        );
        return;
      }

      const litres = parseFloat(defaultLitres) || 1.0;
      const rate = parseFloat(ratePerLitre) || 50;

      const customerData: Customer = {
        id: editingCustomer ? editingCustomer.id : 'cust_' + Date.now(),
        supplierId: supplier?.id || 'supp_default',
        name: trimmedName,
        phone: normPhone,
        address: address.trim(),
        milkType: milkType,
        defaultLitres: litres,
        ratePerLitre: rate,
        notes: notes.trim(),
        createdAt: editingCustomer ? editingCustomer.createdAt : Date.now()
      };

      if (editingCustomer && editingCustomer.name.trim() !== trimmedName) {
        // Customer name updated - update historical milk entries and payments as well
        await StorageService.updateCustomerName(editingCustomer.id, trimmedName);
        await refreshMilkEntries();
        await refreshPayments();
      }

      await StorageService.saveCustomer(customerData);
      await refreshCustomers();
      CardSyncService.syncCustomerCard(customerData.id, supplier, [...customers, customerData], milkEntries, payments);
      setModalVisible(false);
    });
  };

  const handleDelete = (id: string, custName: string) => {
    requireAuth(() => {
      confirmAction(
        'ग्राहक हटाएं (Delete Customer)',
        `क्या आप वाकई इस ग्राहक को अपनी लिस्ट से हटाना चाहते हैं?\n• ग्राहक का नाम (Customer): ${custName}\n• सूचना: हटाने पर इस ग्राहक का नाम लिस्ट से हट जाएगा।`,
        async () => {
          await StorageService.deleteCustomer(id, supplier?.id);
          await CardSyncService.deleteCustomerCard(supplier?.id || 'supp_1', id);
          await refreshCustomers();
          await refreshMilkEntries();
          await refreshPayments();
        },
        '🗑️ हटाएं (Delete)',
        'रद्द करें (Cancel)',
        true
      );
    });
  };

  // --- CONTACTS IMPORT FLOW ---
  const openContactsImportModal = async () => {
    Keyboard.dismiss();
    requireAuth(async () => {
      setContactModalVisible(true);
      setContactSearch('');

      if (Platform.OS === 'web') {
        // On Web/PWA, browser security does not allow silent background contact reading.
        // Instead, we let the user trigger the Android/browser contact picker or upload a VCF file.
        setIsLoadingContacts(false);
        return;
      }

      setIsLoadingContacts(true);
      try {
        // 1. Request permission safely on native Android/iOS
        const permissionRes = await Contacts.requestPermissionsAsync();
        if (permissionRes.status !== 'granted') {
          setIsLoadingContacts(false);
          showAlert(
            'Permission Denied',
            'Please allow contact permissions in your phone settings to import contacts directly.'
          );
          setContactModalVisible(false);
          return;
        }

        const existingPhoneMap = new Map<string, Customer>();
        customers.forEach(c => {
          const norm = normalizePhoneDigits(c.phone);
          if (norm) existingPhoneMap.set(norm, c);
        });
        const validList: PhoneContactItem[] = [];

        // 2. Fetch contacts across all accounts (Device, SIM, Google, Outlook)
        let contactRecords: any[] = [];
        try {
          const res = await Contacts.getContactsAsync({
            fields: [
              Contacts.Fields.PhoneNumbers,
              Contacts.Fields.Name,
              Contacts.Fields.FirstName,
              Contacts.Fields.LastName,
              Contacts.Fields.Emails
            ],
            sort: Contacts.SortTypes.FirstName
          });
          contactRecords = res.data || [];
        } catch (fetchErr) {
          console.warn('Modern getContactsAsync failed, trying fallback:', fetchErr);
          const LegacyContacts = Contacts as any;
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
        }

        // 3. Process retrieved contacts across all accounts
        if (contactRecords && contactRecords.length > 0) {
          contactRecords.forEach((c: any, index: number) => {
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

            const phones = c.phones || c.phoneNumbers || [];
            let extractedPhone = '';
            if (Array.isArray(phones)) {
              for (const p of phones) {
                const num = p.number || p.digits;
                const clean = normalizePhoneDigits(num);
                if (clean && clean.length >= 10) {
                  extractedPhone = clean;
                  break;
                }
              }
            }

            const emails = c.emails || [];
            let extractedEmail = '';
            if (Array.isArray(emails) && emails.length > 0) {
              extractedEmail = emails[0]?.email || emails[0]?.address || '';
            }

            if (!displayName) {
              if (extractedPhone) {
                displayName = `Contact ${extractedPhone.slice(-4)}`;
              } else {
                displayName = `Contact ${index + 1}`;
              }
            }

            if (extractedPhone || extractedEmail) {
              const existingCust = extractedPhone ? existingPhoneMap.get(extractedPhone) : undefined;
              if (!existingCust) {
                validList.push({
                  id: c.id || `contact_${index}_${Math.random().toString(36).substring(7)}`,
                  name: displayName,
                  phone: extractedPhone,
                  email: extractedEmail,
                  hasPhone: extractedPhone.length >= 10,
                  isSelected: false,
                  isNameUpdate: false
                });
              } else if (existingCust.name.trim().toLowerCase() !== displayName.trim().toLowerCase()) {
                // Phone number already exists, but name in phonebook is different from Dairy App!
                validList.push({
                  id: c.id || `contact_${index}_${Math.random().toString(36).substring(7)}`,
                  name: displayName,
                  phone: extractedPhone,
                  email: extractedEmail,
                  hasPhone: extractedPhone.length >= 10,
                  isSelected: true,
                  isNameUpdate: true,
                  existingCustomerId: existingCust.id,
                  existingName: existingCust.name
                });
              }
            }
          });

          validList.sort((a, b) => a.name.localeCompare(b.name));
          setDeviceContacts(validList);
        } else {
          setDeviceContacts([]);
        }
      } catch (error: any) {
        console.warn('Contact read error:', error);
        showAlert(
          'Contacts Notice',
          `Unable to read contacts directly: ${error?.message || 'Permission or device restriction'}.\n\nTip: You can use the "+ Add" button to quickly add customers.`
        );
      } finally {
        setIsLoadingContacts(false);
      }
    });
  };

  // Helper to process single picked contact (from Web or Native)
  const handleSinglePickedContact = async (rawName: string, rawPhone: string) => {
    const pName = (rawName || 'New Customer').trim();
    const pPhone = normalizePhoneDigits(rawPhone);

    if (!pPhone || pPhone.length < 10) {
      showAlert(
        lang === 'hi' ? 'अमान्य मोबाइल नंबर' : 'Invalid Phone Number',
        lang === 'hi' ? 'इस संपर्क में कोई 10 अंकों का मान्य मोबाइल नंबर नहीं मिला।' : 'No valid 10-digit mobile number found in this contact.'
      );
      return;
    }

    const existingMatch = customers.find(cust => normalizePhoneDigits(cust.phone) === pPhone);
    if (existingMatch) {
      if (existingMatch.name.trim().toLowerCase() !== pName.toLowerCase()) {
        // Phone number exists, but name is different! Prompt to update name
        confirmAction(
          lang === 'hi' ? 'ग्राहक का नाम अपडेट करें?' : 'Update Customer Name?',
          lang === 'hi'
            ? `यह मोबाइल नंबर (${pPhone}) पहले से ग्राहक "${existingMatch.name}" के नाम पर दर्ज है।\n\nक्या आप फोनबुक अनुसार नाम बदलकर "${pName}" करना चाहते हैं?`
            : `This phone number (${pPhone}) is already registered under customer "${existingMatch.name}".\n\nDo you want to update the customer's name to "${pName}" as saved in your phonebook?`,
          async () => {
            await StorageService.updateCustomerName(existingMatch.id, pName);
            await refreshCustomers();
            await refreshMilkEntries();
            await refreshPayments();
            setContactModalVisible(false);
            showAlert(
              lang === 'hi' ? '✓ नाम अपडेट हुआ' : '✓ Name Updated',
              lang === 'hi'
                ? `ग्राहक का नाम बदलकर "${pName}" कर दिया गया है।`
                : `Customer name updated to "${pName}".`
            );
          },
          lang === 'hi' ? 'नाम अपडेट करें' : 'Update Name',
          lang === 'hi' ? 'रद्द करें' : 'Cancel',
          false
        );
        return;
      } else {
        // Phone number exists and name is identical
        showAlert(
          lang === 'hi' ? 'ग्राहक पहले से मौजूद है' : 'Customer Already Exists',
          lang === 'hi'
            ? `ग्राहक "${existingMatch.name}" (${pPhone}) पहले से आपकी ग्राहक लिस्ट में दर्ज है।`
            : `Customer "${existingMatch.name}" (${pPhone}) is already present in your customer list.`
        );
        return;
      }
    }

    // Phone number is new - open modal pre-filled
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
  };

  // Launch Android native contact picker or Web W3C Contact Picker for 1-tap single contact
  const handlePickFromNativeContacts = async () => {
    if (Platform.OS === 'web') {
      if (typeof navigator !== 'undefined' && 'contacts' in navigator && 'ContactsManager' in window) {
        try {
          const selected = await (navigator as any).contacts.select(['name', 'tel'], { multiple: false });
          if (selected && selected.length > 0) {
            const c = selected[0];
            const pName = (c.name && c.name[0]) || 'New Customer';
            const pPhone = (c.tel && c.tel.length > 0) ? c.tel[0] : '';
            await handleSinglePickedContact(pName, pPhone);
            return;
          }
        } catch (pickerErr) {
          console.warn('Web single contact picker cancelled or failed:', pickerErr);
        }
      } else {
        showAlert(
          'Notice',
          'Direct contact picking requires Android Chrome. You can also upload a .VCF file from Google Contacts or enter customer details.'
        );
      }
      return;
    }

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
        const pName = picked.name || picked.fullName || `${picked.givenName || ''} ${picked.familyName || ''}`.trim() || 'New Customer';
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

        await handleSinglePickedContact(pName, pPhone);
      }
    } catch (pickerErr: any) {
      console.warn('Native picker error:', pickerErr);
      showAlert('Notice', 'Could not open native contact picker.');
    }
  };

  // Launch W3C Web Contact Picker on Android Chrome for multiple contacts selection
  const handlePickMultipleWebContacts = async () => {
    if (typeof navigator !== 'undefined' && 'contacts' in navigator && 'ContactsManager' in window) {
      try {
        setIsLoadingContacts(true);
        const selected = await (navigator as any).contacts.select(['name', 'tel', 'email'], { multiple: true });
        if (selected && selected.length > 0) {
          const existingCustMap = new Map<string, Customer>();
          customers.forEach(c => {
            const norm = normalizePhoneDigits(c.phone);
            if (norm) existingCustMap.set(norm, c);
          });
          const newItems: PhoneContactItem[] = [];

          selected.forEach((c: any, index: number) => {
            const pName = ((c.name && c.name[0]) || `Contact ${index + 1}`).trim();
            let pPhone = '';
            if (c.tel && c.tel.length > 0) {
              pPhone = normalizePhoneDigits(c.tel[0]);
            }
            const pEmail = (c.email && c.email[0]) || '';

            if (pPhone || pEmail) {
              const existingCust = pPhone ? existingCustMap.get(pPhone) : undefined;
              if (!existingCust) {
                newItems.push({
                  id: `web_contact_${Date.now()}_${index}`,
                  name: pName,
                  phone: pPhone,
                  email: pEmail,
                  hasPhone: pPhone.length >= 10,
                  isSelected: true,
                  isNameUpdate: false
                });
              } else if (existingCust.name.trim().toLowerCase() !== pName.toLowerCase()) {
                // Name mismatch - candidate for name update
                newItems.push({
                  id: `web_contact_${Date.now()}_${index}`,
                  name: pName,
                  phone: pPhone,
                  email: pEmail,
                  hasPhone: pPhone.length >= 10,
                  isSelected: true,
                  isNameUpdate: true,
                  existingCustomerId: existingCust.id,
                  existingName: existingCust.name
                });
              }
            }
          });

          if (newItems.length > 0) {
            setDeviceContacts(prev => [...newItems, ...prev]);
            const updatesCount = newItems.filter(i => i.isNameUpdate).length;
            const newCount = newItems.length - updatesCount;
            let loadedMsg = `Loaded ${newItems.length} contact(s) from phone!`;
            if (updatesCount > 0 && newCount > 0) {
              loadedMsg = `Loaded ${newCount} new contact(s) and ${updatesCount} name update(s)! Review below and tap 'Import'.`;
            } else if (updatesCount > 0) {
              loadedMsg = `Found ${updatesCount} contact(s) with updated names! Review below and tap 'Import / Update'.`;
            }
            showAlert('Contacts Loaded', loadedMsg);
          } else {
            showAlert('Notice', 'All selected contacts are already up to date in your customer list.');
          }
        }
      } catch (err) {
        console.warn('Web multiple contacts select cancelled/failed:', err);
      } finally {
        setIsLoadingContacts(false);
      }
    } else {
      showAlert(
        'Browser Contact Picker',
        'Direct phone contact selection in browser is supported on Android Chrome. You can also use the "Upload .VCF File" button to import all contacts.'
      );
    }
  };

  // Import contacts from a .VCF file (Google Contacts / Phone Contacts export)
  const handleImportVcfFile = () => {
    if (typeof document !== 'undefined') {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.vcf,.csv,text/vcard';
      input.onchange = async (event: any) => {
        const file = event.target?.files?.[0];
        if (!file) return;

        try {
          setIsLoadingContacts(true);
          const text = await file.text();
          const parsedContacts: PhoneContactItem[] = [];
          const existingCustMap = new Map<string, Customer>();
          customers.forEach(c => {
            const norm = normalizePhoneDigits(c.phone);
            if (norm) existingCustMap.set(norm, c);
          });
          const cards = text.split(/BEGIN:VCARD/i);

          cards.forEach((card: string, idx: number) => {
            if (!card.trim()) return;
            let cName = '';
            let cPhone = '';
            let cEmail = '';

            const fnMatch = card.match(/FN[;:]([^\r\n]+)/i);
            if (fnMatch) cName = fnMatch[1].trim();

            if (!cName) {
              const nMatch = card.match(/N[;:]([^\r\n]+)/i);
              if (nMatch) {
                const parts = nMatch[1].split(';');
                cName = `${parts[1] || ''} ${parts[0] || ''}`.trim();
              }
            }

            const telMatches = card.matchAll(/TEL[^:]*:([^\r\n]+)/gi);
            for (const tm of telMatches) {
              const clean = tm[1].replace(/[^0-9]/g, '');
              if (clean.length >= 10) {
                cPhone = clean.slice(-10);
                break;
              }
            }

            const emailMatch = card.match(/EMAIL[^:]*:([^\r\n]+)/i);
            if (emailMatch) cEmail = emailMatch[1].trim();

            if (cName || cPhone) {
              const displayName = cName || `Contact ${cPhone}`;
              const existingCust = cPhone ? existingCustMap.get(cPhone) : undefined;
              if (!existingCust) {
                parsedContacts.push({
                  id: `vcf_${Date.now()}_${idx}`,
                  name: displayName,
                  phone: cPhone,
                  email: cEmail,
                  hasPhone: cPhone.length >= 10,
                  isSelected: true,
                  isNameUpdate: false
                });
              } else if (existingCust.name.trim().toLowerCase() !== displayName.toLowerCase()) {
                // Name mismatch - candidate for name update
                parsedContacts.push({
                  id: `vcf_${Date.now()}_${idx}`,
                  name: displayName,
                  phone: cPhone,
                  email: cEmail,
                  hasPhone: cPhone.length >= 10,
                  isSelected: true,
                  isNameUpdate: true,
                  existingCustomerId: existingCust.id,
                  existingName: existingCust.name
                });
              }
            }
          });

          if (parsedContacts.length > 0) {
            parsedContacts.sort((a, b) => a.name.localeCompare(b.name));
            setDeviceContacts(parsedContacts);
            const updatesCount = parsedContacts.filter(i => i.isNameUpdate).length;
            const newCount = parsedContacts.length - updatesCount;
            let loadedMsg = `Loaded ${parsedContacts.length} contacts from file! Review and tap 'Import'.`;
            if (updatesCount > 0 && newCount > 0) {
              loadedMsg = `Loaded ${newCount} new contact(s) and ${updatesCount} name update(s)! Review below and tap 'Import'.`;
            } else if (updatesCount > 0) {
              loadedMsg = `Found ${updatesCount} contact(s) with updated names! Review below and tap 'Import / Update'.`;
            }
            showAlert('Contacts Loaded', loadedMsg);
          } else {
            showAlert('No New Contacts', 'All contacts in the selected file are already up to date in your customer list.');
          }
        } catch {
          showAlert('Error', 'Failed to read contacts file.');
        } finally {
          setIsLoadingContacts(false);
        }
      };
      input.click();
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

  // Import selected contacts in batch (processes both new contacts and name updates)
  const handleImportSelected = async () => {
    const selected = deviceContacts.filter(c => c.isSelected);
    if (selected.length === 0) {
      showAlert(
        lang === 'hi' ? 'कोई संपर्क नहीं चुना' : 'No Selection',
        lang === 'hi' ? 'कृपया इम्पोर्ट करने के लिए कम से कम एक संपर्क चुनें।' : 'Please select at least one contact to import.'
      );
      return;
    }

    const litres = parseFloat(importLitres) || 2.0;
    const rate = parseFloat(importRate) || (importMilkType === 'cow' ? 55 : 70);

    const nameUpdates = selected.filter(c => c.isNameUpdate && c.existingCustomerId);
    const newContacts = selected.filter(c => !c.isNameUpdate);

    // 1. Process Name Updates
    for (const updateItem of nameUpdates) {
      if (updateItem.existingCustomerId && updateItem.name.trim()) {
        await StorageService.updateCustomerName(updateItem.existingCustomerId, updateItem.name.trim());
      }
    }

    // 2. Process New Customers
    if (newContacts.length > 0) {
      const newCustomers: Customer[] = newContacts.map((c, idx) => ({
        id: `cust_contact_${Date.now()}_${idx}`,
        supplierId: supplier?.id || 'supp_default',
        name: c.name.trim(),
        phone: c.phone || '9876500000',
        address: c.email ? `Email: ${c.email}` : '',
        milkType: importMilkType,
        defaultLitres: litres,
        ratePerLitre: rate,
        notes: c.email ? `Google contact: ${c.email}` : 'Imported from phone contacts',
        createdAt: Date.now()
      }));
      await StorageService.saveCustomersBatch(newCustomers);
    }

    await refreshCustomers();
    if (nameUpdates.length > 0) {
      await refreshMilkEntries();
      await refreshPayments();
    }
    setContactModalVisible(false);

    // 3. Construct user feedback message
    let msgHi = '';
    let msgEn = '';
    if (newContacts.length > 0 && nameUpdates.length > 0) {
      msgHi = `✓ ${newContacts.length} नए ग्राहक जोड़े गए और ${nameUpdates.length} ग्राहकों के नाम फोनबुक अनुसार अपडेट किए गए!`;
      msgEn = `✓ Added ${newContacts.length} new customer(s) and updated ${nameUpdates.length} customer name(s) from phonebook!`;
    } else if (nameUpdates.length > 0) {
      msgHi = `✓ ${nameUpdates.length} ग्राहकों के नाम फोनबुक अनुसार सफलतापूर्वक अपडेट किए गए!`;
      msgEn = `✓ Successfully updated ${nameUpdates.length} customer name(s) from phonebook!`;
    } else {
      msgHi = `✓ ${newContacts.length} नए ग्राहक सफलतापूर्वक जोड़े गए!`;
      msgEn = `✓ Successfully imported ${newContacts.length} new customer(s) from contacts!`;
    }

    showAlert(lang === 'hi' ? 'सफलता (Success)' : 'Success', lang === 'hi' ? msgHi : msgEn);
  };

  const filteredCustomers = customers.filter(
    c =>
      !c.isDeleted &&
      (c.name.toLowerCase().includes(search.toLowerCase()) ||
        c.phone.includes(search) ||
        (c.address && c.address.toLowerCase().includes(search.toLowerCase())))
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
        {/* Search Bar Row */}
        <View style={styles.searchRow}>
          <TextInput
            style={styles.searchInput}
            placeholder={`🔍 ${t.searchCustomers}`}
            placeholderTextColor="#94a3b8"
            value={search}
            onChangeText={setSearch}
          />
        </View>

        {/* Action Buttons Row (Contacts, WhatsApp & Add Customer) */}
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={styles.contactImportBtn}
            onPress={openContactsImportModal}
            activeOpacity={0.8}
            hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
          >
            <Text style={styles.contactImportBtnText}>📱 {t.contacts || 'Contacts'}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.whatsappImportBtn}
            onPress={openWhatsAppModal}
            activeOpacity={0.8}
            hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
          >
            <Text style={styles.whatsappImportBtnText}>💬 {t.whatsappImport || 'WhatsApp'}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.addButton}
            onPress={openAddModal}
            activeOpacity={0.8}
            hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
          >
            <Text style={styles.addButtonText}>+ {t.addCustomer || 'Add'}</Text>
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
                  style={styles.shareCardBtn}
                  onPress={async () => {
                    await CardSyncService.syncCustomerCard(item.id, supplier, customers, milkEntries, payments);
                    await CardSyncService.shareCardViaWhatsApp(item, supplier, lang);
                  }}
                  activeOpacity={0.7}
                  hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                >
                  <Text style={styles.shareCardBtnText}>🔗 {lang === 'hi' ? 'कार्ड शेयर' : 'Share Card'}</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.viewCardBtn}
                  onPress={async () => {
                    await CardSyncService.syncCustomerCard(item.id, supplier, customers, milkEntries, payments);
                    const url = CardSyncService.getCardUrl(supplier?.id || 'supp_1', item.id, true);
                    if (Platform.OS === 'web' && typeof window !== 'undefined') {
                      window.location.href = url;
                    } else {
                      Linking.openURL(url);
                    }
                  }}
                  activeOpacity={0.7}
                  hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                >
                  <Text style={styles.viewCardBtnText}>👁️ {lang === 'hi' ? 'देखें' : 'View'}</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.editBtn}
                  onPress={() => openEditModal(item)}
                  activeOpacity={0.7}
                  hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                >
                  <Text style={styles.editBtnText}>✏️ {t.editPrompt || 'Edit'}</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.deleteBtn}
                  onPress={() => handleDelete(item.id, item.name)}
                  activeOpacity={0.7}
                  hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                >
                  <Text style={styles.deleteBtnText}>🗑️</Text>
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

              {/* Actions for Web/Chrome or Native */}
              <View style={{ gap: 8, marginBottom: 10 }}>
                {Platform.OS === 'web' && (
                  <TouchableOpacity
                    style={styles.webBatchPickerBtn}
                    onPress={handlePickMultipleWebContacts}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.webBatchPickerBtnText}>
                      📱 Select from Phone Contacts (Pick Multiple)
                    </Text>
                  </TouchableOpacity>
                )}

                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TouchableOpacity
                    style={[styles.nativePickerBtn, { flex: 1, marginBottom: 0 }]}
                    onPress={handlePickFromNativeContacts}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.nativePickerBtnText}>
                      👤 Pick Single Contact
                    </Text>
                  </TouchableOpacity>

                  {Platform.OS === 'web' && (
                    <TouchableOpacity
                      style={[styles.vcfPickerBtn, { flex: 1 }]}
                      onPress={handleImportVcfFile}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.vcfPickerBtnText}>
                        📁 Upload .VCF File
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>

              {/* Permission & Sync Explanation Tip */}
              <View style={styles.tipBanner}>
                <Text style={styles.tipText}>
                  {Platform.OS === 'web'
                    ? '💡 Android Permission Note: Browser/PWA apps ask for contact permission when you tap "Select from Phone Contacts" above. Tap the button to select contacts from your phone!'
                    : '💡 Tip: To show Google/Gmail contacts, ensure "Contacts Sync" is toggled ON in Android Settings → Accounts → Google.'}
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
                        <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                          <Text style={styles.contactName} numberOfLines={1}>{item.name}</Text>
                          {item.isNameUpdate && (
                            <View style={styles.nameUpdateBadge}>
                              <Text style={styles.nameUpdateBadgeText}>
                                🔄 {lang === 'hi' ? 'नाम अपडेट' : 'Update Name'}
                              </Text>
                            </View>
                          )}
                          {item.email && !item.hasPhone && (
                            <View style={styles.emailBadge}>
                              <Text style={styles.emailBadgeText}>Google Account</Text>
                            </View>
                          )}
                        </View>
                        {item.isNameUpdate && item.existingName && (
                          <Text style={styles.nameUpdateDetailText}>
                            {lang === 'hi' ? 'ऐप में नाम:' : 'In Dairy App:'} {item.existingName} ➔ {item.name}
                          </Text>
                        )}
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
                    {lang === 'hi' ? `इम्पोर्ट / अपडेट (${selectedCount})` : `Import / Update (${selectedCount})`}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* --- WHATSAPP GROUP MEMBER IMPORT MODAL --- */}
        <Modal visible={whatsappModalVisible} animationType="slide" transparent>
          <View style={styles.modalOverlay}>
            <View style={styles.contactModalContent}>
              {/* Header */}
              <View style={styles.contactModalHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.contactModalTitle}>
                    👥 {t.whatsappImportTitle || 'Select WhatsApp Group'}
                  </Text>
                  <Text style={styles.contactModalSubtitle}>
                    {t.whatsappImportSubtitle || 'Select your customer WhatsApp group to view and import members.'}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => setWhatsappModalVisible(false)}
                  style={styles.closeBtn}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={styles.closeBtnText}>✕</Text>
                </TouchableOpacity>
              </View>

              <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="always">
                {parsedWhatsAppCustomers.length === 0 ? (
                  /* --- STEP 1: SELECT WHATSAPP GROUP --- */
                  <View style={{ paddingVertical: 8 }}>
                    {/* Big Prominent Group Selector Card */}
                    <View style={styles.waGroupSelectCard}>
                      <TouchableOpacity
                        style={styles.waUploadBtn}
                        onPress={handleSelectWhatsAppGroupFile}
                        activeOpacity={0.8}
                        disabled={isScanningWhatsApp}
                      >
                        {isScanningWhatsApp ? (
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <ActivityIndicator size="small" color="#ffffff" />
                            <Text style={styles.waUploadBtnText}>
                              {lang === 'hi' ? 'ग्रुप लोड हो रहा है...' : 'Reading Group...'}
                            </Text>
                          </View>
                        ) : (
                          <Text style={styles.waUploadBtnText}>
                            {t.selectWhatsAppGroupBtn || '📁 Select WhatsApp Group (.txt / .zip)'}
                          </Text>
                        )}
                      </TouchableOpacity>
                      <Text style={styles.waSelectHintText}>
                        {lang === 'hi'
                          ? 'व्हाट्सएप ग्रुप की एक्सपोर्ट की गई .txt या .zip फाइल चुनें'
                          : 'Pick the .txt or .zip file exported from your WhatsApp group'}
                      </Text>
                    </View>

                    {/* Clear 3-Step Visual Instruction Guide */}
                    <View style={styles.waGuideBox}>
                      <Text style={styles.waGuideTitle}>
                        {t.howToExportGroupTitle || 'How to select your WhatsApp Group:'}
                      </Text>
                      <View style={styles.waGuideStep}>
                        <Text style={styles.waStepBadge}>1</Text>
                        <Text style={styles.waStepText}>
                          {t.step1Export || 'Open WhatsApp ➔ Open your customer group'}
                        </Text>
                      </View>
                      <View style={styles.waGuideStep}>
                        <Text style={styles.waStepBadge}>2</Text>
                        <Text style={styles.waStepText}>
                          {t.step2Export || 'Tap 3 dots (⋮) ➔ More ➔ Export Chat ➔ Without Media'}
                        </Text>
                      </View>
                      <View style={styles.waGuideStep}>
                        <Text style={styles.waStepBadge}>3</Text>
                        <Text style={styles.waStepText}>
                          {t.step3Export || 'Tap "Select WhatsApp Group" above to pick the file'}
                        </Text>
                      </View>
                    </View>
                  </View>
                ) : (
                  /* --- STEP 2: GROUP SELECTED & MEMBERS SHOWN --- */
                  <View style={{ marginBottom: 14 }}>
                    {/* Active Group Banner with Change Group Button */}
                    <View style={styles.waActiveGroupBanner}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.waActiveGroupTitle} numberOfLines={1}>
                          👥 {whatsappGroupName || t.groupFoundTitle || 'WhatsApp Group'}
                        </Text>
                        <Text style={styles.waActiveGroupSubtitle}>
                          {parsedWhatsAppCustomers.length} {t.groupMembersFound || 'Group Members Found'}
                        </Text>
                      </View>
                      <TouchableOpacity
                        style={styles.waChangeGroupBtn}
                        onPress={handleSelectWhatsAppGroupFile}
                        activeOpacity={0.8}
                      >
                        <Text style={styles.waChangeGroupBtnText}>
                          🔄 {t.changeGroupBtn || 'Change Group'}
                        </Text>
                      </TouchableOpacity>
                    </View>

                    {/* Quick Select / Deselect Bar */}
                    <View style={styles.detectedHeaderRow}>
                      <Text style={styles.detectedTitle}>
                        {parsedWhatsAppCustomers.filter(c => c.isSelected).length} of {parsedWhatsAppCustomers.length} selected
                      </Text>
                      <View style={{ flexDirection: 'row', gap: 10 }}>
                        <TouchableOpacity onPress={() => handleToggleAllWhatsApp(true)}>
                          <Text style={styles.toggleAllText}>{lang === 'hi' ? 'सभी चुनें' : 'Select All'}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => handleToggleAllWhatsApp(false)}>
                          <Text style={styles.toggleAllText}>{lang === 'hi' ? 'हटाएं' : 'Deselect'}</Text>
                        </TouchableOpacity>
                      </View>
                    </View>

                    {/* Members List */}
                    {parsedWhatsAppCustomers.map((cust) => (
                      <View
                        key={cust.id}
                        style={[
                          styles.waCustomerCard,
                          cust.isSelected && styles.waCustomerCardSelected,
                          cust.isExisting && styles.waCustomerCardExisting
                        ]}
                      >
                        {/* Top Row: Checkbox, Name Input & Badges */}
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <TouchableOpacity
                            style={[styles.checkbox, cust.isSelected && styles.checkboxChecked]}
                            onPress={() => handleToggleWhatsAppCustomer(cust.id)}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          >
                            {cust.isSelected && <Text style={styles.checkmark}>✓</Text>}
                          </TouchableOpacity>

                          <TextInput
                            style={styles.waNameInput}
                            value={cust.name}
                            onChangeText={(text) => handleUpdateWhatsAppCustomerName(cust.id, text)}
                            placeholder="Customer Name"
                            placeholderTextColor="#94a3b8"
                          />

                          {cust.isExisting ? (
                            <View style={styles.waExistingBadge}>
                              <Text style={styles.waExistingBadgeText}>
                                {lang === 'hi' ? 'पहले से है' : 'Existing'}
                              </Text>
                            </View>
                          ) : (
                            <View style={styles.waNewBadge}>
                              <Text style={styles.waNewBadgeText}>
                                {lang === 'hi' ? 'नया' : 'New'}
                              </Text>
                            </View>
                          )}
                        </View>

                        {/* Phone Number */}
                        <View style={{ marginTop: 4, marginLeft: 28 }}>
                          <Text style={styles.waPhoneText}>📞 +91 {cust.displayPhone}</Text>
                        </View>

                        {/* Default Order Settings Row */}
                        <View style={styles.waOrderRow}>
                          {/* Litres Stepper */}
                          <View style={styles.waStepperBox}>
                            <TouchableOpacity
                              style={styles.waStepperBtn}
                              onPress={() => handleUpdateWhatsAppCustomerLitres(cust.id, cust.defaultLitres - 0.5)}
                            >
                              <Text style={styles.waStepperBtnText}>-</Text>
                            </TouchableOpacity>
                            <Text style={styles.waStepperValue}>{cust.defaultLitres} L</Text>
                            <TouchableOpacity
                              style={styles.waStepperBtn}
                              onPress={() => handleUpdateWhatsAppCustomerLitres(cust.id, cust.defaultLitres + 0.5)}
                            >
                              <Text style={styles.waStepperBtnText}>+</Text>
                            </TouchableOpacity>
                          </View>

                          {/* Milk Type Chips */}
                          <View style={{ flexDirection: 'row', gap: 6 }}>
                            <TouchableOpacity
                              style={[styles.waTypeChip, cust.milkType === 'cow' && styles.waTypeChipCowActive]}
                              onPress={() => handleUpdateWhatsAppCustomerMilkType(cust.id, 'cow')}
                            >
                              <Text style={[styles.waTypeChipText, cust.milkType === 'cow' && styles.waTypeChipTextActive]}>
                                🐄 Cow
                              </Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={[styles.waTypeChip, cust.milkType === 'buffalo' && styles.waTypeChipBuffaloActive]}
                              onPress={() => handleUpdateWhatsAppCustomerMilkType(cust.id, 'buffalo')}
                            >
                              <Text style={[styles.waTypeChipText, cust.milkType === 'buffalo' && styles.waTypeChipTextActive]}>
                                🐃 Buff
                              </Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      </View>
                    ))}
                  </View>
                )}
              </ScrollView>

              {/* Modal Footer (Only shown when group members are loaded) */}
              {parsedWhatsAppCustomers.length > 0 && (
                <View style={styles.importActionBar}>
                  <Text style={styles.selectedCountText}>
                    {parsedWhatsAppCustomers.filter(c => c.isSelected).length} selected
                  </Text>
                  <TouchableOpacity
                    style={[
                      styles.waImportConfirmBtn,
                      parsedWhatsAppCustomers.filter(c => c.isSelected).length === 0 && styles.importConfirmDisabled
                    ]}
                    onPress={handleBatchImportWhatsApp}
                    disabled={parsedWhatsAppCustomers.filter(c => c.isSelected).length === 0 || isScanningWhatsApp}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.importConfirmBtnText}>
                      {lang === 'hi'
                        ? `✓ सदस्य जोड़ें (${parsedWhatsAppCustomers.filter(c => c.isSelected).length})`
                        : `✓ Import Customers (${parsedWhatsAppCustomers.filter(c => c.isSelected).length})`}
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </View>
        </Modal>

        {/* Add/Edit Modal */}
        <Modal visible={modalVisible} animationType="slide" transparent>
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>
                {editingCustomer ? (t.editCustomer || 'Edit Customer') : (t.addNewCustomer || 'Add New Customer')}
              </Text>

              <Text style={styles.label}>{t.customerNameReq || 'Customer Name *'}</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="e.g. Ramesh Kumar / रमेश कुमार"
                placeholderTextColor="#94a3b8"
                value={name}
                onChangeText={setName}
              />

              <Text style={styles.label}>{t.phoneNumberReq || 'Phone Number (+91) *'}</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="10-digit mobile"
                placeholderTextColor="#94a3b8"
                keyboardType="phone-pad"
                maxLength={20}
                value={phone}
                onChangeText={(val) => setPhone(cleanPhoneInput(val))}
              />

              <Text style={styles.label}>{t.addressLabel || 'Address'}</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="House / Flat / Area / पता"
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
                  <Text style={styles.typeOptionText}>🐄 {t.cowMilk}</Text>
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
                  <Text style={styles.typeOptionText}>🐃 {t.buffaloMilk}</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.rowTwoInputs}>
                <View style={{ flex: 1, marginRight: 8 }}>
                  <Text style={styles.label}>{t.defaultLitresDay || 'Default Litres / Day'}</Text>
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
                  <Text style={styles.label}>{t.ratePerLitreLabel || 'Rate per Litre (₹)'}</Text>
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
  searchRow: {
    marginBottom: 8
  },
  searchInput: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 13,
    color: '#0f172a'
  },
  actionRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12
  },
  contactImportBtn: {
    flex: 1,
    backgroundColor: '#e0f2fe',
    borderWidth: 1,
    borderColor: '#38bdf8',
    paddingVertical: 9,
    paddingHorizontal: 10,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center'
  },
  contactImportBtnText: { color: '#0284c7', fontWeight: 'bold', fontSize: 13 },
  addButton: {
    flex: 1.2,
    backgroundColor: '#0284c7',
    paddingVertical: 9,
    paddingHorizontal: 10,
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
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#f1f5f9'
  },
  editBtnText: { fontSize: 12, color: '#334155', fontWeight: '600' },
  shareCardBtn: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: '#dcfce7',
    borderWidth: 1,
    borderColor: '#bbf7d0'
  },
  shareCardBtnText: { fontSize: 12, color: '#15803d', fontWeight: 'bold' },
  viewCardBtn: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: '#e0f2fe',
    borderWidth: 1,
    borderColor: '#bae6fd'
  },
  viewCardBtnText: { fontSize: 12, color: '#0369a1', fontWeight: 'bold' },
  deleteBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
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
  emailBadgeText: { fontSize: 9.5, color: '#0369a1', fontWeight: '700' },
  webBatchPickerBtn: {
    backgroundColor: '#0284c7',
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: 'center'
  },
  webBatchPickerBtnText: { color: '#ffffff', fontWeight: 'bold', fontSize: 13 },
  vcfPickerBtn: {
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center'
  },
  vcfPickerBtnText: { color: '#334155', fontWeight: '700', fontSize: 12 },
  nameUpdateBadge: {
    backgroundColor: '#fff7ed',
    borderWidth: 1,
    borderColor: '#fed7aa',
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 4
  },
  nameUpdateBadgeText: {
    fontSize: 9.5,
    color: '#c2410c',
    fontWeight: '700'
  },
  nameUpdateDetailText: {
    fontSize: 11,
    color: '#ea580c',
    fontWeight: '600',
    marginTop: 2,
    marginBottom: 2
  },

  // WhatsApp Customer Importer Styles
  whatsappImportBtn: {
    flex: 1,
    backgroundColor: '#dcfce7',
    borderWidth: 1,
    borderColor: '#22c55e',
    paddingVertical: 9,
    paddingHorizontal: 6,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center'
  },
  whatsappImportBtnText: { color: '#15803d', fontWeight: 'bold', fontSize: 12.5 },
  waGroupSelectCard: {
    backgroundColor: '#f0fdf4',
    borderWidth: 1.5,
    borderColor: '#86efac',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginBottom: 14
  },
  waUploadBtn: {
    backgroundColor: '#16a34a',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 20,
    alignItems: 'center',
    width: '100%'
  },
  waUploadBtnText: { color: '#ffffff', fontWeight: 'bold', fontSize: 13.5 },
  waSelectHintText: {
    fontSize: 11.5,
    color: '#16a34a',
    fontWeight: '600',
    marginTop: 8,
    textAlign: 'center'
  },
  waGuideBox: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    padding: 14,
    marginBottom: 16
  },
  waGuideTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 10
  },
  waGuideStep: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8
  },
  waStepBadge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#0284c7',
    color: '#ffffff',
    textAlign: 'center',
    fontSize: 11,
    fontWeight: 'bold',
    lineHeight: 20
  },
  waStepText: {
    fontSize: 12,
    color: '#334155',
    fontWeight: '500',
    flex: 1
  },
  waActiveGroupBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#f0fdf4',
    borderWidth: 1,
    borderColor: '#bbf7d0',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12
  },
  waActiveGroupTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#15803d'
  },
  waActiveGroupSubtitle: {
    fontSize: 11.5,
    color: '#16a34a',
    fontWeight: '600',
    marginTop: 2
  },
  waChangeGroupBtn: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#86efac',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10
  },
  waChangeGroupBtnText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#15803d'
  },
  detectedHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8
  },
  detectedTitle: { fontSize: 13, fontWeight: 'bold', color: '#0f172a' },
  toggleAllText: { fontSize: 12, fontWeight: '600', color: '#0284c7' },
  waCustomerCard: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    padding: 10,
    marginBottom: 8
  },
  waCustomerCardSelected: { borderColor: '#22c55e', backgroundColor: '#f0fdf4' },
  waCustomerCardExisting: { opacity: 0.75 },
  waNameInput: {
    flex: 1,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    fontSize: 13,
    fontWeight: '700',
    color: '#0f172a'
  },
  waPhoneText: { fontSize: 12, color: '#475569', fontWeight: '600' },
  waExistingBadge: {
    backgroundColor: '#f1f5f9',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2
  },
  waExistingBadgeText: { fontSize: 10, color: '#64748b', fontWeight: '600' },
  waNewBadge: {
    backgroundColor: '#dcfce7',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2
  },
  waNewBadgeText: { fontSize: 10, color: '#15803d', fontWeight: '700' },
  waOrderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9'
  },
  waStepperBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    overflow: 'hidden'
  },
  waStepperBtn: { paddingHorizontal: 10, paddingVertical: 4, backgroundColor: '#f8fafc' },
  waStepperBtnText: { fontSize: 14, fontWeight: 'bold', color: '#0f172a' },
  waStepperValue: { paddingHorizontal: 8, fontSize: 12, fontWeight: '700', color: '#0f172a' },
  waTypeChip: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#f8fafc'
  },
  waTypeChipCowActive: { borderColor: '#f59e0b', backgroundColor: '#fef3c7' },
  waTypeChipBuffaloActive: { borderColor: '#6366f1', backgroundColor: '#e0e7ff' },
  waTypeChipText: { fontSize: 11, color: '#64748b', fontWeight: '600' },
  waTypeChipTextActive: { color: '#0f172a', fontWeight: '700' },
  waImportConfirmBtn: {
    backgroundColor: '#16a34a',
    borderRadius: 10,
    paddingVertical: 11,
    paddingHorizontal: 16,
    alignItems: 'center'
  },
  checkboxChecked: { backgroundColor: '#16a34a', borderColor: '#16a34a' },
  checkmark: { color: '#ffffff', fontSize: 13, fontWeight: 'bold' }
});
