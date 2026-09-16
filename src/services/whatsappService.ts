import * as Linking from 'expo-linking';
import { CustomerDueSummary, SubSupplierDueSummary } from '../types';
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
    const { customer, totalLitresCow, totalLitresBuffalo, totalLitresPacket, totalAddonsAmount, totalAmountBilled, totalPaid, netDue } = summary;

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
    if (totalLitresPacket && totalLitresPacket > 0) {
      itemsText += `\n📦 Packet Milk: ${totalLitresPacket.toFixed(1)} L`;
    }
    if (totalAddonsAmount && totalAddonsAmount > 0) {
      itemsText += `\n🧀 Dairy Products / Add-ons: ₹${totalAddonsAmount.toFixed(0)}`;
    }

    const message = `🥛 *${supplierBusinessName}*
-----------------------------
👤 Customer: *${customer.name}*
📅 Period: ${periodLabel}${itemsText}
💰 Total Amount Billed: ₹${totalAmountBilled.toFixed(2)}
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
    const { customer, totalLitresCow, totalLitresBuffalo, totalLitresPacket, totalAddonsAmount, totalAmountBilled, totalPaid, netDue } = summary;

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
      const dateObj = new Date(y, m - 1, d, 12, 0, 0);
      const dayName = DAYS_SHORT[dateObj.getDay()] || '';
      const dateFormatted = `${formatToDisplayDate(item.date)} (${dayName})`;

      if (item.isDelivered) {
        const details = item.entries
          .map((e: any) => {
            let label = '';
            if (e.isPacketMilk || (e.milkType && e.milkType.startsWith('packet'))) {
              label = `${e.quantityLitres}L [${e.packetBrand || 'Packet'} ${e.packetVariant || ''}]`;
            } else if (e.quantityLitres > 0) {
              label = `${e.quantityLitres}L ${e.milkType === 'cow' ? 'Cow' : 'Buf'}`;
            }
            if (e.addons && e.addons.length > 0) {
              const addonsStr = e.addons.map((a: any) => `${a.productName || a.id} (${a.quantity}${a.unit})`).join('+');
              label = label ? `${label} + 🧀 ${addonsStr}` : `🧀 ${addonsStr}`;
            }
            return `${label} [${e.session}]`;
          })
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
    if (totalLitresPacket && totalLitresPacket > 0) {
      itemsText += `\n📦 Packet Milk: ${totalLitresPacket.toFixed(1)} L`;
    }
    if (totalAddonsAmount && totalAddonsAmount > 0) {
      itemsText += `\n🧀 Dairy Products / Add-ons: ₹${totalAddonsAmount.toFixed(0)}`;
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
💰 Total Amount Billed: ₹${totalAmountBilled.toFixed(2)}
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

  formatSubSupplierStatement(
    summary: SubSupplierDueSummary,
    supplierBusinessName: string,
    periodLabel: string
  ): string {
    const { subSupplier, totalLitresCow, totalLitresBuffalo, totalLitres, totalAmountBilled, totalPaid, netPayable } = summary;

    let itemsText = '';
    if (summary.deliveredDaysCount !== undefined && summary.totalRangeDays !== undefined && summary.totalRangeDays > 0) {
      itemsText += `\n📅 Milk Inward Days: ${summary.deliveredDaysCount} / ${summary.totalRangeDays} Days`;
    } else if (summary.deliveredDaysCount !== undefined && summary.deliveredDaysCount > 0) {
      itemsText += `\n📅 Milk Inward Days: ${summary.deliveredDaysCount} Days`;
    }

    if (totalLitresCow > 0) itemsText += `\n🐄 Cow Milk: ${totalLitresCow.toFixed(1)} L`;
    if (totalLitresBuffalo > 0) itemsText += `\n🐃 Buffalo Milk: ${totalLitresBuffalo.toFixed(1)} L`;
    if (totalLitresCow > 0 && totalLitresBuffalo > 0) itemsText += `\n🥛 Total Milk: ${totalLitres.toFixed(1)} L`;

    return `🌾 *दूध खरीद हिसाब / Milk Purchase Statement*
🥛 *${supplierBusinessName}*
-----------------------------
👤 Vendor/Farmer: *${subSupplier.name}*
📅 Period: ${periodLabel}${itemsText}
💰 Total Milk Amount: ₹${totalAmountBilled.toFixed(2)}
💵 Payment Made: ₹${totalPaid.toFixed(2)}
-----------------------------
⚖️ *Pending Balance Payable: ₹${netPayable.toFixed(2)}*
-----------------------------
Thank you for your milk supply! 🙏`;
  },

  async sendSubSupplierStatementViaWhatsApp(
    phone: string,
    summary: SubSupplierDueSummary,
    supplierBusinessName: string,
    periodLabel: string
  ): Promise<void> {
    const message = this.formatSubSupplierStatement(summary, supplierBusinessName, periodLabel);
    await this.openWhatsAppWithText(phone, message);
  },

  formatItemizedDatewiseSubSupplierBill(
    summary: SubSupplierDueSummary,
    supplierBusinessName: string,
    periodLabel: string,
    auditItems: CustomerDateAuditItem[]
  ): string {
    const { subSupplier, totalLitresCow, totalLitresBuffalo, totalLitres, totalAmountBilled, totalPaid, netPayable } = summary;

    const suppliedDays = auditItems.filter(item => item.isDelivered).length;
    const missingDays = auditItems.filter(item => !item.isDelivered).length;

    let breakdownText = '';
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
        breakdownText += `\n⚠️ ${dateFormatted}: ❌ No Supply / दूध नहीं आया`;
      }
    });

    let itemsText = '';
    if (totalLitresCow > 0) itemsText += `\n🐄 Cow Milk: ${totalLitresCow.toFixed(1)} L`;
    if (totalLitresBuffalo > 0) itemsText += `\n🐃 Buffalo Milk: ${totalLitresBuffalo.toFixed(1)} L`;
    if (totalLitresCow > 0 && totalLitresBuffalo > 0) itemsText += `\n🥛 Total Milk: ${totalLitres.toFixed(1)} L`;

    const message = `🌾 *दूध खरीद तारीख-वार हिसाब / Inward Milk Statement*
🥛 *${supplierBusinessName}*
-----------------------------
👤 Vendor/Farmer: *${subSupplier.name}*
📅 Period: ${periodLabel}
📊 Status: ${suppliedDays} Days Supplied | ${missingDays} Days No Supply (${auditItems.length} Days)
-----------------------------
📅 *DATE-WISE INWARD SUPPLY LOG:*${breakdownText}
-----------------------------
${itemsText}
💰 Total Milk Amount: ₹${totalAmountBilled.toFixed(2)}
💵 Payment Made: ₹${totalPaid.toFixed(2)}
-----------------------------
⚖️ *Pending Balance Payable: ₹${netPayable.toFixed(2)}*
-----------------------------
Thank you for your milk supply! 🙏`;

    return message;
  },

  async sendItemizedDatewiseSubSupplierBillViaWhatsApp(
    phone: string,
    summary: SubSupplierDueSummary,
    supplierBusinessName: string,
    periodLabel: string,
    auditItems: CustomerDateAuditItem[]
  ): Promise<void> {
    const message = this.formatItemizedDatewiseSubSupplierBill(summary, supplierBusinessName, periodLabel, auditItems);
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

