import { ref, set } from 'firebase/database';
import * as Linking from 'expo-linking';
import { rtdb } from '../config/firebase';
import { Customer, MilkEntry, Payment, Supplier } from '../types';
import { StorageService } from './storageService';

export interface CardEntryItem {
  id: string;
  session: string;
  milkType: string;
  quantityLitres: number;
  ratePerLitre: number;
  amount: number;
}

export interface CardPaymentItem {
  id: string;
  date: string;
  amountPaid: number;
  notes?: string;
}

export interface CustomerCardData {
  supplierBusinessName: string;
  supplierName: string;
  supplierPhone: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  milkType: string;
  ratePerLitre: number;
  defaultLitres: number;
  entries: Record<string, CardEntryItem[]>;
  payments: CardPaymentItem[];
  lastUpdated: number;
}

export const CardSyncService = {
  getCardUrl(supplierId: string, customerId: string, isSupplierView = false): string {
    const cleanSuppId = supplierId || 'supp_1';
    const base = `https://somveer01.github.io/dairy_app/card.html?s=${encodeURIComponent(cleanSuppId)}&c=${encodeURIComponent(customerId)}`;
    return isSupplierView ? `${base}&role=supplier` : base;
  },

  async shareCardViaWhatsApp(customer: Customer, supplier: Supplier | null, lang: 'hi' | 'en' = 'hi'): Promise<void> {
    const suppId = supplier?.id || 'supp_1';
    const dairyName = supplier?.businessName || 'डेयरी फ़ार्म';
    const cardUrl = this.getCardUrl(suppId, customer.id);

    let cleanPhone = customer.phone.replace(/\D/g, '');
    if (cleanPhone.length === 10) cleanPhone = '91' + cleanPhone;

    const msgHi = `🥛 *${dairyName}*

नमस्ते ${customer.name} जी! 🙏

यह आपका *ऑनलाइन डिजिटल दूध कार्ड (Digital Milk Card)* है। इसे अपने पास संभाल कर रखें। 
जब भी रोज़ दूध की डिलीवरी दर्ज होगी, यह कार्ड आपके मोबाइल पर अपने-आप अपडेट हो जाएगा:

👉 ${cardUrl}

• आप जब चाहें इस लिंक को खोलकर रोज़ का दूध, कुल लीटर, भाव और बकाया राशि देख सकते हैं।

धन्यवाद! — ${dairyName}`;

    const msgEn = `🥛 *${dairyName}*

Hello ${customer.name}! 🙏

Here is your *Online Digital Milk Card*. Save this link to check your daily milk delivery, rate, and pending balance anytime. It updates automatically:

👉 ${cardUrl}

Thank you! — ${dairyName}`;

    const message = lang === 'hi' ? msgHi : msgEn;
    const whatsappUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;

    try {
      await Linking.openURL(whatsappUrl);
    } catch (err) {
      console.warn('Could not open WhatsApp for card share:', err);
    }
  },

  async deleteCustomerCard(supplierId: string, customerId: string): Promise<void> {
    try {
      const cleanSuppId = supplierId || 'supp_1';
      const cardRef = ref(rtdb, `cards/${cleanSuppId}/${customerId}`);
      await set(cardRef, { isDeleted: true, lastUpdated: Date.now() });
    } catch (err) {
      console.warn('Could not delete customer card on RTDB:', err);
    }
  },

  async syncCustomerCard(
    customerId: string,
    supplierParam?: Supplier | null,
    customersParam?: Customer[],
    entriesParam?: MilkEntry[],
    paymentsParam?: Payment[]
  ): Promise<void> {
    try {
      const supplier = supplierParam || (await StorageService.getSupplier());
      const suppId = supplier?.id || 'supp_1';

      const allCustomers = customersParam || (await StorageService.getCustomers(suppId));
      const customer = allCustomers.find(c => c.id === customerId);
      
      // If customer is deleted or missing, remove/deactivate card in RTDB
      if (!customer || customer.isDeleted) {
        await this.deleteCustomerCard(suppId, customerId);
        return;
      }

      const allEntries = entriesParam || (await StorageService.getMilkEntries(suppId));
      const custEntries = allEntries.filter(e => e.customerId === customerId && !e.isDeleted);

      const allPayments = paymentsParam || (await StorageService.getPayments(suppId));
      const custPayments = allPayments.filter(p => p.customerId === customerId && !p.isDeleted);

      // Group entries by date
      const entriesMap: Record<string, CardEntryItem[]> = {};
      custEntries.forEach(e => {
        if (!entriesMap[e.date]) {
          entriesMap[e.date] = [];
        }
        entriesMap[e.date].push({
          id: e.id,
          session: e.session,
          milkType: e.milkType,
          quantityLitres: e.quantityLitres,
          ratePerLitre: e.ratePerLitre,
          amount: e.amount
        });
      });

      const paymentsList: CardPaymentItem[] = custPayments.map(p => ({
        id: p.id,
        date: p.date,
        amountPaid: p.amountPaid,
        notes: p.notes
      }));

      const cardPayload: CustomerCardData = {
        supplierBusinessName: supplier?.businessName || 'डेयरी फ़ार्म',
        supplierName: supplier?.name || 'सप्लायर',
        supplierPhone: supplier?.phone || '',
        customerId: customer.id,
        customerName: customer.name,
        customerPhone: customer.phone,
        milkType: customer.milkType,
        ratePerLitre: customer.ratePerLitre,
        defaultLitres: customer.defaultLitres,
        entries: entriesMap,
        payments: paymentsList,
        lastUpdated: Date.now()
      };

      const cardRef = ref(rtdb, `cards/${suppId}/${customerId}`);
      await set(cardRef, cardPayload);
    } catch (err) {
      console.warn('Silent card sync error (safe to ignore if offline):', err);
    }
  },

  async syncAllCards(
    supplierParam?: Supplier | null,
    customersParam?: Customer[],
    entriesParam?: MilkEntry[],
    paymentsParam?: Payment[]
  ): Promise<void> {
    try {
      const supplier = supplierParam || (await StorageService.getSupplier());
      const suppId = supplier?.id || 'supp_1';
      const allCustomers = customersParam || (await StorageService.getCustomers(suppId));
      const customers = allCustomers.filter(c => !c.isDeleted);
      if (!customers || customers.length === 0) return;

      const allEntries = (entriesParam || (await StorageService.getMilkEntries(suppId))).filter(e => !e.isDeleted);
      const allPayments = (paymentsParam || (await StorageService.getPayments(suppId))).filter(p => !p.isDeleted);

      // Pre-group entries by customerId and date in single pass: O(E)
      const entriesByCust = new Map<string, Record<string, CardEntryItem[]>>();
      for (let i = 0; i < allEntries.length; i++) {
        const e = allEntries[i];
        if (e.isDeleted) continue;
        let custMap = entriesByCust.get(e.customerId);
        if (!custMap) {
          custMap = {};
          entriesByCust.set(e.customerId, custMap);
        }
        if (!custMap[e.date]) {
          custMap[e.date] = [];
        }
        custMap[e.date].push({
          id: e.id,
          session: e.session,
          milkType: e.milkType,
          quantityLitres: e.quantityLitres,
          ratePerLitre: e.ratePerLitre,
          amount: e.amount
        });
      }

      // Pre-group payments by customerId in single pass: O(P)
      const paymentsByCust = new Map<string, CardPaymentItem[]>();
      for (let i = 0; i < allPayments.length; i++) {
        const p = allPayments[i];
        if (p.isDeleted) continue;
        let list = paymentsByCust.get(p.customerId);
        if (!list) {
          list = [];
          paymentsByCust.set(p.customerId, list);
        }
        list.push({
          id: p.id,
          date: p.date,
          amountPaid: p.amountPaid,
          notes: p.notes
        });
      }

      const now = Date.now();
      const cardsBatch: Record<string, CustomerCardData> = {};

      for (let i = 0; i < customers.length; i++) {
        const customer = customers[i];
        if (customer.isDeleted) continue;
        cardsBatch[customer.id] = {
          supplierBusinessName: supplier?.businessName || 'डेयरी फ़ार्म',
          supplierName: supplier?.name || 'सप्लायर',
          supplierPhone: supplier?.phone || '',
          customerId: customer.id,
          customerName: customer.name,
          customerPhone: customer.phone,
          milkType: customer.milkType,
          ratePerLitre: customer.ratePerLitre,
          defaultLitres: customer.defaultLitres,
          entries: entriesByCust.get(customer.id) || {},
          payments: paymentsByCust.get(customer.id) || [],
          lastUpdated: now
        };
      }

      // 1 single atomic batch write to Firebase Realtime Database
      const cardsRef = ref(rtdb, `cards/${suppId}`);
      await set(cardsRef, cardsBatch);
    } catch (err) {
      console.warn('Sync all cards error:', err);
    }
  }
};
