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
}

export enum OrderStatus {
  PENDING = "PENDING",
  PARTIAL = "PARTIAL",
  COMPLETED = "COMPLETED",
  DISPUTED = "DISPUTED",
}

export interface Order {
  id: string;
  name: string;
  date: string;
  supplier: string;
  customerName?: string;
  items: OrderItem[];
  orderFiles?: OrderFile[];
  receipts?: Receipt[];
  status: OrderStatus;
}

