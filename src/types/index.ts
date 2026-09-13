export type MilkType = 'cow' | 'buffalo';

export type SessionType = 'Morning' | 'Evening' | 'Custom';

export interface Supplier {
  id: string;
  name: string;
  phone: string;
  email?: string;
  password?: string;
  businessName: string;
  createdAt: number;
  updatedAt?: number;
}

export interface Customer {
  id: string;
  supplierId: string;
  name: string;
  phone: string;
  address?: string;
  defaultLitres: number;
  milkType: MilkType;
  ratePerLitre: number;
  notes?: string;
  createdAt: number;
  updatedAt?: number;
  isDeleted?: boolean;
}

export interface MilkEntry {
  id: string;
  supplierId: string;
  customerId: string;
  customerName: string;
  date: string; // YYYY-MM-DD
  session: SessionType;
  milkType: MilkType;
  quantityLitres: number;
  ratePerLitre: number;
  amount: number; // quantityLitres * ratePerLitre
  isPaid: boolean;
  notes?: string;
  createdAt: number;
  updatedAt?: number;
  isDeleted?: boolean;
}

export interface Payment {
  id: string;
  supplierId: string;
  customerId: string;
  customerName: string;
  date: string; // YYYY-MM-DD
  amountPaid: number;
  notes?: string;
  createdAt: number;
  updatedAt?: number;
  isDeleted?: boolean;
}

export interface CustomerDueSummary {
  customer: Customer;
  totalLitresCow: number;
  totalLitresBuffalo: number;
  totalLitres: number;
  totalAmountBilled: number;
  totalPaid: number;
  netDue: number;
  unpaidEntriesCount: number;
  deliveredDaysCount?: number;
  totalRangeDays?: number;
}

// --- SUB-SUPPLIER (INWARD MILK PROCUREMENT) ---
export interface SubSupplier {
  id: string;
  supplierId: string;
  name: string;
  phone: string;
  address?: string;
  defaultLitres: number;
  milkType: MilkType;
  ratePerLitre: number;
  notes?: string;
  createdAt: number;
  updatedAt?: number;
  isDeleted?: boolean;
}

export interface MilkInwardEntry {
  id: string;
  supplierId: string;
  subSupplierId: string;
  subSupplierName: string;
  date: string; // YYYY-MM-DD
  session: SessionType;
  milkType: MilkType;
  quantityLitres: number;
  ratePerLitre: number;
  amount: number;
  isPaid: boolean;
  notes?: string;
  createdAt: number;
  updatedAt?: number;
  isDeleted?: boolean;
}

export interface SubSupplierPayment {
  id: string;
  supplierId: string;
  subSupplierId: string;
  subSupplierName?: string;
  date: string; // YYYY-MM-DD
  amountPaid: number;
  paymentMode?: 'CASH' | 'UPI' | 'BANK' | string;
  notes?: string;
  createdAt: number;
  updatedAt?: number;
  isDeleted?: boolean;
}

export interface SubSupplierDueSummary {
  subSupplier: SubSupplier;
  totalLitresCow: number;
  totalLitresBuffalo: number;
  totalLitres: number;
  totalPurchaseAmount: number;
  totalAmountBilled: number; // alias for inward total purchase
  totalPaid: number;
  netPayable: number; // totalPurchaseAmount - totalPaid
  suppliedDaysCount: number;
  deliveredDaysCount?: number; // alias
  unpaidEntriesCount?: number;
  totalRangeDays?: number;
}

