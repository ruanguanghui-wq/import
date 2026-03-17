export enum QuotationStatus {
  DRAFT = "DRAFT",
  SENT = "SENT",
  REVIEWING = "REVIEWING",
  APPROVED = "APPROVED",
  REJECTED = "REJECTED",
}

export enum QuotationType {
  SUPPLIER = "SUPPLIER",
  CUSTOMER = "CUSTOMER",
}

export interface QuotationItem {
  id: string;
  name: string;
  productName?: string;
  quantity: number;
  quotedPrice: number;
  note?: string;
  foreignQuotedPrice?: number;
}

export interface Quotation {
  id: string;
  name: string;
  date: string;
  type: QuotationType;
  customerId?: string;
  customerName?: string;
  customerEmail?: string;
  supplierName?: string;
  items: QuotationItem[];
  status: QuotationStatus;
  notes?: string;
  orderId?: string;
  currency?: string;
  exchangeRate?: number;
}

export interface OrderRecord {
  itemId: string;
  name: string;
  productName?: string;
  qty: number;
  price: number;
}

export interface OrderFile {
  id: string;
  fileName: string;
  importedAt: string;
  records: OrderRecord[];
}

export interface ReceiptRecord {
  itemId: string;
  name?: string;
  productName?: string;
  qty: number;
  price: number;
}

export interface Receipt {
  id: string;
  fileName: string;
  importedAt: string;
  records: ReceiptRecord[];
}

export interface OrderItem {
  id: string;
  name: string;
  productName?: string;
  orderedQty: number;
  expectedPrice: number;
  receivedQty: number;
  actualPrice: number;
  totalReceivedCost?: number;
  manualReceivedQty?: number;
  manualTotalCost?: number;
  foreignExpectedPrice?: number;
  foreignActualPrice?: number;
}

export enum OrderStatus {
  PROCESSING = "PROCESSING",
  PARTIAL = "PARTIAL",
  COMPLETED = "COMPLETED",
  CANCELLED = "CANCELLED",
}

export enum OrderType {
  PURCHASE = "PURCHASE",
  SALES = "SALES",
}

export enum PaymentMethod {
  CASH = "CASH",
  BANK_TRANSFER = "BANK_TRANSFER",
  CREDIT_CARD = "CREDIT_CARD",
  OTHER = "OTHER",
}

export enum PaymentStatus {
  UNPAID = "UNPAID",
  PARTIAL = "PARTIAL",
  PAID = "PAID",
}

export interface Payment {
  id: string;
  amount: number;
  date: string;
  method: PaymentMethod;
  reference?: string;
  notes?: string;
  recordedBy?: string;
  foreignAmount?: number;
  currency?: string;
  exchangeRate?: number;
}

export interface OrderNote {
  id: string;
  content: string;
  createdAt: string;
  createdBy: string;
}

export interface OrderHistory {
  id: string;
  action: string;
  details: string;
  timestamp: string;
  user: string;
}

export interface Order {
  id: string;
  orderCode?: string;
  name: string;
  date: string;
  type: OrderType;
  supplier?: string;
  customerCode?: string;
  customerName?: string;
  customerEmail?: string;
  userId?: string;
  quotationId?: string;
  linkedOrderId?: string;
  items: OrderItem[];
  orderFiles?: OrderFile[];
  receipts?: Receipt[];
  status: OrderStatus;
  currency?: string;
  exchangeRate?: number;
  payments?: Payment[];
  paidAmount?: number;
  paymentStatus?: PaymentStatus;
  notes?: OrderNote[];
  history?: OrderHistory[];
}

export interface Product {
  id: string;
  sku: string;
  name: string;
  basePrice: number;
  type?: 'standard' | 'custom';
  unit?: string;
  category?: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
}
