export type MilkType = 'cow' | 'buffalo' | 'packet_full_cream' | 'packet_toned' | 'packet_double_toned' | 'packet_other' | string;

export type SessionType = 'Morning' | 'Evening' | 'Custom';

export interface DairyProductItem {
  id: string;
  name: string;
  unit: 'kg' | 'gm' | 'pkt' | 'litre' | 'cup' | 'piece';
  defaultRate: number;
  isActive: boolean;
}

export interface DairyEntryAddon {
  productId: string;
  productName: string;
  quantity: number;
  unit: string;
  rate: number;
  totalAmount: number;
}

export interface SupplierSettings {
  enablePacketMilk?: boolean;
  enableDairyAddons?: boolean;
  packetBrands?: string[];
  customProducts?: DairyProductItem[];
}

export interface Supplier {
  id: string;
  name: string;
  phone: string;
  email?: string;
  password?: string;
  businessName: string;
  settings?: SupplierSettings;
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
  isPacketMilk?: boolean;
  packetBrand?: string;
  packetVariant?: string;
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
  amount: number; // quantityLitres * ratePerLitre (base milk amount)
  addons?: DairyEntryAddon[];
  totalDayAmount?: number; // amount + sum of addons
  isPacketMilk?: boolean;
  packetBrand?: string;
  packetVariant?: string;
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
  totalLitresPacket?: number;
  totalLitres: number;
  totalAddonsAmount?: number;
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

