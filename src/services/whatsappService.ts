import * as Linking from 'expo-linking';
import { CustomerDueSummary } from '../types';
import { formatToDisplayDate } from '../utils/dateUtils';

export interface CustomerDateAuditItem {
  date: string;
  isDelivered: boolean;
  entries: any[];
  totalLitres: number;
  totalAmount: number;
}

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const WhatsAppService = {
  formatDueBill(
    summary: CustomerDueSummary,
    supplierBusinessName: string,
    periodLabel: string
  ): string {
    const { customer, totalLitresCow, totalLitresBuffalo, totalAmountBilled, totalPaid, netDue } = summary;

    let itemsText = '';
    if (summary.deliveredDaysCount !== undefined && summary.totalRangeDays !== undefined && summary.totalRangeDays > 0) {
      itemsText += `\n📅 Milk Delivered: ${summary.deliveredDaysCount} / ${summary.totalRangeDays} Days`;
    } else if (summary.deliveredDaysCount !== undefined && summary.deliveredDaysCount > 0) {
      itemsText += `\n📅 Milk Delivered: ${summary.deliveredDaysCount} Days`;
    }

    if (totalLitresCow > 0) {
      itemsText += `\n🐄 Cow Milk: ${totalLitresCow.toFixed(1)} L`;
    }
    if (totalLitresBuffalo > 0) {
      itemsText += `\n🐃 Buffalo Milk: ${totalLitresBuffalo.toFixed(1)} L`;
    }

    const message = `🥛 *${supplierBusinessName}*
-----------------------------
👤 Customer: *${customer.name}*
📅 Period: ${periodLabel}${itemsText}
💰 Total Milk Billed: ₹${totalAmountBilled.toFixed(2)}
💵 Payment Received: ₹${totalPaid.toFixed(2)}
-----------------------------
🔴 *Total Due Balance: ₹${netDue.toFixed(2)}*
-----------------------------
Please clear the pending balance at your earliest convenience. Thank you!`;

    return message;
  },

  formatItemizedDatewiseBill(
    summary: CustomerDueSummary,
    supplierBusinessName: string,
    periodLabel: string,
    auditItems: CustomerDateAuditItem[]
  ): string {
    const { customer, totalLitresCow, totalLitresBuffalo, totalAmountBilled, totalPaid, netDue } = summary;

    const deliveredDays = auditItems.filter(item => item.isDelivered).length;
    const missingDays = auditItems.filter(item => !item.isDelivered).length;

    let breakdownText = '';
    // Reverse or chronological order for easy reading
    const chronologicalItems = [...auditItems].reverse();
    chronologicalItems.forEach(item => {
      const parts = item.date.split('-');
      const y = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10);
      const d = parseInt(parts[2], 10);
      const dateObj = new Date(y, m - 1, d);
      const dayName = DAYS_SHORT[dateObj.getDay()] || '';
      const dateFormatted = `${formatToDisplayDate(item.date)} (${dayName})`;


      if (item.isDelivered) {
        const details = item.entries
          .map((e: any) => `${e.quantityLitres}L ${e.milkType === 'cow' ? 'Cow' : 'Buf'} [${e.session}]`)
          .join(', ');
        breakdownText += `\n✓ ${dateFormatted}: ${details} = ₹${item.totalAmount.toFixed(0)}`;
      } else {
        breakdownText += `\n⚠️ ${dateFormatted}: ❌ No Milk / Missing`;
      }
    });

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
📊 Status: ${deliveredDays} Days Delivered | ${missingDays} Days Missing (${auditItems.length} Days)
-----------------------------
📅 *DATE-WISE DELIVERY LOG:*${breakdownText}
-----------------------------
${itemsText}
💰 Total Milk Billed: ₹${totalAmountBilled.toFixed(2)}
💵 Payment Received: ₹${totalPaid.toFixed(2)}
-----------------------------
🔴 *Net Due Balance: ₹${netDue.toFixed(2)}*
-----------------------------
Please review and clear the pending balance. Thank you!`;

    return message;
  },

  async sendBillViaWhatsApp(
    phone: string,
    summary: CustomerDueSummary,
    supplierBusinessName: string,
    periodLabel: string
  ): Promise<void> {
    const message = this.formatDueBill(summary, supplierBusinessName, periodLabel);
    await this.openWhatsAppWithText(phone, message);
  },

  async sendItemizedDatewiseBillViaWhatsApp(
    phone: string,
    summary: CustomerDueSummary,
    supplierBusinessName: string,
    periodLabel: string,
    auditItems: CustomerDateAuditItem[]
  ): Promise<void> {
    const message = this.formatItemizedDatewiseBill(summary, supplierBusinessName, periodLabel, auditItems);
    await this.openWhatsAppWithText(phone, message);
  },

  async openWhatsAppWithText(phone: string, message: string): Promise<void> {
    let cleanPhone = phone.replace(/[^0-9]/g, '');
    if (cleanPhone.length === 10) {
      cleanPhone = '91' + cleanPhone;
    }

    const encodedText = encodeURIComponent(message);
    const whatsappAppUrl = `whatsapp://send?phone=${cleanPhone}&text=${encodedText}`;
    const webUrl = `https://wa.me/${cleanPhone}?text=${encodedText}`;

    try {
      const canOpen = await Linking.canOpenURL(whatsappAppUrl);
      if (canOpen) {
        await Linking.openURL(whatsappAppUrl);
      } else {
        await Linking.openURL(webUrl);
      }
    } catch {
      await Linking.openURL(webUrl);
    }
  }
};

