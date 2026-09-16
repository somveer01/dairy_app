import { ref, get, set, update } from 'firebase/database';
import { rtdb } from '../config/firebase';
import { StorageService } from './storageService';
import { Supplier, Customer, MilkEntry, Payment, SubSupplier, MilkInwardEntry, SubSupplierPayment } from '../types';

export interface DriveBackupFileItem {
  id: string;
  name: string;
  size: number;
  date: string;
}

export interface DriveSupplierFolderItem {
  folderName: string;
  files: DriveBackupFileItem[];
}

export interface FullSupplierBackupPayload {
  version: string;
  backupType: string;
  exportedAt: string;
  supplier: Supplier;
  customers: Customer[];
  milkEntries: MilkEntry[];
  payments: Payment[];
  subSuppliers: SubSupplier[];
  milkInwardEntries: MilkInwardEntry[];
  subSupplierPayments: SubSupplierPayment[];
  summary: {
    totalCustomers: number;
    totalMilkEntries: number;
    totalPayments: number;
    totalVendors: number;
    totalInward: number;
  };
}

let activeWebhookUrl = '';
if (typeof window !== 'undefined' && window.localStorage) {
  try {
    const saved = window.localStorage.getItem('@dairy_admin_drive_webhook_url');
    if (saved) activeWebhookUrl = saved.trim();
  } catch {}
}

export const GoogleDriveBackupService = {
  getWebhookUrl(): string {
    return activeWebhookUrl;
  },

  async setWebhookUrl(url: string): Promise<void> {
    const clean = url.trim();
    activeWebhookUrl = clean;
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        window.localStorage.setItem('@dairy_admin_drive_webhook_url', clean);
      } catch {}
    }
    try {
      const hookRef = ref(rtdb, 'system/settings/driveWebhookUrl');
      await set(hookRef, clean);
    } catch (e) {
      console.warn('Could not save driveWebhookUrl to cloud:', e);
    }
  },

  async fetchWebhookUrlFromCloud(): Promise<string> {
    try {
      const hookRef = ref(rtdb, 'system/settings/driveWebhookUrl');
      const snap = await get(hookRef);
      if (snap.exists() && typeof snap.val() === 'string' && snap.val().startsWith('http')) {
        activeWebhookUrl = snap.val().trim();
        if (typeof window !== 'undefined' && window.localStorage) {
          try {
            window.localStorage.setItem('@dairy_admin_drive_webhook_url', activeWebhookUrl);
          } catch {}
        }
      }
    } catch (e) {
      console.warn('Could not fetch driveWebhookUrl from cloud:', e);
    }
    return activeWebhookUrl;
  },

  async testConnection(url?: string): Promise<{ success: boolean; message: string }> {
    const targetUrl = (url || this.getWebhookUrl()).trim();
    if (!targetUrl || !targetUrl.startsWith('http')) {
      return { success: false, message: 'Invalid Webhook URL. Must start with https://script.google.com' };
    }

    try {
      const testUrl = `${targetUrl}?action=ping`;
      const res = await fetch(testUrl, { method: 'GET' });
      if (!res.ok) {
        return { success: false, message: `HTTP Error: ${res.status} ${res.statusText}` };
      }
      const data = await res.json();
      if (data.success) {
        return { success: true, message: data.message || 'Connected to Google Drive Webhook successfully!' };
      }
      return { success: false, message: data.message || 'Webhook response error.' };
    } catch (err: any) {
      return { success: false, message: err?.message || 'Could not connect to Google Apps Script Webhook.' };
    }
  },

  async packageSupplierBackup(supplierId: string): Promise<FullSupplierBackupPayload> {
    // 1. Try local data first if matching active supplier
    const localSupp = await StorageService.getSupplier();
    let supplier: Supplier | null = null;
    let customers: Customer[] = [];
    let milkEntries: MilkEntry[] = [];
    let payments: Payment[] = [];
    let subSuppliers: SubSupplier[] = [];
    let milkInwardEntries: MilkInwardEntry[] = [];
    let subSupplierPayments: SubSupplierPayment[] = [];

    if (localSupp && (localSupp.id === supplierId || localSupp.phone.includes(supplierId.replace('supp_', '')))) {
      supplier = localSupp;
      const [c, m, p, ss, mi, sp] = await Promise.all([
        StorageService.getCustomers(localSupp.id),
        StorageService.getMilkEntries(localSupp.id),
        StorageService.getPayments(localSupp.id),
        StorageService.getSubSuppliers(localSupp.id),
        StorageService.getMilkInwardEntries(localSupp.id),
        StorageService.getSubSupplierPayments(localSupp.id)
      ]);
      customers = c;
      milkEntries = m;
      payments = p;
      subSuppliers = ss;
      milkInwardEntries = mi;
      subSupplierPayments = sp;
    } else {
      // Fetch from Cloud RTDB
      try {
        const suppRef = ref(rtdb, `suppliers/${supplierId}`);
        const snap = await get(suppRef);
        if (snap.exists()) {
          const val = snap.val();
          supplier = val.profile || {
            id: supplierId,
            name: 'Supplier',
            phone: supplierId.replace('supp_', ''),
            businessName: 'Dairy Farm',
            createdAt: Date.now()
          };
          customers = val.customers ? Object.values(val.customers) : [];
          milkEntries = val.milkEntries ? Object.values(val.milkEntries) : [];
          payments = val.payments ? Object.values(val.payments) : [];
          subSuppliers = val.subSuppliers ? Object.values(val.subSuppliers) : [];
          milkInwardEntries = val.milkInwardEntries ? Object.values(val.milkInwardEntries) : [];
          subSupplierPayments = val.subSupplierPayments ? Object.values(val.subSupplierPayments) : [];
        }
      } catch (e) {
        console.warn('Could not read supplier data from cloud for backup:', e);
      }
    }

    if (!supplier) {
      supplier = {
        id: supplierId,
        name: 'Supplier',
        phone: supplierId.replace('supp_', ''),
        businessName: 'Dairy Farm',
        createdAt: Date.now()
      };
    }

    return {
      version: '1.0',
      backupType: 'full_supplier_snapshot',
      exportedAt: new Date().toISOString(),
      supplier,
      customers: customers.filter(c => !c.isDeleted),
      milkEntries: milkEntries.filter(m => !m.isDeleted),
      payments: payments.filter(p => !p.isDeleted),
      subSuppliers: subSuppliers.filter(s => !s.isDeleted),
      milkInwardEntries: milkInwardEntries.filter(i => !i.isDeleted),
      subSupplierPayments: subSupplierPayments.filter(sp => !sp.isDeleted),
      summary: {
        totalCustomers: customers.length,
        totalMilkEntries: milkEntries.length,
        totalPayments: payments.length,
        totalVendors: subSuppliers.length,
        totalInward: milkInwardEntries.length
      }
    };
  },

  async uploadBackupToDrive(
    supplierId: string,
    providedPayload?: FullSupplierBackupPayload
  ): Promise<{ success: boolean; message: string; fileUrl?: string }> {
    const webhookUrl = this.getWebhookUrl();
    if (!webhookUrl) {
      return { success: false, message: 'Google Drive Webhook URL is not configured. Please paste it in Admin settings.' };
    }

    try {
      const payload = providedPayload || await this.packageSupplierBackup(supplierId);
      const supplierName = payload.supplier.businessName || payload.supplier.name || 'Dairy';
      const supplierPhone = payload.supplier.phone || supplierId.replace('supp_', '');

      const now = new Date();
      const pad = (n: number) => String(n).padStart(2, '0');
      const dateStr = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}`;
      const fileName = `Backup_${supplierName.replace(/\s+/g, '_')}_${dateStr}.json`;

      const requestBody = {
        action: 'upload',
        supplierName,
        supplierPhone,
        fileName,
        data: payload
      };

      const res = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(requestBody)
      });

      const resText = await res.text();
      let resJson: any = {};
      try {
        resJson = JSON.parse(resText);
      } catch {
        return { success: false, message: `Unexpected response from Google: ${resText.slice(0, 100)}` };
      }

      if (resJson.success) {
        // Record last backup timestamp in Firebase
        try {
          const suppRef = ref(rtdb, `suppliers/${supplierId}/profile`);
          await update(suppRef, { lastDriveBackupAt: Date.now() });
        } catch {}

        return {
          success: true,
          message: `✓ Saved backup for ${supplierName} on Google Drive!`,
          fileUrl: resJson.url
        };
      }

      return { success: false, message: resJson.message || 'Failed to save file to Google Drive.' };
    } catch (err: any) {
      console.warn('Upload to Google Drive error:', err);
      return { success: false, message: err?.message || 'Network error while connecting to Google Drive.' };
    }
  },

  async backupAllSuppliers(
    suppliersList: Array<{ id: string; businessName: string; phone: string }>,
    onProgress?: (current: number, total: number, name: string) => void
  ): Promise<{ success: boolean; successCount: number; failCount: number; errors: string[] }> {
    let successCount = 0;
    let failCount = 0;
    const errors: string[] = [];
    const total = suppliersList.length;

    for (let i = 0; i < total; i++) {
      const s = suppliersList[i];
      if (onProgress) onProgress(i + 1, total, s.businessName || s.phone);
      const res = await this.uploadBackupToDrive(s.id);
      if (res.success) {
        successCount++;
      } else {
        failCount++;
        errors.push(`${s.businessName || s.phone}: ${res.message}`);
      }
    }

    return {
      success: failCount === 0,
      successCount,
      failCount,
      errors
    };
  },

  async listDriveBackups(query?: string): Promise<{ success: boolean; folders: DriveSupplierFolderItem[]; message?: string }> {
    const webhookUrl = this.getWebhookUrl();
    if (!webhookUrl) {
      return { success: false, folders: [], message: 'Google Drive Webhook URL is not configured.' };
    }

    try {
      const q = query ? encodeURIComponent(query.trim()) : '';
      const url = `${webhookUrl}?action=list&query=${q}`;
      const res = await fetch(url, { method: 'GET' });
      const data = await res.json();
      if (data.success && Array.isArray(data.folders)) {
        return { success: true, folders: data.folders };
      }
      return { success: false, folders: [], message: data.message || 'Could not fetch backups from Drive.' };
    } catch (err: any) {
      return { success: false, folders: [], message: err?.message || 'Network error.' };
    }
  },

  async fetchBackupFile(fileId: string): Promise<{ success: boolean; data?: FullSupplierBackupPayload; message?: string }> {
    const webhookUrl = this.getWebhookUrl();
    if (!webhookUrl) {
      return { success: false, message: 'Google Drive Webhook URL is not configured.' };
    }

    try {
      const url = `${webhookUrl}?action=get&fileId=${encodeURIComponent(fileId)}`;
      const res = await fetch(url, { method: 'GET' });
      const json = await res.json();
      if (json.success && json.data) {
        return { success: true, data: json.data };
      }
      return { success: false, message: json.message || 'Failed to download backup file.' };
    } catch (err: any) {
      return { success: false, message: err?.message || 'Network error.' };
    }
  },

  async restoreBackupToDatabase(
    backupData: FullSupplierBackupPayload,
    targetSupplierId: string
  ): Promise<{ success: boolean; message: string }> {
    try {
      if (!backupData || !backupData.supplier) {
        return { success: false, message: 'Invalid backup file. Missing supplier profile.' };
      }

      const suppRef = ref(rtdb, `suppliers/${targetSupplierId}`);
      
      // Convert arrays back to maps for Firebase RTDB
      const custMap: Record<string, Customer> = {};
      (backupData.customers || []).forEach(c => { if (c.id) custMap[c.id] = c; });

      const entryMap: Record<string, MilkEntry> = {};
      (backupData.milkEntries || []).forEach(e => { if (e.id) entryMap[e.id] = e; });

      const payMap: Record<string, Payment> = {};
      (backupData.payments || []).forEach(p => { if (p.id) payMap[p.id] = p; });

      const subSuppMap: Record<string, SubSupplier> = {};
      (backupData.subSuppliers || []).forEach(s => { if (s.id) subSuppMap[s.id] = s; });

      const inwardMap: Record<string, MilkInwardEntry> = {};
      (backupData.milkInwardEntries || []).forEach(i => { if (i.id) inwardMap[i.id] = i; });

      const subPayMap: Record<string, SubSupplierPayment> = {};
      (backupData.subSupplierPayments || []).forEach(sp => { if (sp.id) subPayMap[sp.id] = sp; });

      const now = Date.now();
      const restoreBundle = {
        profile: {
          ...backupData.supplier,
          id: targetSupplierId,
          restoredFromBackupAt: now,
          updatedAt: now
        },
        customers: custMap,
        milkEntries: entryMap,
        payments: payMap,
        subSuppliers: subSuppMap,
        milkInwardEntries: inwardMap,
        subSupplierPayments: subPayMap,
        updatedAt: now
      };

      await set(suppRef, restoreBundle);

      return {
        success: true,
        message: `✓ Successfully restored ${backupData.customers?.length || 0} customers, ${backupData.milkEntries?.length || 0} milk entries, and ${backupData.payments?.length || 0} payments from Google Drive!`
      };
    } catch (err: any) {
      console.warn('Restore error:', err);
      return { success: false, message: err?.message || 'Failed to restore backup data into database.' };
    }
  }
};
