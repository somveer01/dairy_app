import { ref, onValue, off, update, remove, get } from 'firebase/database';
import { rtdb } from '../config/firebase';
import { OnlinePaymentRequest, Payment, Customer, Supplier, MilkEntry } from '../types';
import { StorageService } from './storageService';
import { CardSyncService } from './cardSyncService';

export const PaymentRequestService = {
  /**
   * Listen to all online payment requests for a supplier in real-time
   */
  listenToPaymentRequests(
    supplierId: string,
    callback: (requests: OnlinePaymentRequest[]) => void
  ): () => void {
    if (!supplierId) {
      callback([]);
      return () => {};
    }

    try {
      const requestsRef = ref(rtdb, `payment_requests/${supplierId}`);
      const unsubscribe = onValue(
        requestsRef,
        snapshot => {
          if (!snapshot.exists()) {
            callback([]);
            return;
          }
          const val = snapshot.val();
          if (!val || typeof val !== 'object') {
            callback([]);
            return;
          }

          const list: OnlinePaymentRequest[] = Object.keys(val).map(key => {
            const item = val[key];
            return {
              id: item.id || key,
              supplierId: item.supplierId || supplierId,
              customerId: item.customerId,
              customerName: item.customerName || 'Customer',
              customerPhone: item.customerPhone || '',
              amount: typeof item.amount === 'number' ? item.amount : parseFloat(item.amount) || 0,
              date: item.date || new Date().toISOString().split('T')[0],
              displayDate: item.displayDate || '',
              status: item.status || 'pending',
              utrOrNote: item.utrOrNote || '',
              requestedAt: item.requestedAt || 0,
              respondedAt: item.respondedAt,
              rejectReason: item.rejectReason
            };
          });

          // Sort by requestedAt descending (newest first)
          list.sort((a, b) => (b.requestedAt || 0) - (a.requestedAt || 0));
          callback(list);
        },
        error => {
          console.warn('[PaymentRequestService] Firebase RTDB listen error:', error);
          callback([]);
        }
      );

      return () => {
        try {
          off(requestsRef);
        } catch {
          // ignore
        }
      };
    } catch (e) {
      console.warn('[PaymentRequestService] Error subscribing:', e);
      return () => {};
    }
  },

  /**
   * Accept an online payment request, record payment into local SQLite/Storage,
   * sync the card in RTDB, and update request status to 'accepted'.
   */
  async acceptPaymentRequest(
    request: OnlinePaymentRequest,
    supplier: Supplier,
    customers: Customer[],
    milkEntries: MilkEntry[],
    currentPayments: Payment[]
  ): Promise<Payment> {
    const paymentId = `pay_upi_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const note = request.utrOrNote
      ? `Online UPI (UTR: ${request.utrOrNote})`
      : 'Online UPI (Self-Confirmed)';

    const newPayment: Payment = {
      id: paymentId,
      supplierId: request.supplierId,
      customerId: request.customerId,
      customerName: request.customerName,
      date: request.date,
      amountPaid: request.amount,
      paymentType: 'regular',
      notes: note,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      isDeleted: false
    };

    // 1. Save payment locally
    await StorageService.savePayment(newPayment);

    // 2. Mark request as 'accepted' in Firebase RTDB
    try {
      const requestRef = ref(rtdb, `payment_requests/${request.supplierId}/${request.id}`);
      await update(requestRef, {
        status: 'accepted',
        respondedAt: Date.now(),
        recordedPaymentId: paymentId
      });
    } catch (e) {
      console.warn('[PaymentRequestService] Failed to update request status in RTDB:', e);
    }

    // 3. Immediately sync the customer's live milk card
    const updatedPayments = [...currentPayments.filter(p => p.id !== paymentId), newPayment];
    try {
      await CardSyncService.syncCustomerCard(
        request.customerId,
        supplier,
        customers,
        milkEntries,
        updatedPayments
      );
    } catch (e) {
      console.warn('[PaymentRequestService] Failed to re-sync card after payment acceptance:', e);
    }

    return newPayment;
  },

  /**
   * Reject an online payment request and update status to 'rejected' with reason.
   */
  async rejectPaymentRequest(
    supplierId: string,
    requestId: string,
    reason?: string
  ): Promise<void> {
    try {
      const requestRef = ref(rtdb, `payment_requests/${supplierId}/${requestId}`);
      await update(requestRef, {
        status: 'rejected',
        rejectReason: reason || 'Bank confirmation not received / mismatched amount',
        respondedAt: Date.now()
      });
    } catch (e) {
      console.warn('[PaymentRequestService] Failed to reject payment request:', e);
      throw e;
    }
  },

  /**
   * Dismiss or delete a processed request from RTDB
   */
  async deletePaymentRequest(supplierId: string, requestId: string): Promise<void> {
    try {
      const requestRef = ref(rtdb, `payment_requests/${supplierId}/${requestId}`);
      await remove(requestRef);
    } catch (e) {
      console.warn('[PaymentRequestService] Failed to delete request:', e);
    }
  }
};
