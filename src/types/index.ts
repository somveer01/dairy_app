export type MilkType = 'cow' | 'buffalo';

export type SessionType = 'Morning' | 'Evening' | 'Custom';

export interface Supplier {
  id: string;
  name: string;
  phone: string;
  email?: string;
  businessName: string;
  createdAt: number;
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
