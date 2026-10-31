import React, { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  TextInput,
  Keyboard,
  Platform,
  Linking,
  FlatList,
  BackHandler,
  ToastAndroid
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useApp } from '../../context/AppContext';
import { StorageService } from '../../services/storageService';
import { InstallAppModal } from '../../components/InstallAppModal';
import { formatToDisplayDate } from '../../utils/dateUtils';
import { showAlert, confirmAction } from '../../utils/alertUtils';
import { Payment, SubSupplierPayment, OnlinePaymentRequest } from '../../types';
import { PaymentRequestService } from '../../services/paymentRequestService';
import { WhatsAppService } from '../../services/whatsappService';

const toLocalIso = (d: Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

interface CustPaymentSummary {
  customerId: string;
  customerName: string;
  phone?: string;
  count: number;
  totalPaid: number;
  latestDate: string;
}

interface SubPaymentSummary {
  subSupplierId: string;
  subSupplierName: string;
  phone?: string;
  count: number;
  totalPaid: number;
  latestDate: string;
}

export const DashboardScreen = ({ navigation }: any) => {
  const {
    t,
    lang,
    supplier,
    setSupplier,
    customers,
    milkEntries,
    payments,
    refreshPayments,
    requireAuth,
    subSuppliers,
    milkInwardEntries,
    subSupplierPayments,
    refreshSubSupplierPayments,
    subscriptionStatus,
    openSubscriptionModal,
    onlinePaymentRequests,
    pendingPaymentRequestsCount
  } = useApp();

  const isHindi = lang === 'hi';
  const todayStr = useMemo(() => toLocalIso(new Date()), []);

  // Metrics for Today
  const todayStats = useMemo(() => {
    const todayEntries = milkEntries.filter(e => !e.isDeleted && e.date === todayStr);

    let cowLitres = 0;
    let buffaloLitres = 0;
    let totalBilled = 0;

    todayEntries.forEach(entry => {
      if (entry.milkType === 'cow') cowLitres += entry.quantityLitres;
      if (entry.milkType === 'buffalo') buffaloLitres += entry.quantityLitres;
      totalBilled += entry.amount;
    });

    return {
      cowLitres,
      buffaloLitres,
      totalLitres: cowLitres + buffaloLitres,
      totalBilled,
      deliveredCount: todayEntries.length
    };
  }, [milkEntries, todayStr]);

  // Metrics for Today's Inward Procurement
  const todayProcurementStats = useMemo(() => {
    const todayInward = (milkInwardEntries || []).filter(e => !e.isDeleted && e.date === todayStr);

    let cowLitres = 0;
    let buffaloLitres = 0;
    let totalPurchaseCost = 0;

    todayInward.forEach(entry => {
      if (entry.milkType === 'cow') cowLitres += entry.quantityLitres;
      if (entry.milkType === 'buffalo') buffaloLitres += entry.quantityLitres;
      totalPurchaseCost += entry.amount;
    });

    return {
      cowLitres,
      buffaloLitres,
      totalLitres: cowLitres + buffaloLitres,
      totalPurchaseCost,
      inwardCount: todayInward.length
    };
  }, [milkInwardEntries, todayStr]);

  // Total Sub-Supplier Outward Payable Across All Vendors
  const overallSubPayable = useMemo(() => {
    const totalProcuredAmount = (milkInwardEntries || []).filter(e => !e.isDeleted).reduce((sum, e) => sum + e.amount, 0);
    const totalPaymentsGiven = (subSupplierPayments || []).filter(p => !p.isDeleted).reduce((sum, p) => sum + p.amountPaid, 0);
    return Math.max(0, totalProcuredAmount - totalPaymentsGiven);
  }, [milkInwardEntries, subSupplierPayments]);

  // Stock Balance (Inward litres - Delivered litres today)
  const stockBalanceLitres = todayProcurementStats.totalLitres - todayStats.totalLitres;
  // Daily Margin (Sales revenue - Purchase cost today)
  const todayMargin = todayStats.totalBilled - todayProcurementStats.totalPurchaseCost;

  // Customer balances: calculate per-customer so advance of one customer does not hide due of another
  const { overallDue, overallAdvance } = useMemo(() => {
    const activeCustomers = customers.filter(c => !c.isDeleted);
    const deliveriesByCust = new Map<string, number>();
    milkEntries.filter(e => !e.isDeleted).forEach(e => {
      deliveriesByCust.set(e.customerId, (deliveriesByCust.get(e.customerId) || 0) + e.amount);
    });

    const paymentsByCust = new Map<string, number>();
    payments.filter(p => !p.isDeleted).forEach(p => {
      paymentsByCust.set(p.customerId, (paymentsByCust.get(p.customerId) || 0) + p.amountPaid);
    });

    let dueSum = 0;
    let advSum = 0;

    activeCustomers.forEach(c => {
      const billed = deliveriesByCust.get(c.id) || 0;
      const paid = paymentsByCust.get(c.id) || 0;
      const bal = billed - paid;
      if (bal > 0.01) {
        dueSum += bal;
      } else if (bal < -0.01) {
        advSum += Math.abs(bal);
      }
    });

    return { overallDue: dueSum, overallAdvance: advSum };
  }, [customers, milkEntries, payments]);

  // Total Received Payments All Time
  const totalReceivedAllTime = useMemo(() => {
    return payments.filter(p => !p.isDeleted).reduce((sum, p) => sum + p.amountPaid, 0);
  }, [payments]);

  // Customer-Wise Payment Summaries (Grouped by customer)
  const customerPaymentSummaries = useMemo(() => {
    const map = new Map<string, CustPaymentSummary>();
    const activeCustomers = customers.filter(c => !c.isDeleted);

    payments.filter(p => !p.isDeleted).forEach(p => {
      const cust = activeCustomers.find(c => c.id === p.customerId);
      const key = p.customerId || p.customerName;
      const name = p.customerName || cust?.name || (isHindi ? 'अज्ञात ग्राहक' : 'Unknown Customer');
      const phone = cust?.phone || '';

      if (!map.has(key)) {
        map.set(key, {
          customerId: key,
          customerName: name,
          phone,
          count: 1,
          totalPaid: p.amountPaid,
          latestDate: p.date
        });
      } else {
        const existing = map.get(key)!;
        existing.count += 1;
        existing.totalPaid += p.amountPaid;
        if (p.date > existing.latestDate) {
          existing.latestDate = p.date;
        }
      }
    });

    return Array.from(map.values()).sort((a, b) => b.latestDate.localeCompare(a.latestDate));
  }, [payments, customers, isHindi]);

  // Selected Customer for Detailed Payment Receipts Modal
  const [selectedCustPayment, setSelectedCustPayment] = useState<CustPaymentSummary | null>(null);

  // Filtered payment receipts for the selected customer
  const selectedCustPaymentList = useMemo(() => {
    if (!selectedCustPayment) return [];
    return payments
      .filter(p => !p.isDeleted && (p.customerId === selectedCustPayment.customerId || p.customerName === selectedCustPayment.customerName))
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [payments, selectedCustPayment]);

  // Quick Action: Delete individual payment from dashboard history modal
  const handleDeletePaymentFromDashboard = (paymentId: string) => {
    requireAuth(() => {
      confirmAction(
        isHindi ? 'भुगतान रसीद हटाएं?' : 'Delete Payment Receipt?',
        isHindi
          ? 'क्या आप वाकई इस भुगतान रसीद को हटाना चाहते हैं? हटाने पर हिसाब में यह राशि दोबारा बकाया में जुड़ जाएगी।'
          : 'Are you sure you want to delete this payment receipt? Outstanding balance will be updated accordingly.',
        async () => {
          await StorageService.deletePayment(paymentId, supplier?.id);
          await refreshPayments();
          showAlert(isHindi ? '✓ रसीद हटाई गई' : '✓ Receipt Deleted', isHindi ? 'भुगतान रसीद हटा दी गई है।' : 'Payment receipt removed.');
        },
        isHindi ? 'हटाएं' : 'Delete',
        isHindi ? 'रद्द करें' : 'Cancel',
        true
      );
    });
  };

  // State for editing dairy name modal
  const [editDairyModalVisible, setEditDairyModalVisible] = useState(false);
  const [dairyNameInput, setDairyNameInput] = useState('');
  const [ownerNameInput, setOwnerNameInput] = useState('');

  // Payment History Modal State
  const [payHistoryVisible, setPayHistoryVisible] = useState(false);
  const [payHistoryParty, setPayHistoryParty] = useState<'customers' | 'subSuppliers'>('customers');

  // Sub-Supplier Payment Summaries (Grouped by sub-supplier/vendor)
  const subSupplierPaymentSummaries = useMemo(() => {
    const map = new Map<string, SubPaymentSummary>();
    const activeSubSuppliers = subSuppliers.filter(s => !s.isDeleted);

    (subSupplierPayments || []).filter(p => !p.isDeleted).forEach(p => {
      const sub = activeSubSuppliers.find(s => s.id === p.subSupplierId);
      const key = p.subSupplierId || p.subSupplierName || 'unknown';
      const name = p.subSupplierName || sub?.name || (isHindi ? 'अज्ञात सप्लायर' : 'Unknown Vendor');
      const phone = sub?.phone || '';

      if (!map.has(key)) {
        map.set(key, {
          subSupplierId: key,
          subSupplierName: name,
          phone,
          count: 1,
          totalPaid: p.amountPaid,
          latestDate: p.date
        });
      } else {
        const existing = map.get(key)!;
        existing.count += 1;
        existing.totalPaid += p.amountPaid;
        if (p.date > existing.latestDate) {
          existing.latestDate = p.date;
        }
      }
    });

    return Array.from(map.values()).sort((a, b) => b.latestDate.localeCompare(a.latestDate));
  }, [subSupplierPayments, subSuppliers, isHindi]);

  // Total Paid to Sub-Suppliers All Time
  const totalSubPaidAllTime = useMemo(() => {
    return (subSupplierPayments || []).filter(p => !p.isDeleted).reduce((sum, p) => sum + p.amountPaid, 0);
  }, [subSupplierPayments]);

  // All Sub-Supplier Payments sorted chronologically (Newest first)
  const sortedSubPayments = useMemo(() => {
    return [...(subSupplierPayments || [])].sort((a, b) => {
      const timeA = new Date(a.date).getTime() || a.createdAt || 0;
      const timeB = new Date(b.date).getTime() || b.createdAt || 0;
      return timeB - timeA;
    });
  }, [subSupplierPayments]);

  // Selected sub-supplier for drill-down view in Payment History modal
  const [selectedPaymentSubId, setSelectedPaymentSubId] = useState<string | null>(null);
  const [paymentSubSearch, setPaymentSubSearch] = useState('');

  const filteredSubSummaries = useMemo(() => {
    if (!paymentSubSearch.trim()) return subSupplierPaymentSummaries;
    const q = paymentSubSearch.trim().toLowerCase();
    return subSupplierPaymentSummaries.filter(
      s => s.subSupplierName.toLowerCase().includes(q) || (s.phone && s.phone.includes(q))
    );
  }, [subSupplierPaymentSummaries, paymentSubSearch]);

  const selectedSubPayments = useMemo(() => {
    if (!selectedPaymentSubId) return [];
    return (subSupplierPayments || [])
      .filter(p => p.subSupplierId === selectedPaymentSubId || (!p.subSupplierId && p.subSupplierName === selectedPaymentSubId) || p.subSupplierName === selectedPaymentSubId)
      .sort((a, b) => {
        const timeA = new Date(a.date).getTime() || a.createdAt || 0;
        const timeB = new Date(b.date).getTime() || b.createdAt || 0;
        return timeB - timeA;
      });
  }, [subSupplierPayments, selectedPaymentSubId]);

  const selectedSubSummary = useMemo(() => {
    if (!selectedPaymentSubId) return null;
    return subSupplierPaymentSummaries.find(s => s.subSupplierId === selectedPaymentSubId) || null;
  }, [subSupplierPaymentSummaries, selectedPaymentSubId]);

  // Quick Action: Delete individual sub-supplier payment from dashboard history modal
  const handleDeleteSubPaymentFromDashboard = (paymentId: string) => {
    requireAuth(() => {
      confirmAction(
        isHindi ? 'सप्लायर भुगतान रिकॉर्ड हटाएं?' : 'Delete Vendor Payment Record?',
        isHindi
          ? 'क्या आप वाकई इस भुगतान रिकॉर्ड को हटाना चाहते हैं? हटाने पर सप्लायर के बकाया (देय राशि) में यह राशि दोबारा जुड़ जाएगी।'
          : 'Are you sure you want to delete this payment record? Outstanding balance will be updated accordingly.',
        async () => {
          await StorageService.deleteSubSupplierPayment(paymentId, supplier?.id);
          await refreshSubSupplierPayments();
          showAlert(
            isHindi ? '✓ भुगतान हटाया गया' : '✓ Payment Deleted',
            isHindi ? 'सप्लायर भुगतान रिकॉर्ड हटा दिया गया है।' : 'Vendor payment record removed.'
          );
        },
        isHindi ? 'हटाएं' : 'Delete',
        isHindi ? 'रद्द करें' : 'Cancel',
        true
      );
    });
  };

  // Automatically prompt if authenticated supplier profile has placeholder/default name
  useEffect(() => {
    if (
      supplier &&
      supplier.phone &&
      supplier.phone.length >= 10 &&
      (supplier.businessName === 'Om Fresh Dairy Farm' ||
        supplier.name === 'Om Dairy Supplier' ||
        supplier.businessName === 'Fresh Milk Dairy' ||
        supplier.businessName === 'Krishna Fresh Dairy' ||
        !supplier.businessName)
    ) {
      setDairyNameInput(supplier.businessName === 'Om Fresh Dairy Farm' ? '' : supplier.businessName);
      setOwnerNameInput(supplier.name === 'Om Dairy Supplier' ? '' : supplier.name);
      setEditDairyModalVisible(true);
    }
  }, [supplier]);

  // Filtered Customer Summaries by search term
  const [paymentCustSearch, setPaymentCustSearch] = useState('');
  const filteredCustSummaries = useMemo(() => {
    if (!paymentCustSearch.trim()) return customerPaymentSummaries;
    const q = paymentCustSearch.trim().toLowerCase();
    return customerPaymentSummaries.filter(
      c => c.customerName.toLowerCase().includes(q) || (c.phone && c.phone.includes(q))
    );
  }, [customerPaymentSummaries, paymentCustSearch]);

  // All Payments sorted chronologically (Newest first)
  const sortedPayments = useMemo(() => {
    return [...payments].sort((a, b) => {
      const timeA = new Date(a.date).getTime() || a.createdAt || 0;
      const timeB = new Date(b.date).getTime() || b.createdAt || 0;
      return timeB - timeA;
    });
  }, [payments]);

  // Selected customer for drill-down view in Payment History modal
  const [selectedPaymentCustId, setSelectedPaymentCustId] = useState<string | null>(null);
  const [paymentViewMode, setPaymentViewMode] = useState<'customer' | 'all'>('customer');

  const selectedCustPayments = useMemo(() => {
    if (!selectedPaymentCustId) return [];
    return payments
      .filter(p => p.customerId === selectedPaymentCustId || (!p.customerId && p.customerName === selectedPaymentCustId) || p.customerName === selectedPaymentCustId)
      .sort((a, b) => {
        const timeA = new Date(a.date).getTime() || a.createdAt || 0;
        const timeB = new Date(b.date).getTime() || b.createdAt || 0;
        return timeB - timeA;
      });
  }, [payments, selectedPaymentCustId]);

  const selectedCustSummary = useMemo(() => {
    if (!selectedPaymentCustId) return null;
    return customerPaymentSummaries.find(c => c.customerId === selectedPaymentCustId) || null;
  }, [customerPaymentSummaries, selectedPaymentCustId]);

  // Double-tap hardware back button to exit on Android Dashboard
  const lastBackPressRef = useRef<number>(0);

  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        // If Payment History Modal is open, step back inside it
        if (payHistoryVisible) {
          if (selectedPaymentCustId) {
            setSelectedPaymentCustId(null);
          } else if (selectedPaymentSubId) {
            setSelectedPaymentSubId(null);
          } else {
            setPayHistoryVisible(false);
          }
          return true;
        }

        // If Edit Dairy Profile modal is open, close it
        if (editDairyModalVisible) {
          setEditDairyModalVisible(false);
          return true;
        }

        const now = Date.now();
        if (now - lastBackPressRef.current < 2000) {
          BackHandler.exitApp();
          return true;
        }

        lastBackPressRef.current = now;
        if (Platform.OS === 'android') {
          ToastAndroid.show(
            isHindi ? 'बाहर निकलने के लिए दोबारा दबाएं' : 'Press back again to exit',
            ToastAndroid.SHORT
          );
        }
        return true;
      };

      const sub = BackHandler.addEventListener('hardwareBackPress', onBackPress);
      return () => sub.remove();
    }, [payHistoryVisible, selectedPaymentCustId, selectedPaymentSubId, editDairyModalVisible, isHindi])
  );


  const handleSaveDairyProfile = async () => {
    Keyboard.dismiss();
    const finalBusiness = dairyNameInput.trim() || 'My Dairy Farm';
    const finalOwner = ownerNameInput.trim() || supplier?.name || 'Dairy Supplier';

    const updated = {
      ...(supplier || { id: 'supp_1', createdAt: Date.now() }),
      phone: supplier?.phone || '',
      businessName: finalBusiness,
      name: finalOwner
    };

    await StorageService.saveSupplier(updated);
    setSupplier(updated);
    setEditDairyModalVisible(false);
  };

  // App Install Banner & Modal State
  const [installModalVisible, setInstallModalVisible] = useState(false);
  const [showInstallBanner, setShowInstallBanner] = useState(false);

  useEffect(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const isStandalone =
        window.matchMedia('(display-mode: standalone)').matches ||
        (window.navigator as any).standalone === true ||
        (typeof document !== 'undefined' && document.referrer.includes('android-app://'));

      const isDismissed = sessionStorage.getItem('dairy_install_banner_dismissed') === 'true';
      if (!isStandalone && !isDismissed) {
        setShowInstallBanner(true);
      }
    }
  }, []);

  const handleOpenInstall = () => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const prompt = (window as any).pwaDeferredPrompt;
      if (prompt) {
        prompt.prompt();
        prompt.userChoice.then((choice: any) => {
          if (choice.outcome === 'accepted') {
            setShowInstallBanner(false);
          }
          (window as any).pwaDeferredPrompt = null;
        });
        return;
      }
    }
    setInstallModalVisible(true);
  };

  // Online Payment Request States & Logic
  const [onlinePayModalVisible, setOnlinePayModalVisible] = useState(false);
  const [onlinePayActiveTab, setOnlinePayActiveTab] = useState<'pending' | 'history'>('pending');
  const [isProcessingRequestId, setIsProcessingRequestId] = useState<string | null>(null);
  const [rejectPromptModalVisible, setRejectPromptModalVisible] = useState(false);
  const [requestToReject, setRequestToReject] = useState<OnlinePaymentRequest | null>(null);
  const [rejectReasonInput, setRejectReasonInput] = useState('');

  const pendingRequestsList = useMemo(() => {
    return (onlinePaymentRequests || []).filter(r => r.status === 'pending');
  }, [onlinePaymentRequests]);

  const historyRequestsList = useMemo(() => {
    return (onlinePaymentRequests || []).filter(r => r.status !== 'pending');
  }, [onlinePaymentRequests]);

  const formatTimeAgo = (ts?: number): string => {
    if (!ts) return '';
    const diffSec = Math.floor((Date.now() - ts) / 1000);
    if (diffSec < 60) return isHindi ? 'अभी-अभी' : 'Just now';
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return isHindi ? `${diffMin} मिनट पहले` : `${diffMin}m ago`;
    const diffHour = Math.floor(diffMin / 60);
    if (diffHour < 24) return isHindi ? `${diffHour} घंटे पहले` : `${diffHour}h ago`;
    const diffDays = Math.floor(diffHour / 24);
    return isHindi ? `${diffDays} दिन पहले` : `${diffDays}d ago`;
  };

  const handleAcceptOnlinePayment = async (req: OnlinePaymentRequest) => {
    requireAuth(async () => {
      try {
        setIsProcessingRequestId(req.id);
        await PaymentRequestService.acceptPaymentRequest(
          req,
          supplier!,
          customers,
          milkEntries,
          payments
        );
        await refreshPayments();

        // Send WhatsApp confirmation to the customer
        if (req.customerPhone) {
          const displayDate = req.displayDate || formatToDisplayDate(req.date);
          await WhatsAppService.sendPaymentAcceptedWhatsApp(
            req.customerPhone,
            req.customerName,
            req.amount,
            displayDate,
            supplier?.businessName || 'Dairy Farm',
            isHindi ? 'hi' : 'en'
          );
        }

        showAlert(
          isHindi ? '✓ भुगतान दर्ज किया गया' : '✓ Payment Recorded',
          isHindi
            ? `${req.customerName} की ₹${req.amount.toFixed(2)} की UPI पेमेंट सफलतापूर्वक ऐप में जोड़ दी गई है और ग्राहक का कार्ड अपडेट कर दिया गया है।`
            : `Payment of ₹${req.amount.toFixed(2)} for ${req.customerName} has been recorded and the customer's card is updated.`
        );
      } catch (e: any) {
        console.error('Error accepting payment request:', e);
        showAlert(
          isHindi ? 'त्रुटि' : 'Error',
          isHindi ? 'भुगतान स्वीकार करने में समस्या आई। कृपया पुनः प्रयास करें।' : 'Could not accept payment request. Please try again.'
        );
      } finally {
        setIsProcessingRequestId(null);
      }
    });
  };

  const handleOpenRejectPrompt = (req: OnlinePaymentRequest) => {
    setRequestToReject(req);
    setRejectReasonInput(isHindi ? 'बैंक खाते में राशि प्राप्त नहीं हुई / mismatch' : 'Payment not credited to bank account');
    setRejectPromptModalVisible(true);
  };

  const handleConfirmRejectOnlinePayment = async () => {
    if (!requestToReject || !supplier?.id) return;
    const req = requestToReject;
    const reason = rejectReasonInput.trim();

    try {
      setIsProcessingRequestId(req.id);
      setRejectPromptModalVisible(false);

      await PaymentRequestService.rejectPaymentRequest(supplier.id, req.id, reason);

      if (req.customerPhone) {
        const displayDate = req.displayDate || formatToDisplayDate(req.date);
        await WhatsAppService.sendPaymentRejectedWhatsApp(
          req.customerPhone,
          req.customerName,
          req.amount,
          displayDate,
          supplier?.businessName || 'Dairy Farm',
          reason,
          isHindi ? 'hi' : 'en'
        );
      }

      showAlert(
        isHindi ? 'भुगतान अस्वीकृत' : 'Payment Rejected',
        isHindi
          ? `${req.customerName} का भुगतान अनुरोध अस्वीकृत कर दिया गया है और ग्राहक को व्हाट्सएप पर सूचना भेजी गई है।`
          : `Payment request for ${req.customerName} was rejected and customer was notified via WhatsApp.`
      );
    } catch (e) {
      console.error('Error rejecting payment request:', e);
      showAlert(
        isHindi ? 'त्रुटि' : 'Error',
        isHindi ? 'अस्वीकृत करने में समस्या आई।' : 'Could not reject payment request.'
      );
    } finally {
      setIsProcessingRequestId(null);
      setRequestToReject(null);
    }
  };

  const handleDeleteOnlinePaymentRequest = (req: OnlinePaymentRequest) => {
    if (!supplier?.id) return;
    confirmAction(
      isHindi ? 'अनुरोध हटाएं?' : 'Delete Request?',
      isHindi ? `क्या आप ${req.customerName} का यह अनुरोध हटाना चाहते हैं?` : `Do you want to remove this request for ${req.customerName}?`,
      async () => {
        await PaymentRequestService.deletePaymentRequest(supplier.id, req.id);
        showAlert(
          isHindi ? 'हटा दिया गया' : 'Deleted',
          isHindi ? 'अनुरोध हटा दिया गया है।' : 'Request removed.'
        );
      },
      isHindi ? 'हटाएं' : 'Delete',
      isHindi ? 'रद्द करें' : 'Cancel',
      true
    );
  };

  // 1-Tap Customer Call
  const handleCallCustomer = (phone: string) => {
    const cleanPhone = phone.replace(/[^0-9]/g, '');
    if (!cleanPhone) {
      showAlert(isHindi ? 'फ़ोन नंबर उपलब्ध नहीं' : 'No Phone Number', isHindi ? 'इस ग्राहक का फ़ोन नंबर दर्ज नहीं है।' : 'No phone number for this customer.');
      return;
    }
    Linking.openURL(`tel:${cleanPhone}`).catch(() => {
      showAlert(isHindi ? 'कॉल त्रुटि' : 'Call Error', isHindi ? 'फ़ोन डायलर नहीं खुल सका।' : 'Could not open phone dialer.');
    });
  };

  // 1-Tap Customer WhatsApp
  const handleWhatsAppCustomer = (phone: string, name: string) => {
    let cleanPhone = phone.replace(/[^0-9]/g, '');
    if (!cleanPhone) {
      showAlert(isHindi ? 'फ़ोन नंबर उपलब्ध नहीं' : 'No Phone Number', isHindi ? 'इस ग्राहक का फ़ोन नंबर दर्ज नहीं है।' : 'No phone number for this customer.');
      return;
    }
    if (cleanPhone.length === 10) cleanPhone = '91' + cleanPhone;
    const msg = encodeURIComponent(
      isHindi
        ? `नमस्ते ${name} जी, ${supplier?.businessName || 'डेयरी'} से संपर्क किया जा रहा है।`
        : `Hello ${name}, contacting you from ${supplier?.businessName || 'Dairy'}.`
    );
    Linking.openURL(`https://wa.me/${cleanPhone}?text=${msg}`).catch(() => {
      showAlert(isHindi ? 'व्हाट्सएप त्रुटि' : 'WhatsApp Error', isHindi ? 'व्हाट्सएप नहीं खुल सका।' : 'Could not open WhatsApp.');
    });
  };

  // Delete Payment Record
  const handleDeletePayment = (payment: Payment) => {
    confirmAction(
      isHindi ? 'भुगतान रिकॉर्ड हटाएं' : 'Delete Payment Record',
      isHindi
        ? `क्या आप सचमुच ₹${payment.amountPaid} का भुगतान (${formatToDisplayDate(payment.date)}) हटाना चाहते हैं?`
        : `Are you sure you want to delete payment of ₹${payment.amountPaid} recorded on ${formatToDisplayDate(payment.date)}?`,
      async () => {
        await StorageService.deletePayment(payment.id);
        await refreshPayments();
        showAlert(
          isHindi ? 'हटाया गया' : 'Deleted',
          isHindi ? 'भुगतान रिकॉर्ड सफलतापूर्वक हटा दिया गया।' : 'Payment record deleted successfully.'
        );
      },
      undefined,
      isHindi ? 'हटाएं' : 'Delete',
      true
    );
  };

  // 6 Sleek Quick Links Configuration
  const quickLinks = [
    {
      id: 'morning',
      title: isHindi ? 'सुबह का दूध' : 'Morning Milk',
      sub: isHindi ? 'एंट्री करें' : 'Log Delivery',
      icon: '🌅',
      bg: '#fef3c7',
      border: '#fde68a',
      onPress: () => navigation.navigate('RegisterTab', { session: 'Morning', mode: 'delivery', _t: Date.now() })
    },
    {
      id: 'evening',
      title: isHindi ? 'शाम का दूध' : 'Evening Milk',
      sub: isHindi ? 'एंट्री करें' : 'Log Delivery',
      icon: '🌇',
      bg: '#ffedd5',
      border: '#fed7aa',
      onPress: () => navigation.navigate('RegisterTab', { session: 'Evening', mode: 'delivery', _t: Date.now() })
    },
    {
      id: 'add_cust',
      title: isHindi ? 'नया ग्राहक' : 'Add Customer',
      sub: isHindi ? '+ जोड़ें' : '+ Register',
      icon: '👤',
      bg: '#ecfdf5',
      border: '#a7f3d0',
      onPress: () => navigation.navigate('CustomersTab', { action: 'add_customer', directoryMode: 'customers', _t: Date.now() })
    },
    {
      id: 'contacts',
      title: isHindi ? 'फ़ोन संपर्क' : 'Contacts',
      sub: isHindi ? 'आयात करें' : 'Import List',
      icon: '📱',
      bg: '#eff6ff',
      border: '#bfdbfe',
      onPress: () => navigation.navigate('CustomersTab', { action: 'import_contacts', directoryMode: 'customers', _t: Date.now() })
    },
    {
      id: 'monthly_rep',
      title: isHindi ? 'मासिक हिसाब' : 'Monthly Bill',
      sub: isHindi ? 'हिसाब देखें' : 'View Dues',
      icon: '📅',
      bg: '#f5f3ff',
      border: '#ddd6fe',
      onPress: () => navigation.navigate('ReportsTab', { reportMode: 'month', partyMode: 'customers', _t: Date.now() })
    },
    {
      id: 'wa_bill',
      title: isHindi ? 'व्हाट्सएप बिल' : 'WhatsApp Bill',
      sub: isHindi ? 'बिल भेजें' : 'Send Due Bill',
      icon: '💬',
      bg: '#f0fdf4',
      border: '#bbf7d0',
      onPress: () => navigation.navigate('ReportsTab', { reportMode: 'month', partyMode: 'customers', dueFilter: 'dueOnly', _t: Date.now() })
    },
    {
      id: 'procure',
      title: isHindi ? 'दूध खरीद (आवक)' : 'Milk Purchase',
      sub: isHindi ? 'आवक दर्ज करें' : 'Log Inward',
      icon: '📥',
      bg: '#f0fdf4',
      border: '#bbf7d0',
      onPress: () => navigation.navigate('RegisterTab', { mode: 'procurement', _t: Date.now() })
    },
    {
      id: 'sub_suppliers',
      title: isHindi ? 'दूध विक्रेता' : 'Sub-Suppliers',
      sub: isHindi ? 'किसान सूची' : 'Vendor List',
      icon: '🚜',
      bg: '#fef9c3',
      border: '#fef08a',
      onPress: () => navigation.navigate('CustomersTab', { directoryMode: 'subSuppliers', _t: Date.now() })
    }
  ];

  return (
    <SafeAreaView style={styles.safeArea} edges={['left', 'right']}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="always"
        showsVerticalScrollIndicator={false}
      >
        {/* Dairy Name Header */}
        <View style={styles.header}>
          <TouchableOpacity
            style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 }}
            onPress={() => {
              requireAuth(() => {
                setDairyNameInput(supplier?.businessName === 'Om Fresh Dairy Farm' ? '' : (supplier?.businessName || ''));
                setOwnerNameInput(supplier?.name === 'Om Dairy Supplier' ? '' : (supplier?.name || ''));
                setEditDairyModalVisible(true);
              });
            }}
            activeOpacity={0.7}
          >
            <Text style={styles.greeting} numberOfLines={1}>
              {supplier?.businessName || supplier?.name || (isHindi ? 'डेयरी का नाम सेट करें' : 'Set Dairy Name')}
            </Text>
            <Text style={{ fontSize: 13 }}>✏️</Text>
          </TouchableOpacity>

          {/* Quick Notification Bell for Online Payments */}
          <TouchableOpacity
            style={[
              styles.headerBellBtn,
              pendingPaymentRequestsCount > 0 && styles.headerBellBtnActive
            ]}
            onPress={() => {
              setOnlinePayActiveTab('pending');
              setOnlinePayModalVisible(true);
            }}
            activeOpacity={0.8}
          >
            <Text style={{ fontSize: 18 }}>🔔</Text>
            {pendingPaymentRequestsCount > 0 && (
              <View style={styles.headerBellBadge}>
                <Text style={styles.headerBellBadgeText}>{pendingPaymentRequestsCount}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* Active Online Payment Request Notification Banner */}
        {pendingPaymentRequestsCount > 0 && (
          <TouchableOpacity
            style={styles.onlinePayBannerCard}
            onPress={() => {
              setOnlinePayActiveTab('pending');
              setOnlinePayModalVisible(true);
            }}
            activeOpacity={0.88}
          >
            <View style={styles.onlinePayIconBadge}>
              <Text style={{ fontSize: 20 }}>📲</Text>
              <View style={styles.onlinePayCountBubble}>
                <Text style={styles.onlinePayCountBubbleText}>{pendingPaymentRequestsCount}</Text>
              </View>
            </View>
            <View style={{ flex: 1, paddingHorizontal: 8 }}>
              <Text style={styles.onlinePayBannerTitle}>
                {isHindi
                  ? `${pendingPaymentRequestsCount} नए ऑनलाइन UPI भुगतान प्राप्त`
                  : `${pendingPaymentRequestsCount} New Online UPI Payment(s)`}
              </Text>
              <Text style={styles.onlinePayBannerSub}>
                {isHindi
                  ? 'ग्राहकों ने कार्ड से पेमेंट की पुष्टि भेजी है — 1-टैप में जांचें व दर्ज करें'
                  : 'Customer confirmed UPI payment on Milk Card — 1-Tap review & save'}
              </Text>
            </View>
            <View style={styles.onlinePayActionPill}>
              <Text style={styles.onlinePayActionPillText}>
                {isHindi ? 'जांचें' : 'Review'} →
              </Text>
            </View>
          </TouchableOpacity>
        )}

        {/* App Installation Prompt Card (Web browser mode) */}
        {showInstallBanner && (
          <View style={styles.installBannerCard}>
            <View style={styles.installBannerIconBox}>
              <Text style={{ fontSize: 22 }}>📲</Text>
            </View>
            <View style={{ flex: 1, paddingHorizontal: 6 }}>
              <Text style={styles.installBannerTitle}>Install App on Phone</Text>
              <Text style={styles.installBannerSub}>मोबाइल पर ऐप इंस्टॉल करें (1-टैप में खोलें)</Text>
            </View>
            <TouchableOpacity
              style={styles.installBannerBtn}
              onPress={handleOpenInstall}
              activeOpacity={0.8}
            >
              <Text style={styles.installBannerBtnText}>Install</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => {
                setShowInstallBanner(false);
                if (typeof window !== 'undefined') {
                  sessionStorage.setItem('dairy_install_banner_dismissed', 'true');
                }
              }}
              style={styles.installBannerClose}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Text style={styles.installBannerCloseText}>✕</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* PAIRED METRIC CARDS (Total Outstanding Due + Payment History in the SAME Space) */}
        <View style={styles.pairedMetricsRow}>
          {/* Card 1: Total Due */}
          <TouchableOpacity
            style={styles.dueCardCompact}
            onPress={() => navigation.navigate('ReportsTab')}
            activeOpacity={0.85}
          >
            <View style={styles.metricCardHeader}>
              <Text style={styles.metricCardIcon}>⚠️</Text>
              <View style={styles.metricBadgeRed}>
                <Text style={styles.metricBadgeRedText}>{customers.length} {isHindi ? 'ग्राहक' : 'Cust'}</Text>
              </View>
            </View>
            <Text style={styles.metricLabelRed}>{isHindi ? 'कुल बकाया' : 'Total Due'}</Text>
            <Text style={styles.metricAmountRed} numberOfLines={1}>₹{overallDue.toFixed(0)}</Text>
            <View style={styles.metricActionRow}>
              <Text style={styles.metricActionRed}>{isHindi ? 'हिसाब देखें' : 'View Dues'} →</Text>
              {overallAdvance > 0 && (
                <Text style={{ fontSize: 10, color: '#16a34a', fontWeight: 'bold' }}>
                  (₹{overallAdvance.toFixed(0)} {isHindi ? 'जमा' : 'Adv'})
                </Text>
              )}
            </View>
          </TouchableOpacity>

          {/* Card 2: Payment History (Tapping opens Customer-Wise Payment History) */}
          <TouchableOpacity
            style={styles.paymentCardCompact}
            onPress={() => {
              setPayHistoryParty('customers');
              setSelectedPaymentCustId(null);
              setPaymentCustSearch('');
              setPaymentViewMode('customer');
              setPayHistoryVisible(true);
            }}
            activeOpacity={0.85}
          >
            <View style={styles.metricCardHeader}>
              <Text style={styles.metricCardIcon}>💰</Text>
              <View style={styles.metricBadgeGreen}>
                <Text style={styles.metricBadgeGreenText}>{payments.length} {isHindi ? 'भुगतान' : 'Paid'}</Text>
              </View>
            </View>
            <Text style={styles.metricLabelGreen}>{isHindi ? 'कुल भुगतान' : 'Total Payments'}</Text>
            <Text style={styles.metricAmountGreen} numberOfLines={1}>₹{totalReceivedAllTime.toFixed(0)}</Text>
            <View style={styles.metricActionRow}>
              <Text style={styles.metricActionGreen}>{isHindi ? 'इतिहास देखें' : 'History'} →</Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* Interactive Today's Deliveries Section */}
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionHeading}>
            {t.todayDeliveries || "Today's Deliveries"} ({formatToDisplayDate(todayStr)})
          </Text>
          <TouchableOpacity
            onPress={() => navigation.navigate('RegisterTab')}
            activeOpacity={0.7}
          >
            <Text style={styles.seeAllText}>{isHindi ? 'रजिस्टर खोलें →' : 'Open Register →'}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.statsGrid}>
          {/* Cow Milk Box */}
          <TouchableOpacity
            style={[styles.statBox, { backgroundColor: '#fef3c7' }]}
            onPress={() => navigation.navigate('RegisterTab')}
            activeOpacity={0.8}
          >
            <Text style={styles.milkEmoji}>🐄</Text>
            <Text style={styles.statNumber}>{todayStats.cowLitres.toFixed(1)} L</Text>
            <Text style={styles.statLabel}>{t.cowMilk}</Text>
          </TouchableOpacity>

          {/* Buffalo Milk Box */}
          <TouchableOpacity
            style={[styles.statBox, { backgroundColor: '#e0e7ff' }]}
            onPress={() => navigation.navigate('RegisterTab')}
            activeOpacity={0.8}
          >
            <Text style={styles.milkEmoji}>🐃</Text>
            <Text style={styles.statNumber}>{todayStats.buffaloLitres.toFixed(1)} L</Text>
            <Text style={styles.statLabel}>{t.buffaloMilk}</Text>
          </TouchableOpacity>
        </View>

        {/* Total billed today card (Interactive) */}
        <TouchableOpacity
          style={styles.todayBilledCard}
          onPress={() => navigation.navigate('RegisterTab')}
          activeOpacity={0.8}
        >
          <View>
            <Text style={styles.statSmallLabel}>{t.todayBilled}</Text>
            <Text style={styles.todayBilledAmount}>₹{todayStats.totalBilled.toFixed(2)}</Text>
          </View>
          <View style={styles.deliveredCountBadge}>
            <Text style={styles.deliveredCountText}>
              ✓ {todayStats.deliveredCount} / {customers.length} {isHindi ? 'डिलीवर' : 'Delivered'}
            </Text>
          </View>
        </TouchableOpacity>

        {/* PROCUREMENT & STOCK BALANCE CARD (दूध खरीद, आवक एवं स्टॉक संतुलन) */}
        <View style={styles.procurementCard}>
          <View style={styles.procurementHeaderRow}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={{ fontSize: 18 }}>📥</Text>
              <Text style={styles.procurementTitle}>
                {isHindi ? 'दूध खरीद एवं स्टॉक संतुलन' : 'Procurement & Stock Balance'}
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => navigation.navigate('RegisterTab', { mode: 'procurement', _t: Date.now() })}
              activeOpacity={0.7}
            >
              <Text style={styles.procurementLinkText}>
                {isHindi ? 'आवक रजिस्टर →' : 'Inward Log →'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* 3 Metric Mini-Blocks */}
          <View style={styles.procurementGrid}>
            {/* 1. Today Bought */}
            <View style={styles.procurementTile}>
              <Text style={styles.procurementTileLabel}>{isHindi ? 'आज खरीदा' : 'Bought Today'}</Text>
              <Text style={styles.procurementTileVal}>{todayProcurementStats.totalLitres.toFixed(1)} L</Text>
              <Text style={styles.procurementTileSub}>
                🐄 {todayProcurementStats.cowLitres.toFixed(1)}L • 🐃 {todayProcurementStats.buffaloLitres.toFixed(1)}L
              </Text>
            </View>

            {/* 2. Stock Balance */}
            <View
              style={[
                styles.procurementTile,
                {
                  backgroundColor: stockBalanceLitres >= 0 ? '#f0fdf4' : '#fef2f2',
                  borderColor: stockBalanceLitres >= 0 ? '#bbf7d0' : '#fecaca'
                }
              ]}
            >
              <Text style={styles.procurementTileLabel}>{isHindi ? 'स्टॉक बैलेंस' : 'Stock Balance'}</Text>
              <Text
                style={[
                  styles.procurementTileVal,
                  { color: stockBalanceLitres >= 0 ? '#15803d' : '#b91c1c' }
                ]}
              >
                {stockBalanceLitres >= 0 ? `+${stockBalanceLitres.toFixed(1)}` : stockBalanceLitres.toFixed(1)} L
              </Text>
              <Text style={styles.procurementTileSub}>
                {stockBalanceLitres >= 0 ? (isHindi ? '✓ पर्याप्त' : '✓ In Stock') : (isHindi ? 'कम बिक्री' : 'Deficit')}
              </Text>
            </View>

            {/* 3. Daily Margin */}
            <View
              style={[
                styles.procurementTile,
                {
                  backgroundColor: todayMargin >= 0 ? '#eff6ff' : '#fff1f2',
                  borderColor: todayMargin >= 0 ? '#bfdbfe' : '#fecdd3'
                }
              ]}
            >
              <Text style={styles.procurementTileLabel}>{isHindi ? 'अनुमानित बचत' : 'Est. Margin'}</Text>
              <Text
                style={[
                  styles.procurementTileVal,
                  { color: todayMargin >= 0 ? '#0369a1' : '#be123c' }
                ]}
              >
                {todayMargin >= 0 ? `+₹${todayMargin.toFixed(0)}` : `-₹${Math.abs(todayMargin).toFixed(0)}`}
              </Text>
              <Text style={styles.procurementTileSub}>
                {isHindi ? 'बिक्री - खरीद' : 'Sales - Cost'}
              </Text>
            </View>
          </View>

          {/* Sub-Supplier Payable & Action Footer */}
          <View style={styles.procurementFooterRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.procurementFooterLabel}>
                {isHindi ? 'सप्लायर देय (किसान बकाया):' : 'Vendor Payables:'}
              </Text>
              <Text style={styles.procurementFooterAmount}>₹{overallSubPayable.toFixed(0)}</Text>
            </View>

            <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
              <TouchableOpacity
                style={styles.procurementHistoryBtn}
                onPress={() => {
                  setPayHistoryParty('subSuppliers');
                  setSelectedPaymentSubId(null);
                  setPaymentSubSearch('');
                  setPaymentViewMode('customer');
                  setPayHistoryVisible(true);
                }}
                activeOpacity={0.8}
              >
                <Text style={styles.procurementHistoryBtnText}>
                  📋 {isHindi ? 'इतिहास' : 'History'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.procurementActionBtn}
                onPress={() => navigation.navigate('ReportsTab')}
                activeOpacity={0.8}
              >
                <Text style={styles.procurementActionBtnText}>
                  💳 {isHindi ? 'भुगतान करें' : 'Pay'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* SLEEK QUICK LINKS (2x4 Grid - Recognizable Icons, Non-Bulky) */}
        <Text style={styles.sectionHeading}>{t.quickActions || 'Quick Actions'}</Text>
        <View style={styles.quickLinksGrid}>
          {quickLinks.map(link => (
            <TouchableOpacity
              key={link.id}
              style={[styles.quickLinkTile, { backgroundColor: link.bg, borderColor: link.border }]}
              onPress={link.onPress}
              activeOpacity={0.75}
            >
              <View style={styles.quickLinkIconBox}>
                <Text style={styles.quickLinkIconText}>{link.icon}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.quickLinkTitle} numberOfLines={1}>{link.title}</Text>
                <Text style={styles.quickLinkSub} numberOfLines={1}>{link.sub}</Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>

        {/* Customers Overview with 1-Tap Call & WhatsApp */}
        <View style={styles.customerHeaderRow}>
          <Text style={styles.sectionHeading}>
            {t.customers} ({customers.length})
          </Text>
          <TouchableOpacity
            onPress={() => navigation.navigate('CustomersTab')}
            activeOpacity={0.7}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Text style={styles.seeAllText}>{isHindi ? 'सभी देखें →' : 'See All →'}</Text>
          </TouchableOpacity>
        </View>

        {customers.slice(0, 4).map(customer => (
          <View key={customer.id} style={styles.customerCard}>
            <View style={styles.customerInfo}>
              <Text style={styles.customerName}>{customer.name}</Text>
              <Text style={styles.customerSub}>
                {customer.milkType === 'cow' ? '🐄 Cow' : '🐃 Buffalo'} • {customer.defaultLitres} L/day @ ₹{customer.ratePerLitre}/L
              </Text>
            </View>

            {/* Quick Contact Actions */}
            <View style={styles.customerActionsRow}>
              {customer.phone ? (
                <>
                  <TouchableOpacity
                    style={styles.customerActionBtnCall}
                    onPress={() => handleCallCustomer(customer.phone)}
                    activeOpacity={0.7}
                    hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                  >
                    <Text style={styles.customerActionIcon}>📞</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.customerActionBtnWhatsApp}
                    onPress={() => handleWhatsAppCustomer(customer.phone, customer.name)}
                    activeOpacity={0.7}
                    hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                  >
                    <Text style={styles.customerActionIcon}>💬</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <Text style={styles.noPhoneText}>-</Text>
              )}
            </View>
          </View>
        ))}
      </ScrollView>

      {/* EMBEDDED PAYMENT HISTORY MODAL (Customer-Wise & Drill-Down) */}
      <Modal
        visible={payHistoryVisible}
        transparent
        animationType="slide"
        onRequestClose={() => {
          if (selectedPaymentCustId) {
            setSelectedPaymentCustId(null);
          } else if (selectedPaymentSubId) {
            setSelectedPaymentSubId(null);
          } else {
            setPayHistoryVisible(false);
          }
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.payHistoryModalContent}>

            {/* SCENARIO A1: CUSTOMER DETAIL DRILL-DOWN VIEW */}
            {selectedPaymentCustId ? (
              <>
                <View style={styles.payHistoryHeader}>
                  <TouchableOpacity
                    style={styles.payBackBtn}
                    onPress={() => setSelectedPaymentCustId(null)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.payBackBtnText}>‹ {isHindi ? 'वापस' : 'Back'}</Text>
                  </TouchableOpacity>
                  <View style={{ flex: 1, paddingHorizontal: 10 }}>
                    <Text style={styles.payHistoryTitle} numberOfLines={1}>
                      {selectedCustSummary?.customerName || (isHindi ? 'ग्राहक भुगतान' : 'Customer Payments')}
                    </Text>
                    <Text style={styles.payHistorySub}>
                      {isHindi
                        ? `कुल भुगतान: ₹${selectedCustSummary?.totalPaid.toFixed(0) || 0} (${selectedCustPayments.length} बार)`
                        : `Total Paid: ₹${selectedCustSummary?.totalPaid.toFixed(0) || 0} (${selectedCustPayments.length} payments)`}
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => setPayHistoryVisible(false)}
                    style={styles.modalCloseBtn}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <Text style={styles.modalCloseBtnText}>✕</Text>
                  </TouchableOpacity>
                </View>

                {selectedCustPayments.length === 0 ? (
                  <View style={styles.emptyPayState}>
                    <Text style={{ fontSize: 36, marginBottom: 8 }}>💳</Text>
                    <Text style={styles.emptyPayText}>
                      {isHindi ? 'इस ग्राहक का कोई भुगतान रिकॉर्ड नहीं है।' : 'No payment records for this customer.'}
                    </Text>
                    <TouchableOpacity
                      style={styles.backLinkBtn}
                      onPress={() => setSelectedPaymentCustId(null)}
                    >
                      <Text style={styles.backLinkBtnText}>‹ {isHindi ? 'सभी ग्राहकों पर वापस जाएं' : 'Back to all customers'}</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <FlatList
                    data={selectedCustPayments}
                    keyExtractor={item => item.id}
                    contentContainerStyle={{ paddingVertical: 8 }}
                    showsVerticalScrollIndicator={false}
                    renderItem={({ item }) => (
                      <View style={styles.payRecordCard}>
                        <View style={{ flex: 1 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <Text style={styles.payRecordDate}>📅 {formatToDisplayDate(item.date)}</Text>
                            <View style={styles.payModeBadge}>
                              <Text style={styles.payModeText}>PAID</Text>
                            </View>
                          </View>
                          {item.notes ? (
                            <Text style={styles.payRecordNotes} numberOfLines={1}>📝 {item.notes}</Text>
                          ) : null}
                        </View>

                        <View style={{ alignItems: 'flex-end', marginLeft: 10 }}>
                          <Text style={styles.payRecordAmount}>+₹{item.amountPaid.toFixed(0)}</Text>
                          <TouchableOpacity
                            style={styles.payDeleteBtn}
                            onPress={() => handleDeletePayment(item)}
                            activeOpacity={0.7}
                            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                          >
                            <Text style={styles.payDeleteBtnText}>🗑️ {isHindi ? 'हटाएं' : 'Delete'}</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    )}
                  />
                )}
              </>
            ) : selectedPaymentSubId ? (
              /* SCENARIO A2: SUB-SUPPLIER (VENDOR) DETAIL DRILL-DOWN VIEW */
              <>
                <View style={styles.payHistoryHeader}>
                  <TouchableOpacity
                    style={styles.payBackBtn}
                    onPress={() => setSelectedPaymentSubId(null)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.payBackBtnText}>‹ {isHindi ? 'वापस' : 'Back'}</Text>
                  </TouchableOpacity>
                  <View style={{ flex: 1, paddingHorizontal: 10 }}>
                    <Text style={styles.payHistoryTitle} numberOfLines={1}>
                      {selectedSubSummary?.subSupplierName || (isHindi ? 'सप्लायर भुगतान' : 'Vendor Payments')}
                    </Text>
                    <Text style={[styles.payHistorySub, { color: '#ea580c' }]}>
                      {isHindi
                        ? `कुल भुगतान दिया: ₹${selectedSubSummary?.totalPaid.toFixed(0) || 0} (${selectedSubPayments.length} बार)`
                        : `Total Paid: ₹${selectedSubSummary?.totalPaid.toFixed(0) || 0} (${selectedSubPayments.length} payments)`}
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => setPayHistoryVisible(false)}
                    style={styles.modalCloseBtn}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <Text style={styles.modalCloseBtnText}>✕</Text>
                  </TouchableOpacity>
                </View>

                {selectedSubPayments.length === 0 ? (
                  <View style={styles.emptyPayState}>
                    <Text style={{ fontSize: 36, marginBottom: 8 }}>🚜</Text>
                    <Text style={styles.emptyPayText}>
                      {isHindi ? 'इस सप्लायर का कोई भुगतान रिकॉर्ड नहीं है।' : 'No payment records for this vendor.'}
                    </Text>
                    <TouchableOpacity
                      style={styles.backLinkBtn}
                      onPress={() => setSelectedPaymentSubId(null)}
                    >
                      <Text style={styles.backLinkBtnText}>‹ {isHindi ? 'सभी सप्लायर पर वापस जाएं' : 'Back to all vendors'}</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <FlatList
                    data={selectedSubPayments}
                    keyExtractor={item => item.id}
                    contentContainerStyle={{ paddingVertical: 8 }}
                    showsVerticalScrollIndicator={false}
                    renderItem={({ item }) => (
                      <View style={styles.payRecordCard}>
                        <View style={{ flex: 1 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <Text style={styles.payRecordDate}>📅 {formatToDisplayDate(item.date)}</Text>
                            <View style={[styles.payModeBadge, { backgroundColor: '#ffedd5' }]}>
                              <Text style={[styles.payModeText, { color: '#c2410c' }]}>{item.paymentMode || 'PAID'}</Text>
                            </View>
                          </View>
                          {item.notes ? (
                            <Text style={styles.payRecordNotes} numberOfLines={1}>📝 {item.notes}</Text>
                          ) : null}
                        </View>

                        <View style={{ alignItems: 'flex-end', marginLeft: 10 }}>
                          <Text style={[styles.payRecordAmount, { color: '#ea580c' }]}>-₹{item.amountPaid.toFixed(0)}</Text>
                          <TouchableOpacity
                            style={styles.payDeleteBtn}
                            onPress={() => handleDeleteSubPaymentFromDashboard(item.id)}
                            activeOpacity={0.7}
                            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                          >
                            <Text style={styles.payDeleteBtnText}>🗑️ {isHindi ? 'हटाएं' : 'Delete'}</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    )}
                  />
                )}
              </>
            ) : (
              /* SCENARIO B: MAIN PAYMENT OVERVIEW (Customer vs Vendor Totals & Records) */
              <>
                <View style={styles.payHistoryHeader}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={{ fontSize: 24 }}>{payHistoryParty === 'customers' ? '💰' : '🚜'}</Text>
                    <View>
                      <Text style={styles.payHistoryTitle}>
                        {payHistoryParty === 'customers'
                          ? (isHindi ? 'ग्राहक भुगतान इतिहास' : 'Customer Payment History')
                          : (isHindi ? 'सप्लायर भुगतान इतिहास' : 'Vendor Payment History')}
                      </Text>
                      <Text style={[styles.payHistorySub, payHistoryParty === 'subSuppliers' && { color: '#ea580c' }]}>
                        {payHistoryParty === 'customers'
                          ? (isHindi
                            ? `कुल प्राप्त: ₹${totalReceivedAllTime.toFixed(0)} • ${customerPaymentSummaries.length} ग्राहक`
                            : `Total In: ₹${totalReceivedAllTime.toFixed(0)} • ${customerPaymentSummaries.length} Customers`)
                          : (isHindi
                            ? `कुल दिया: ₹${totalSubPaidAllTime.toFixed(0)} • ${subSupplierPaymentSummaries.length} सप्लायर`
                            : `Total Out: ₹${totalSubPaidAllTime.toFixed(0)} • ${subSupplierPaymentSummaries.length} Vendors`)}
                      </Text>
                    </View>
                  </View>
                  <TouchableOpacity
                    onPress={() => setPayHistoryVisible(false)}
                    style={styles.modalCloseBtn}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <Text style={styles.modalCloseBtnText}>✕</Text>
                  </TouchableOpacity>
                </View>

                {/* Party Switcher: Customers vs Sub-Suppliers */}
                <View style={styles.partySwitcherRow}>
                  <TouchableOpacity
                    style={[styles.partySwitcherBtn, payHistoryParty === 'customers' && styles.partySwitcherBtnActive]}
                    onPress={() => {
                      setPayHistoryParty('customers');
                      setSelectedPaymentCustId(null);
                    }}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.partySwitcherText, payHistoryParty === 'customers' && styles.partySwitcherTextActive]}>
                      👥 {isHindi ? 'ग्राहक भुगतान (प्राप्ति)' : 'Customer In'} ({payments.length})
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.partySwitcherBtn, payHistoryParty === 'subSuppliers' && styles.partySwitcherBtnActiveSub]}
                    onPress={() => {
                      setPayHistoryParty('subSuppliers');
                      setSelectedPaymentSubId(null);
                    }}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.partySwitcherText, payHistoryParty === 'subSuppliers' && styles.partySwitcherTextActive]}>
                      🚜 {isHindi ? 'सप्लायर भुगतान (खर्च)' : 'Vendor Out'} ({subSupplierPayments?.length || 0})
                    </Text>
                  </TouchableOpacity>
                </View>

                {payHistoryParty === 'customers' ? (
                  /* ---------------- CUSTOMER PAYMENTS CONTENT ---------------- */
                  <>
                    {/* View Switcher: Customer-Wise (Default) vs All Records */}
                    <View style={styles.payTabRow}>
                      <TouchableOpacity
                        style={[styles.payTabBtn, paymentViewMode === 'customer' && styles.payTabBtnActive]}
                        onPress={() => setPaymentViewMode('customer')}
                        activeOpacity={0.7}
                      >
                        <Text style={[styles.payTabBtnText, paymentViewMode === 'customer' && styles.payTabBtnTextActive]}>
                          👥 {isHindi ? 'ग्राहक अनुसार कुल' : 'Customer Wise'} ({customerPaymentSummaries.length})
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.payTabBtn, paymentViewMode === 'all' && styles.payTabBtnActive]}
                        onPress={() => setPaymentViewMode('all')}
                        activeOpacity={0.7}
                      >
                        <Text style={[styles.payTabBtnText, paymentViewMode === 'all' && styles.payTabBtnTextActive]}>
                          📋 {isHindi ? 'सभी भुगतान' : 'All Payments'} ({payments.length})
                        </Text>
                      </TouchableOpacity>
                    </View>

                    {payments.length === 0 ? (
                      <View style={styles.emptyPayState}>
                        <Text style={{ fontSize: 40, marginBottom: 8 }}>💳</Text>
                        <Text style={styles.emptyPayText}>
                          {isHindi ? 'अभी तक कोई भुगतान दर्ज नहीं है।' : 'No payment records found.'}
                        </Text>
                        <Text style={styles.emptyPaySub}>
                          {isHindi ? 'बकाया रिपोर्ट से भुगतान दर्ज करें।' : 'Record payments from the Due Reports tab.'}
                        </Text>
                      </View>
                    ) : paymentViewMode === 'customer' ? (
                      /* 1. CUSTOMER-WISE TOTAL PAYMENTS LIST */
                      <>
                        <View style={styles.paySearchBox}>
                          <Text style={{ fontSize: 13, marginRight: 6 }}>🔍</Text>
                          <TextInput
                            style={styles.paySearchInput}
                            placeholder={isHindi ? 'ग्राहक का नाम या फ़ोन खोजें...' : 'Search customer name or phone...'}
                            placeholderTextColor="#94a3b8"
                            value={paymentCustSearch}
                            onChangeText={setPaymentCustSearch}
                          />
                          {paymentCustSearch ? (
                            <TouchableOpacity onPress={() => setPaymentCustSearch('')} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                              <Text style={{ fontSize: 12, color: '#94a3b8', fontWeight: 'bold' }}>✕</Text>
                            </TouchableOpacity>
                          ) : null}
                        </View>

                        <Text style={styles.custWiseHint}>
                          {isHindi ? '👇 ग्राहक पर क्लिक करके उसके सभी भुगतान देखें:' : '👇 Tap customer to view all their payments:'}
                        </Text>

                        <FlatList
                          data={filteredCustSummaries}
                          keyExtractor={item => item.customerId}
                          contentContainerStyle={{ paddingVertical: 4 }}
                          showsVerticalScrollIndicator={false}
                          renderItem={({ item }) => (
                            <TouchableOpacity
                              style={styles.custPaySummaryCard}
                              onPress={() => setSelectedPaymentCustId(item.customerId)}
                              activeOpacity={0.7}
                            >
                              <View style={{ flex: 1, paddingRight: 6 }}>
                                <Text style={styles.custPaySummaryName}>{item.customerName}</Text>
                                <Text style={styles.custPaySummarySub}>
                                  {item.phone ? `📞 ${item.phone} • ` : ''}
                                  {item.count} {isHindi ? 'बार भुगतान' : 'payments'}
                                </Text>
                                <Text style={styles.custPayLatestDate}>
                                  {isHindi ? `अंतिम: ${formatToDisplayDate(item.latestDate)}` : `Latest: ${formatToDisplayDate(item.latestDate)}`}
                                </Text>
                              </View>
                              <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                                <View style={styles.custPayTotalBadge}>
                                  <Text style={styles.custPayTotalLabel}>{isHindi ? 'कुल' : 'Total'}</Text>
                                  <Text style={styles.custPayTotalText}>₹{item.totalPaid.toFixed(0)}</Text>
                                </View>
                                <Text style={styles.drillDownArrow}>›</Text>
                              </View>
                            </TouchableOpacity>
                          )}
                        />
                      </>
                    ) : (
                      /* 2. CHRONOLOGICAL ALL PAYMENTS LIST */
                      <FlatList
                        data={sortedPayments}
                        keyExtractor={item => item.id}
                        contentContainerStyle={{ paddingVertical: 8 }}
                        showsVerticalScrollIndicator={false}
                        renderItem={({ item }) => {
                          const cust = customers.find(c => c.id === item.customerId);
                          const custName = item.customerName || cust?.name || (isHindi ? 'अज्ञात ग्राहक' : 'Unknown Customer');
                          return (
                            <View style={styles.payRecordCard}>
                              <View style={{ flex: 1 }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                  <Text style={styles.payRecordName}>{custName}</Text>
                                  <View style={styles.payModeBadge}>
                                    <Text style={styles.payModeText}>PAID</Text>
                                  </View>
                                </View>
                                <Text style={styles.payRecordDate}>📅 {formatToDisplayDate(item.date)}</Text>
                                {item.notes ? (
                                  <Text style={styles.payRecordNotes} numberOfLines={1}>📝 {item.notes}</Text>
                                ) : null}
                              </View>

                              <View style={{ alignItems: 'flex-end', marginLeft: 10 }}>
                                <Text style={styles.payRecordAmount}>+₹{item.amountPaid.toFixed(0)}</Text>
                                <TouchableOpacity
                                  style={styles.payDeleteBtn}
                                  onPress={() => handleDeletePayment(item)}
                                  activeOpacity={0.7}
                                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                                >
                                  <Text style={styles.payDeleteBtnText}>🗑️ {isHindi ? 'हटाएं' : 'Delete'}</Text>
                                </TouchableOpacity>
                              </View>
                            </View>
                          );
                        }}
                      />
                    )}
                  </>
                ) : (
                  /* ---------------- SUB-SUPPLIER (VENDOR) PAYMENTS CONTENT ---------------- */
                  <>
                    {/* View Switcher: Vendor-Wise (Default) vs All Records */}
                    <View style={styles.payTabRow}>
                      <TouchableOpacity
                        style={[styles.payTabBtn, paymentViewMode === 'customer' && styles.payTabBtnActiveSub]}
                        onPress={() => setPaymentViewMode('customer')}
                        activeOpacity={0.7}
                      >
                        <Text style={[styles.payTabBtnText, paymentViewMode === 'customer' && styles.payTabBtnTextActive]}>
                          🚜 {isHindi ? 'सप्लायर अनुसार कुल' : 'Vendor Wise'} ({subSupplierPaymentSummaries.length})
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.payTabBtn, paymentViewMode === 'all' && styles.payTabBtnActiveSub]}
                        onPress={() => setPaymentViewMode('all')}
                        activeOpacity={0.7}
                      >
                        <Text style={[styles.payTabBtnText, paymentViewMode === 'all' && styles.payTabBtnTextActive]}>
                          📋 {isHindi ? 'सभी भुगतान' : 'All Payments'} ({subSupplierPayments?.length || 0})
                        </Text>
                      </TouchableOpacity>
                    </View>

                    {(subSupplierPayments?.length || 0) === 0 ? (
                      <View style={styles.emptyPayState}>
                        <Text style={{ fontSize: 40, marginBottom: 8 }}>🚜</Text>
                        <Text style={styles.emptyPayText}>
                          {isHindi ? 'अभी तक कोई सप्लायर भुगतान दर्ज नहीं है।' : 'No vendor payment records found.'}
                        </Text>
                        <Text style={styles.emptyPaySub}>
                          {isHindi ? 'बकाया रिपोर्ट से सप्लायर को भुगतान दर्ज करें।' : 'Record vendor payments from the Due Reports tab.'}
                        </Text>
                      </View>
                    ) : paymentViewMode === 'customer' ? (
                      /* 1. VENDOR-WISE TOTAL PAYMENTS LIST */
                      <>
                        <View style={styles.paySearchBox}>
                          <Text style={{ fontSize: 13, marginRight: 6 }}>🔍</Text>
                          <TextInput
                            style={styles.paySearchInput}
                            placeholder={isHindi ? 'सप्लायर का नाम या फ़ोन खोजें...' : 'Search vendor name or phone...'}
                            placeholderTextColor="#94a3b8"
                            value={paymentSubSearch}
                            onChangeText={setPaymentSubSearch}
                          />
                          {paymentSubSearch ? (
                            <TouchableOpacity onPress={() => setPaymentSubSearch('')} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                              <Text style={{ fontSize: 12, color: '#94a3b8', fontWeight: 'bold' }}>✕</Text>
                            </TouchableOpacity>
                          ) : null}
                        </View>

                        <Text style={styles.custWiseHint}>
                          {isHindi ? '👇 सप्लायर पर क्लिक करके उसके सभी भुगतान देखें:' : '👇 Tap vendor to view all payments made to them:'}
                        </Text>

                        <FlatList
                          data={filteredSubSummaries}
                          keyExtractor={item => item.subSupplierId}
                          contentContainerStyle={{ paddingVertical: 4 }}
                          showsVerticalScrollIndicator={false}
                          renderItem={({ item }) => (
                            <TouchableOpacity
                              style={styles.custPaySummaryCard}
                              onPress={() => setSelectedPaymentSubId(item.subSupplierId)}
                              activeOpacity={0.7}
                            >
                              <View style={{ flex: 1, paddingRight: 6 }}>
                                <Text style={styles.custPaySummaryName}>{item.subSupplierName}</Text>
                                <Text style={styles.custPaySummarySub}>
                                  {item.phone ? `📞 ${item.phone} • ` : ''}
                                  {item.count} {isHindi ? 'बार भुगतान दिया' : 'payments'}
                                </Text>
                                <Text style={styles.custPayLatestDate}>
                                  {isHindi ? `अंतिम: ${formatToDisplayDate(item.latestDate)}` : `Latest: ${formatToDisplayDate(item.latestDate)}`}
                                </Text>
                              </View>
                              <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                                <View style={styles.subPayTotalBadge}>
                                  <Text style={styles.subPayTotalLabel}>{isHindi ? 'कुल दिया' : 'Paid'}</Text>
                                  <Text style={styles.subPayTotalText}>₹{item.totalPaid.toFixed(0)}</Text>
                                </View>
                                <Text style={styles.drillDownArrow}>›</Text>
                              </View>
                            </TouchableOpacity>
                          )}
                        />
                      </>
                    ) : (
                      /* 2. CHRONOLOGICAL ALL SUB-SUPPLIER PAYMENTS LIST */
                      <FlatList
                        data={sortedSubPayments}
                        keyExtractor={item => item.id}
                        contentContainerStyle={{ paddingVertical: 8 }}
                        showsVerticalScrollIndicator={false}
                        renderItem={({ item }) => {
                          const sub = subSuppliers.find(s => s.id === item.subSupplierId);
                          const subName = item.subSupplierName || sub?.name || (isHindi ? 'अज्ञात सप्लायर' : 'Unknown Vendor');
                          return (
                            <View style={styles.payRecordCard}>
                              <View style={{ flex: 1 }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                  <Text style={styles.payRecordName}>{subName}</Text>
                                  <View style={[styles.payModeBadge, { backgroundColor: '#ffedd5' }]}>
                                    <Text style={[styles.payModeText, { color: '#c2410c' }]}>{item.paymentMode || 'PAID'}</Text>
                                  </View>
                                </View>
                                <Text style={styles.payRecordDate}>📅 {formatToDisplayDate(item.date)}</Text>
                                {item.notes ? (
                                  <Text style={styles.payRecordNotes} numberOfLines={1}>📝 {item.notes}</Text>
                                ) : null}
                              </View>

                              <View style={{ alignItems: 'flex-end', marginLeft: 10 }}>
                                <Text style={[styles.payRecordAmount, { color: '#ea580c' }]}>-₹{item.amountPaid.toFixed(0)}</Text>
                                <TouchableOpacity
                                  style={styles.payDeleteBtn}
                                  onPress={() => handleDeleteSubPaymentFromDashboard(item.id)}
                                  activeOpacity={0.7}
                                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                                >
                                  <Text style={styles.payDeleteBtnText}>🗑️ {isHindi ? 'हटाएं' : 'Delete'}</Text>
                                </TouchableOpacity>
                              </View>
                            </View>
                          );
                        }}
                      />
                    )}
                  </>
                )}
              </>
            )}

            <TouchableOpacity
              style={styles.payHistoryDoneBtn}
              onPress={() => setPayHistoryVisible(false)}
              activeOpacity={0.8}
            >
              <Text style={styles.payHistoryDoneBtnText}>{isHindi ? 'बंद करें (Done)' : 'Close'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Dairy Profile Edit / Setup Popup Modal */}
      <Modal
        visible={editDairyModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setEditDairyModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalIcon}>🥛</Text>
              <Text style={styles.modalTitle}>{t.dairyProfileSetupTitle || 'डेयरी प्रोफाइल सेट करें'}</Text>
              <Text style={styles.modalSubtitle}>
                {t.dairyProfileSetupSub || 'Set your dairy farm name and owner name for receipts & daily registers.'}
              </Text>
            </View>

            <View style={styles.modalBody}>
              <Text style={styles.modalLabel}>{t.dairyNameInputLabel || 'Dairy / Business Name (डेयरी का नाम) *'}</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="e.g. Radhe Dairy / राधे डेयरी फ़ार्म"
                placeholderTextColor="#94a3b8"
                value={dairyNameInput}
                onChangeText={setDairyNameInput}
                autoFocus
              />

              <Text style={styles.modalLabel}>{t.dairyOwnerInputLabel || 'Owner / Supplier Name (आपका नाम)'}</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="e.g. Ramesh Kumar / आपका नाम"
                placeholderTextColor="#94a3b8"
                value={ownerNameInput}
                onChangeText={setOwnerNameInput}
              />
            </View>

            <View style={styles.modalBtnRow}>
              {supplier?.businessName && supplier.businessName !== 'Om Fresh Dairy Farm' && supplier.businessName !== 'Fresh Milk Dairy' ? (
                <TouchableOpacity
                  style={styles.modalCancelBtn}
                  onPress={() => setEditDairyModalVisible(false)}
                >
                  <Text style={styles.modalCancelBtnText}>{t.cancel || 'Cancel'}</Text>
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity
                style={[styles.modalSaveBtn, { flex: 1 }]}
                onPress={handleSaveDairyProfile}
                activeOpacity={0.8}
              >
                <Text style={styles.modalSaveBtnText}>{t.saveDairyProfileBtn || '✓ Save Dairy Profile (सहेजें)'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Online Payment Requests Modal */}
      <Modal
        visible={onlinePayModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setOnlinePayModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxHeight: '90%', paddingBottom: 16 }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalIcon}>📲</Text>
              <Text style={styles.modalTitle}>
                {isHindi ? 'ऑनलाइन UPI भुगतान अनुरोध' : 'Online UPI Payment Requests'}
              </Text>
              <Text style={styles.modalSubtitle}>
                {isHindi
                  ? 'ग्राहकों द्वारा डिजिटल दूध कार्ड से भेजे गए भुगतान'
                  : 'Customer payments submitted from Digital Milk Card'}
              </Text>
            </View>

            {/* Filter Tabs: Pending vs Processed */}
            <View style={styles.onlinePayTabsRow}>
              <TouchableOpacity
                style={[
                  styles.onlinePayTabBtn,
                  onlinePayActiveTab === 'pending' && styles.onlinePayTabBtnActive
                ]}
                onPress={() => setOnlinePayActiveTab('pending')}
                activeOpacity={0.8}
              >
                <Text
                  style={[
                    styles.onlinePayTabBtnText,
                    onlinePayActiveTab === 'pending' && styles.onlinePayTabBtnTextActive
                  ]}
                >
                  {isHindi ? `लंबित (${pendingRequestsList.length})` : `Pending (${pendingRequestsList.length})`}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.onlinePayTabBtn,
                  onlinePayActiveTab === 'history' && styles.onlinePayTabBtnActive
                ]}
                onPress={() => setOnlinePayActiveTab('history')}
                activeOpacity={0.8}
              >
                <Text
                  style={[
                    styles.onlinePayTabBtnText,
                    onlinePayActiveTab === 'history' && styles.onlinePayTabBtnTextActive
                  ]}
                >
                  {isHindi ? `इतिहास (${historyRequestsList.length})` : `History (${historyRequestsList.length})`}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Requests List */}
            <ScrollView style={{ maxHeight: 380, marginVertical: 6 }} showsVerticalScrollIndicator={false}>
              {onlinePayActiveTab === 'pending' ? (
                pendingRequestsList.length === 0 ? (
                  <View style={styles.onlinePayEmptyBox}>
                    <Text style={{ fontSize: 32, marginBottom: 8 }}>✓</Text>
                    <Text style={styles.onlinePayEmptyTitle}>
                      {isHindi ? 'कोई नया लंबित अनुरोध नहीं है' : 'No Pending Requests'}
                    </Text>
                    <Text style={styles.onlinePayEmptySub}>
                      {isHindi
                        ? 'जैसे ही कोई ग्राहक कार्ड से UPI पेमेंट पुष्टि भेजेगा, वह यहाँ दिखेगा।'
                        : 'When a customer submits a UPI payment from their milk card, it will appear here.'}
                    </Text>
                  </View>
                ) : (
                  pendingRequestsList.map(req => {
                    const isProcessing = isProcessingRequestId === req.id;
                    const displayDate = req.displayDate || formatToDisplayDate(req.date);

                    return (
                      <View key={req.id} style={styles.onlinePayReqCard}>
                        <View style={styles.onlinePayReqTopRow}>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.onlinePayReqCustName}>👤 {req.customerName}</Text>
                            {req.customerPhone ? (
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 3 }}>
                                <Text style={styles.onlinePayReqPhone}>📞 {req.customerPhone}</Text>
                                <TouchableOpacity
                                  onPress={() => handleCallCustomer(req.customerPhone!)}
                                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                                >
                                  <Text style={{ fontSize: 13 }}>📞</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                  onPress={() => handleWhatsAppCustomer(req.customerPhone!, req.customerName)}
                                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                                >
                                  <Text style={{ fontSize: 13 }}>💬</Text>
                                </TouchableOpacity>
                              </View>
                            ) : null}
                          </View>
                          <View style={styles.onlinePayReqAmountBadge}>
                            <Text style={styles.onlinePayReqAmountText}>₹{req.amount.toFixed(2)}</Text>
                          </View>
                        </View>

                        <View style={styles.onlinePayReqDetailsRow}>
                          <Text style={styles.onlinePayReqDetailItem}>📅 {displayDate}</Text>
                          {req.requestedAt ? (
                            <Text style={styles.onlinePayReqDetailItem}>⏱️ {formatTimeAgo(req.requestedAt)}</Text>
                          ) : null}
                        </View>

                        {req.utrOrNote ? (
                          <View style={styles.onlinePayReqUtrBox}>
                            <Text style={styles.onlinePayReqUtrText}>
                              💳 {isHindi ? 'UTR / संदर्भ:' : 'UTR / Ref:'} {req.utrOrNote}
                            </Text>
                          </View>
                        ) : null}

                        {/* Action Buttons: Accept & Reject */}
                        <View style={styles.onlinePayReqActionRow}>
                          <TouchableOpacity
                            style={[styles.onlinePayRejectBtn, isProcessing && { opacity: 0.5 }]}
                            onPress={() => handleOpenRejectPrompt(req)}
                            disabled={isProcessing}
                            activeOpacity={0.8}
                          >
                            <Text style={styles.onlinePayRejectBtnText}>
                              ✕ {isHindi ? 'अस्वीकार' : 'Reject'}
                            </Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            style={[styles.onlinePayAcceptBtn, isProcessing && { opacity: 0.5 }]}
                            onPress={() => handleAcceptOnlinePayment(req)}
                            disabled={isProcessing}
                            activeOpacity={0.8}
                          >
                            <Text style={styles.onlinePayAcceptBtnText}>
                              {isProcessing
                                ? (isHindi ? 'सहेज रहे हैं...' : 'Saving...')
                                : (isHindi ? '✓ स्वीकार करें (Accept)' : '✓ Accept & Record')}
                            </Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    );
                  })
                )
              ) : (
                historyRequestsList.length === 0 ? (
                  <View style={styles.onlinePayEmptyBox}>
                    <Text style={{ fontSize: 32, marginBottom: 8 }}>📋</Text>
                    <Text style={styles.onlinePayEmptyTitle}>
                      {isHindi ? 'कोई पुराना इतिहास नहीं है' : 'No History Records'}
                    </Text>
                  </View>
                ) : (
                  historyRequestsList.map(req => {
                    const isAccepted = req.status === 'accepted';
                    const displayDate = req.displayDate || formatToDisplayDate(req.date);

                    return (
                      <View key={req.id} style={styles.onlinePayHistoryCard}>
                        <View style={{ flex: 1 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                            <Text style={styles.onlinePayReqCustName}>👤 {req.customerName}</Text>
                            <View
                              style={[
                                styles.onlinePayStatusBadge,
                                isAccepted ? styles.onlinePayStatusAccepted : styles.onlinePayStatusRejected
                              ]}
                            >
                              <Text
                                style={[
                                  styles.onlinePayStatusBadgeText,
                                  isAccepted ? styles.onlinePayStatusTextAccepted : styles.onlinePayStatusTextRejected
                                ]}
                              >
                                {isAccepted
                                  ? (isHindi ? '✓ स्वीकृत' : '✓ Accepted')
                                  : (isHindi ? '✕ अस्वीकृत' : '✕ Rejected')}
                              </Text>
                            </View>
                          </View>
                          <Text style={{ fontSize: 13, fontWeight: '800', color: '#0f172a', marginTop: 3 }}>
                            ₹{req.amount.toFixed(2)} • {displayDate}
                          </Text>
                          {req.rejectReason ? (
                            <Text style={{ fontSize: 11, color: '#ef4444', marginTop: 2 }}>
                              ⚠️ {req.rejectReason}
                            </Text>
                          ) : null}
                        </View>
                        <TouchableOpacity
                          style={{ padding: 6, marginLeft: 8 }}
                          onPress={() => handleDeleteOnlinePaymentRequest(req)}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <Text style={{ fontSize: 16 }}>🗑️</Text>
                        </TouchableOpacity>
                      </View>
                    );
                  })
                )
              )}
            </ScrollView>

            <TouchableOpacity
              style={styles.modalCancelBtn}
              onPress={() => setOnlinePayModalVisible(false)}
              activeOpacity={0.8}
            >
              <Text style={styles.modalCancelBtnText}>{isHindi ? 'बंद करें (Close)' : 'Close'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Rejection Reason Modal */}
      <Modal
        visible={rejectPromptModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setRejectPromptModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxWidth: 360 }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalIcon}>⚠️</Text>
              <Text style={styles.modalTitle}>
                {isHindi ? 'भुगतान अस्वीकार करें' : 'Reject Payment Request'}
              </Text>
              <Text style={styles.modalSubtitle}>
                {isHindi
                  ? 'अस्वीकार करने का कारण लिखें (यह ग्राहक को व्हाट्सएप पर भी भेजा जाएगा):'
                  : 'Enter rejection reason (will be included in WhatsApp message):'}
              </Text>
            </View>

            <View style={styles.modalBody}>
              <TextInput
                style={[styles.modalInput, { minHeight: 70, textAlignVertical: 'top' }]}
                value={rejectReasonInput}
                onChangeText={setRejectReasonInput}
                placeholder={isHindi ? 'उदा. बैंक खाते में राशि नहीं मिली...' : 'e.g. Payment not credited...'}
                placeholderTextColor="#94a3b8"
                multiline
              />
            </View>

            <View style={styles.modalBtnRow}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setRejectPromptModalVisible(false)}
                activeOpacity={0.8}
              >
                <Text style={styles.modalCancelBtnText}>{isHindi ? 'रद्द करें' : 'Cancel'}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalSaveBtn, { backgroundColor: '#ef4444', flex: 1 }]}
                onPress={handleConfirmRejectOnlinePayment}
                activeOpacity={0.8}
              >
                <Text style={styles.modalSaveBtnText}>{isHindi ? 'अस्वीकार करें' : 'Reject'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* App Installation Process Guide Modal */}
      <InstallAppModal
        visible={installModalVisible}
        onClose={() => setInstallModalVisible(false)}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#f8fafc' },
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 32 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14
  },
  greeting: { fontSize: 20, fontWeight: 'bold', color: '#0f172a' },
  businessName: { fontSize: 13, color: '#64748b', marginTop: 2 },
  profileBadge: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#e2e8f0',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 10
  },
  profileBadgeText: { fontSize: 20 },

  // PAIRED METRIC CARDS (Total Due & Payment History side-by-side in same space)
  pairedMetricsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16
  },
  dueCardCompact: {
    flex: 1,
    backgroundColor: '#dc2626',
    borderRadius: 14,
    padding: 12,
    shadowColor: '#dc2626',
    shadowOpacity: 0.18,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3
  },
  paymentCardCompact: {
    flex: 1,
    backgroundColor: '#059669',
    borderRadius: 14,
    padding: 12,
    shadowColor: '#059669',
    shadowOpacity: 0.18,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3
  },
  metricCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4
  },
  metricCardIcon: { fontSize: 18 },
  metricBadgeRed: {
    backgroundColor: 'rgba(255,255,255,0.22)',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 10
  },
  metricBadgeRedText: { color: '#fee2e2', fontSize: 10, fontWeight: 'bold' },
  metricBadgeGreen: {
    backgroundColor: 'rgba(255,255,255,0.22)',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 10
  },
  metricBadgeGreenText: { color: '#d1fae5', fontSize: 10, fontWeight: 'bold' },
  metricLabelRed: { color: '#fee2e2', fontSize: 11, fontWeight: '600' },
  metricLabelGreen: { color: '#d1fae5', fontSize: 11, fontWeight: '600' },
  metricAmountRed: { color: '#ffffff', fontSize: 22, fontWeight: 'bold', marginVertical: 3 },
  metricAmountGreen: { color: '#ffffff', fontSize: 22, fontWeight: 'bold', marginVertical: 3 },
  metricActionRow: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.2)',
    paddingTop: 6,
    marginTop: 2
  },
  metricActionRed: { color: '#fecaca', fontSize: 11, fontWeight: 'bold' },
  metricActionGreen: { color: '#a7f3d0', fontSize: 11, fontWeight: 'bold' },

  // Section Headers
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8
  },
  sectionHeading: { fontSize: 15, fontWeight: '700', color: '#1e293b', marginBottom: 10 },
  seeAllText: { fontSize: 13, color: '#0284c7', fontWeight: '600' },

  // Stats Grid (Cow & Buffalo)
  statsGrid: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  statBox: {
    flex: 1,
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.04)'
  },
  milkEmoji: { fontSize: 26, marginBottom: 2 },
  statNumber: { fontSize: 18, fontWeight: 'bold', color: '#1e293b' },
  statLabel: { fontSize: 11, color: '#475569', marginTop: 2, fontWeight: '600' },

  // Today Billed Card
  todayBilledCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 16
  },
  statSmallLabel: { fontSize: 11, color: '#64748b' },
  todayBilledAmount: { fontSize: 18, fontWeight: 'bold', color: '#059669', marginTop: 1 },
  deliveredCountBadge: {
    backgroundColor: '#ecfdf5',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 16
  },
  deliveredCountText: { fontSize: 11, fontWeight: 'bold', color: '#059669' },

  // Procurement & Stock Section
  procurementCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1
  },
  procurementHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10
  },
  procurementTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0f172a'
  },
  procurementLinkText: {
    fontSize: 12,
    color: '#0284c7',
    fontWeight: '600'
  },
  procurementGrid: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10
  },
  procurementTile: {
    flex: 1,
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    padding: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    alignItems: 'center'
  },
  procurementTileLabel: {
    fontSize: 10,
    color: '#64748b',
    fontWeight: '600',
    textAlign: 'center'
  },
  procurementTileVal: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#0f172a',
    marginVertical: 2
  },
  procurementTileSub: {
    fontSize: 9,
    color: '#64748b',
    textAlign: 'center'
  },
  procurementFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9'
  },
  procurementFooterLabel: {
    fontSize: 11,
    color: '#64748b'
  },
  procurementFooterAmount: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#ea580c'
  },
  procurementActionBtn: {
    backgroundColor: '#f97316',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8
  },
  procurementActionBtnText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: 'bold'
  },
  procurementHistoryBtn: {
    backgroundColor: '#fff7ed',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#fed7aa'
  },
  procurementHistoryBtnText: {
    color: '#c2410c',
    fontSize: 11,
    fontWeight: 'bold'
  },

  // SLEEK QUICK LINKS GRID (2 columns x 4 rows)
  quickLinksGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 18
  },
  quickLinkTile: {
    width: '48.5%',
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    gap: 8
  },
  quickLinkIconBox: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1
  },
  quickLinkIconText: { fontSize: 18 },
  quickLinkTitle: { fontSize: 12, fontWeight: 'bold', color: '#1e293b' },
  quickLinkSub: { fontSize: 10, color: '#64748b', marginTop: 1 },

  // Recent Customers Section
  customerHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8
  },
  customerCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 10,
    marginBottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#f1f5f9'
  },
  customerInfo: { flex: 1, paddingRight: 8 },
  customerName: { fontSize: 13, fontWeight: '700', color: '#0f172a' },
  customerSub: { fontSize: 11, color: '#64748b', marginTop: 2 },
  customerActionsRow: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  customerActionBtnCall: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#e0f2fe',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#bae6fd'
  },
  customerActionBtnWhatsApp: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#dcfce7',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#bbf7d0'
  },
  customerActionIcon: { fontSize: 15 },
  noPhoneText: { color: '#94a3b8', fontSize: 13 },

  // App Install Banner
  installBannerCard: {
    backgroundColor: '#0284c7',
    borderRadius: 12,
    padding: 10,
    marginBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#0284c7',
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2
  },
  installBannerIconBox: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 6
  },
  installBannerTitle: { color: '#ffffff', fontSize: 13, fontWeight: 'bold' },
  installBannerSub: { color: '#e0f2fe', fontSize: 10, marginTop: 1 },
  installBannerBtn: {
    backgroundColor: '#ffffff',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    marginLeft: 6
  },
  installBannerBtnText: { color: '#0284c7', fontWeight: 'bold', fontSize: 12 },
  installBannerClose: { marginLeft: 6, padding: 4 },
  installBannerCloseText: { color: '#ffffff', fontSize: 14, fontWeight: 'bold', opacity: 0.85 },

  // Modal Common
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    padding: 16
  },
  modalContent: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 8
  },
  modalHeader: { alignItems: 'center', marginBottom: 14 },
  modalIcon: { fontSize: 38, marginBottom: 6 },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: '#0f172a' },
  modalSubtitle: { fontSize: 12, color: '#64748b', textAlign: 'center', marginTop: 3, paddingHorizontal: 10 },
  modalBody: { marginVertical: 8 },
  modalLabel: { fontSize: 12, fontWeight: '600', color: '#334155', marginBottom: 5, marginTop: 6 },
  modalInput: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    backgroundColor: '#f8fafc',
    color: '#0f172a',
    marginBottom: 6
  },
  modalBtnRow: { flexDirection: 'row', gap: 10, marginTop: 12, alignItems: 'center' },
  modalCancelBtn: { paddingVertical: 12, paddingHorizontal: 14, borderRadius: 10, backgroundColor: '#f1f5f9' },
  modalCancelBtnText: { color: '#64748b', fontWeight: '600', fontSize: 13 },
  modalSaveBtn: {
    backgroundColor: '#16a34a',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center'
  },
  modalSaveBtnText: { color: '#ffffff', fontSize: 14, fontWeight: 'bold' },

  // Payment History Modal
  payHistoryModalContent: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    padding: 16,
    maxHeight: '85%',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 10
  },
  payHistoryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9'
  },
  payHistoryTitle: { fontSize: 16, fontWeight: 'bold', color: '#0f172a' },
  payHistorySub: { fontSize: 11, color: '#059669', fontWeight: '600', marginTop: 1 },
  modalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center'
  },
  modalCloseBtnText: { fontSize: 14, color: '#64748b', fontWeight: 'bold' },

  // Party Switcher (Customers vs Sub-Suppliers)
  partySwitcherRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
    marginBottom: 4
  },
  partySwitcherBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#f8fafc',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0'
  },
  partySwitcherBtnActive: {
    backgroundColor: '#059669',
    borderColor: '#059669'
  },
  partySwitcherBtnActiveSub: {
    backgroundColor: '#ea580c',
    borderColor: '#ea580c'
  },
  partySwitcherText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748b'
  },
  partySwitcherTextActive: {
    color: '#ffffff'
  },

  // Payment Tabs (Customer Wise vs All Records)
  payTabRow: {
    flexDirection: 'row',
    gap: 8,
    marginVertical: 10
  },
  payTabBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0'
  },
  payTabBtnActive: {
    backgroundColor: '#059669',
    borderColor: '#059669'
  },
  payTabBtnActiveSub: {
    backgroundColor: '#ea580c',
    borderColor: '#ea580c'
  },
  payTabBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748b'
  },
  payTabBtnTextActive: {
    color: '#ffffff'
  },

  // Payment Search Box
  paySearchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: 6
  },
  paySearchInput: {
    flex: 1,
    fontSize: 13,
    color: '#0f172a',
    padding: 0
  },
  custWiseHint: {
    fontSize: 11,
    color: '#64748b',
    fontWeight: '500',
    marginBottom: 6,
    marginTop: 2
  },

  // Customer Wise Payment Summary Card
  custPaySummaryCard: {
    backgroundColor: '#ffffff',
    borderRadius: 10,
    padding: 10,
    marginVertical: 4,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1
  },
  custPaySummaryName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0f172a'
  },
  custPaySummarySub: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 2
  },
  custPayLatestDate: {
    fontSize: 10,
    color: '#94a3b8',
    marginTop: 1
  },
  custPayTotalBadge: {
    backgroundColor: '#ecfdf5',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#a7f3d0',
    alignItems: 'flex-end'
  },
  custPayTotalLabel: {
    fontSize: 9,
    color: '#047857',
    fontWeight: '600',
    textTransform: 'uppercase'
  },
  custPayTotalText: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#059669'
  },
  subPayTotalBadge: {
    backgroundColor: '#fff7ed',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#fed7aa',
    alignItems: 'flex-end'
  },
  subPayTotalLabel: {
    fontSize: 9,
    color: '#c2410c',
    fontWeight: '600',
    textTransform: 'uppercase'
  },
  subPayTotalText: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#ea580c'
  },
  drillDownArrow: {
    fontSize: 18,
    color: '#94a3b8',
    fontWeight: 'bold',
    marginLeft: 2
  },

  // Customer Drill-Down Detail
  payBackBtn: {
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#cbd5e1'
  },
  payBackBtnText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#0284c7'
  },
  backLinkBtn: {
    marginTop: 10,
    paddingVertical: 8,
    paddingHorizontal: 14,
    backgroundColor: '#e0f2fe',
    borderRadius: 8
  },
  backLinkBtnText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#0284c7'
  },

  // Payment Record Card
  emptyPayState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 36
  },
  emptyPayText: { fontSize: 13, fontWeight: '600', color: '#475569' },
  emptyPaySub: { fontSize: 11, color: '#94a3b8', marginTop: 4, textAlign: 'center' },
  payRecordCard: {
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    padding: 10,
    marginVertical: 4,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0'
  },
  payRecordName: { fontSize: 13, fontWeight: '700', color: '#1e293b' },
  payModeBadge: {
    backgroundColor: '#e0f2fe',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 6
  },
  payModeText: { fontSize: 9, fontWeight: 'bold', color: '#0369a1' },
  payRecordDate: { fontSize: 11, color: '#64748b', marginTop: 2 },
  payRecordNotes: { fontSize: 10, color: '#94a3b8', marginTop: 1, fontStyle: 'italic' },
  payRecordAmount: { fontSize: 14, fontWeight: 'bold', color: '#059669' },
  payDeleteBtn: {
    marginTop: 4,
    backgroundColor: '#fee2e2',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6
  },
  payDeleteBtnText: { fontSize: 10, color: '#dc2626', fontWeight: 'bold' },
  payHistoryDoneBtn: {
    backgroundColor: '#0f172a',
    paddingVertical: 11,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 8
  },
  payHistoryDoneBtnText: { color: '#ffffff', fontWeight: 'bold', fontSize: 13 },

  // Subscription / Free Trial Banner Styles
  trialBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
    gap: 10
  },
  trialBannerTrial: {
    backgroundColor: '#eff6ff',
    borderColor: '#bfdbfe'
  },
  trialBannerActive: {
    backgroundColor: '#f0fdf4',
    borderColor: '#bbf7d0'
  },
  trialBannerLocked: {
    backgroundColor: '#fef2f2',
    borderColor: '#fca5a5'
  },
  trialBannerTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0f172a'
  },
  trialBannerSub: {
    fontSize: 11,
    color: '#64748b',
    fontWeight: '600',
    marginTop: 2
  },
  trialUpgradeBtn: {
    backgroundColor: '#0284c7',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8
  },
  trialUpgradeBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#ffffff'
  },

  // Header Bell Notification
  headerBellBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    position: 'relative'
  },
  headerBellBtnActive: {
    backgroundColor: '#fef3c7',
    borderColor: '#f59e0b'
  },
  headerBellBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: '#ef4444',
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#ffffff'
  },
  headerBellBadgeText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '900'
  },

  // Active Online Payment Notification Banner
  onlinePayBannerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fef3c7',
    borderWidth: 1.5,
    borderColor: '#f59e0b',
    borderRadius: 14,
    padding: 12,
    marginBottom: 14,
    shadowColor: '#f59e0b',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 3
  },
  onlinePayIconBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    borderWidth: 1,
    borderColor: '#fde68a'
  },
  onlinePayCountBubble: {
    position: 'absolute',
    top: -3,
    right: -3,
    backgroundColor: '#ef4444',
    borderRadius: 9,
    width: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center'
  },
  onlinePayCountBubbleText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: 'bold'
  },
  onlinePayBannerTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#78350f'
  },
  onlinePayBannerSub: {
    fontSize: 11,
    color: '#92400e',
    marginTop: 2
  },
  onlinePayActionPill: {
    backgroundColor: '#d97706',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8
  },
  onlinePayActionPillText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '800'
  },

  // Online Pay Modal Tabs
  onlinePayTabsRow: {
    flexDirection: 'row',
    backgroundColor: '#f1f5f9',
    borderRadius: 10,
    padding: 3,
    marginBottom: 10
  },
  onlinePayTabBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center'
  },
  onlinePayTabBtnActive: {
    backgroundColor: '#ffffff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 1
  },
  onlinePayTabBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b'
  },
  onlinePayTabBtnTextActive: {
    color: '#0f172a',
    fontWeight: '800'
  },

  // Online Pay Cards
  onlinePayEmptyBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 36,
    paddingHorizontal: 20
  },
  onlinePayEmptyTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#475569'
  },
  onlinePayEmptySub: {
    fontSize: 12,
    color: '#94a3b8',
    textAlign: 'center',
    marginTop: 4
  },
  onlinePayReqCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 12,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1
  },
  onlinePayReqTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start'
  },
  onlinePayReqCustName: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0f172a'
  },
  onlinePayReqPhone: {
    fontSize: 11,
    color: '#64748b'
  },
  onlinePayReqAmountBadge: {
    backgroundColor: '#ecfdf5',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#a7f3d0'
  },
  onlinePayReqAmountText: {
    fontSize: 15,
    fontWeight: '900',
    color: '#047857'
  },
  onlinePayReqDetailsRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8
  },
  onlinePayReqDetailItem: {
    fontSize: 11,
    color: '#475569',
    fontWeight: '500'
  },
  onlinePayReqUtrBox: {
    backgroundColor: '#f8fafc',
    padding: 6,
    borderRadius: 6,
    marginTop: 6
  },
  onlinePayReqUtrText: {
    fontSize: 11,
    color: '#334155'
  },
  onlinePayReqActionRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10
  },
  onlinePayRejectBtn: {
    flex: 1,
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
    paddingVertical: 9,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center'
  },
  onlinePayRejectBtnText: {
    color: '#dc2626',
    fontWeight: '700',
    fontSize: 12
  },
  onlinePayAcceptBtn: {
    flex: 2,
    backgroundColor: '#16a34a',
    paddingVertical: 9,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center'
  },
  onlinePayAcceptBtnText: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 12
  },
  onlinePayHistoryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 10,
    marginBottom: 8
  },
  onlinePayStatusBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6
  },
  onlinePayStatusAccepted: {
    backgroundColor: '#ecfdf5'
  },
  onlinePayStatusRejected: {
    backgroundColor: '#fef2f2'
  },
  onlinePayStatusBadgeText: {
    fontSize: 10,
    fontWeight: '800'
  },
  onlinePayStatusTextAccepted: {
    color: '#059669'
  },
  onlinePayStatusTextRejected: {
    color: '#dc2626'
  }
});
