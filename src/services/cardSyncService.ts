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

      const customers = customersParam || (await StorageService.getCustomers());
      const customer = customers.find(c => c.id === customerId);
      if (!customer) return;

      const allEntries = entriesParam || (await StorageService.getMilkEntries());
      const custEntries = allEntries.filter(e => e.customerId === customerId);

      const allPayments = paymentsParam || (await StorageService.getPayments());
      const custPayments = allPayments.filter(p => p.customerId === customerId);

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
      const customers = customersParam || (await StorageService.getCustomers());
      for (const c of customers) {
        await this.syncCustomerCard(c.id, supplierParam, customersParam, entriesParam, paymentsParam);
      }
    } catch (err) {
      console.warn('Sync all cards error:', err);
    }
  }
};
