import { Supplier } from '../types';
import { FirebaseSyncService } from './firebaseSyncService';

export type SyncStatus = 'synced' | 'syncing' | 'offline' | 'error';

class AutoSyncEngine {
  private syncTimer: any = null;
  private isSyncing = false;
  private currentStatus: SyncStatus = 'synced';
  private lastSyncedAt: number = Date.now();
  private subscribers: Set<(status: SyncStatus, lastSyncedAt: number) => void> = new Set();
  private activeSupplier: Supplier | null = null;

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        this.setStatus('syncing');
        if (this.activeSupplier) {
          this.queueSync(this.activeSupplier, 500);
        }
      });

      window.addEventListener('offline', () => {
        this.setStatus('offline');
      });
    }
  }

  public setActiveSupplier(supplier: Supplier | null) {
    this.activeSupplier = supplier;
  }

  public getStatus(): SyncStatus {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      return 'offline';
    }
    return this.currentStatus;
  }

  public getLastSyncedAt(): number {
    return this.lastSyncedAt;
  }

  public subscribe(cb: (status: SyncStatus, lastSyncedAt: number) => void): () => void {
    this.subscribers.add(cb);
    cb(this.getStatus(), this.lastSyncedAt);
    return () => this.subscribers.delete(cb);
  }

  private setStatus(status: SyncStatus) {
    this.currentStatus = status;
    this.notify();
  }

  private notify() {
    this.subscribers.forEach(cb => {
      try {
        cb(this.getStatus(), this.lastSyncedAt);
      } catch (e) {
        console.warn('Sync subscriber error:', e);
      }
    });
  }

  /**
   * Queue a sync with 1.5s debounce
   */
  public queueSync(supplier?: Supplier | null, delayMs = 1500) {
    const targetSupplier = supplier || this.activeSupplier;
    if (!targetSupplier || !targetSupplier.id || !targetSupplier.phone || targetSupplier.phone.length < 10) return;
    this.activeSupplier = targetSupplier;

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      this.setStatus('offline');
      return;
    }

    this.setStatus('syncing');

    if (this.syncTimer) {
      clearTimeout(this.syncTimer);
    }

    this.syncTimer = setTimeout(async () => {
      await this.runSync(targetSupplier);
    }, delayMs);
  }

  /**
   * Execute two-way union sync immediately
   */
  public async runSync(supplier: Supplier): Promise<{ success: boolean; message: string }> {
    if (!supplier || !supplier.id || !supplier.phone || supplier.phone.length < 10) {
      return { success: false, message: 'Invalid supplier for sync.' };
    }

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      this.setStatus('offline');
      return { success: false, message: 'Device is offline. Changes saved locally.' };
    }

    if (this.isSyncing) {
      return { success: true, message: 'Sync already in progress.' };
    }

    try {
      this.isSyncing = true;
      this.setStatus('syncing');

      const res = await FirebaseSyncService.twoWaySync(supplier);

      this.lastSyncedAt = Date.now();
      this.setStatus(res.success ? 'synced' : 'error');
      return res;
    } catch (err: any) {
      console.warn('Auto-sync execution error:', err);
      this.setStatus('error');
      return { success: false, message: err?.message || 'Sync failed.' };
    } finally {
      this.isSyncing = false;
    }
  }
}

export const AutoSyncService = new AutoSyncEngine();
