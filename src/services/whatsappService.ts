import * as Linking from 'expo-linking';
import { CustomerDueSummary } from '../types';

export const WhatsAppService = {
  formatDueBill(
    summary: CustomerDueSummary,
    supplierBusinessName: string,
    periodLabel: string
  ): string {
    const { customer, totalLitresCow, totalLitresBuffalo, totalAmountBilled, totalPaid, netDue } = summary;

    let itemsText = '';
    if (totalLitresCow > 0) {
      itemsText += `\n🐄 Cow Milk: ${totalLitresCow.toFixed(1)} L`;
    }
    if (totalLitresBuffalo > 0) {
      itemsText += `\n🐃 Buffalo Milk: ${totalLitresBuffalo.toFixed(1)} L`;
    }

    const message = `🥛 *${supplierBusinessName}*
-----------------------------
👤 Customer: *${customer.name}*
📅 Period: ${periodLabel}
${itemsText}
💰 Total Milk Billed: ₹${totalAmountBilled.toFixed(2)}
💵 Payment Received: ₹${totalPaid.toFixed(2)}
-----------------------------
🔴 *Total Due Balance: ₹${netDue.toFixed(2)}*
-----------------------------
Please clear the pending balance at your earliest convenience. Thank you!`;

    return message;
  },

  async sendBillViaWhatsApp(
    phone: string,
    summary: CustomerDueSummary,
    supplierBusinessName: string,
    periodLabel: string
  ): Promise<void> {
    const message = this.formatDueBill(summary, supplierBusinessName, periodLabel);
    
    // Strip non-numeric characters and format with Indian country code 91 if not present
    let cleanPhone = phone.replace(/[^0-9]/g, '');
    if (cleanPhone.length === 10) {
      cleanPhone = '91' + cleanPhone;
    }

    const encodedText = encodeURIComponent(message);
    const whatsappAppUrl = `whatsapp://send?phone=${cleanPhone}&text=${encodedText}`;
    const webUrl = `https://wa.me/${cleanPhone}?text=${encodedText}`;

    const canOpen = await Linking.canOpenURL(whatsappAppUrl);
    if (canOpen) {
      await Linking.openURL(whatsappAppUrl);
    } else {
      await Linking.openURL(webUrl);
    }
  }
};
