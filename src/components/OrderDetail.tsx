import React, { useState, useRef, useEffect } from "react";
import { Order, OrderItem, OrderStatus, Product, OrderType, PaymentMethod, Payment } from "../types";
import {
  formatCurrency,
  formatNumber,
  formatForeignCurrency,
  parseExcelData,
  parseNumber,
  parseDate,
  formatPaymentMethod,
} from "../utils";
import { mapExcelHeaders } from "../services/gemini";
import { useAuth } from "../store";
import {
  ArrowLeft,
  Search,
  AlertTriangle,
  CheckCircle,
  Package,
  TrendingUp,
  TrendingDown,
  Minus,
  Download,
  Upload,
  X,
  Filter,
  Barcode,
  Camera,
  FileWarning,
  Clock,
  AlertCircle,
  FileText,
  Save,
  ChevronLeft,
  ChevronRight,
  Plus,
  Trash2,
  Edit2,
  PieChart as PieChartIcon,
  BarChart as BarChartIcon,
} from "lucide-react";

const ITEMS_PER_PAGE = 50;
import * as XLSX from "xlsx";
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { recalculateOrder } from "../orderUtils";
import { BarcodeScanner } from "./BarcodeScanner";
import { Pagination } from "./Pagination";
import { ConfirmModal } from "./ConfirmModal";

interface OrderDetailProps {
  order: Order;
  allOrders?: Order[];
  onUpdate: (order: Order) => Promise<void> | void;
  onBack: () => void;
  products?: Product[];
  onAddProduct?: (product: Product) => void;
}

export function OrderDetail({
  order: propOrder,
  allOrders = [],
  onUpdate,
  onBack,
  products = [],
  onAddProduct,
}: OrderDetailProps) {
  // Filter out invalid items (orderedQty <= 0 and receivedQty <= 0) from old files
  const order = {
    ...propOrder,
    items: propOrder.items.filter(
      (item) => item.orderedQty > 0 || item.receivedQty > 0
    ),
  };

  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [editingItem, setEditingItem] = useState<OrderItem | null>(null);
  const [newReceivedQty, setNewReceivedQty] = useState<string>("");
  const [newActualPrice, setNewActualPrice] = useState<string>("");
  const [newForeignActualPrice, setNewForeignActualPrice] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [importResult, setImportResult] = useState<{
    matched: number;
    unmatched: { name: string; productName?: string; qty: number; price: number }[];
    foundInOtherOrders: {
      name: string;
      productName?: string;
      qty: number;
      price: number;
      orderId: string;
      orderName: string;
    }[];
    overReceived: { name: string; excess: number }[];
  } | null>(null);
  const [isMapping, setIsMapping] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [deletingItemId, setDeletingItemId] = useState<string | null>(null);
  const [deletingPaymentId, setDeletingPaymentId] = useState<string | null>(null);
  const [overReceiveConfirm, setOverReceiveConfirm] = useState<{
    item: OrderItem;
    addedQty: number;
    updatedPrice: number;
    newTotalReceived: number;
  } | null>(null);
  const [showScanner, setShowScanner] = useState(false);

  const [filterStatus, setFilterStatus] = useState<
    "all" | "missing" | "completed" | "price_increased" | "over_received"
  >("all");
  const [isContinuousScan, setIsContinuousScan] = useState(false);
  const [newNote, setNewNote] = useState("");
  const [activeTab, setActiveTab] = useState<"items" | "payments" | "analytics">("items");
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [editingPayment, setEditingPayment] = useState<Payment | null>(null);
  const [exchangeRateInput, setExchangeRateInput] = useState<string>(propOrder.exchangeRate?.toString() || "1");
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  React.useEffect(() => {
    if (propOrder.exchangeRate !== undefined) {
      setExchangeRateInput(propOrder.exchangeRate.toString());
    }
  }, [propOrder.exchangeRate]);

  const handleDeletePayment = (paymentId: string) => {
    setDeletingPaymentId(paymentId);
  };

  const confirmDeletePayment = async () => {
    if (!deletingPaymentId) return;
    
    const updatedPayments = (order.payments || []).filter(p => p.id !== deletingPaymentId);
    const updatedOrder = {
      ...order,
      payments: updatedPayments,
    };
    const finalOrder = recalculateOrder(updatedOrder, products);
    
    try {
      await updateOrderWithHistory(
        finalOrder,
        "Xóa thanh toán",
        "Đã xóa một giao dịch thanh toán"
      );
      setDeletingPaymentId(null);
    } catch (err) {
      alert("Có lỗi khi xóa thanh toán. Vui lòng thử lại.");
    }
  };

  const cancelDeletePayment = () => {
    setDeletingPaymentId(null);
  };

  const handleEditPayment = (payment: Payment) => {
    setEditingPayment(payment);
    setShowPaymentModal(true);
  };

  const isOrderClosed =
    order.status === OrderStatus.COMPLETED ||
    order.status === OrderStatus.CANCELLED;

  const canModifyOrder = () => {
    if (isOrderClosed) return false;
    if (isAdmin) return true;

    const hasReceipts = order.receipts && order.receipts.length > 0;
    const hasReceivedItems = order.items.some((item) => item.receivedQty > 0);
    const isFromQuotation =
      !!order.quotationId || order.name.startsWith("Đơn hàng từ ");
    const isProcessed = order.status !== OrderStatus.PROCESSING;

    return (
      !hasReceipts && !hasReceivedItems && !isFromQuotation && !isProcessed
    );
  };

  const updateOrderWithHistory = async (
    newOrder: Order,
    action: string,
    details: string = "",
  ) => {
    if (!user) return;

    const historyRecord: import("../types").OrderHistory = {
      id: crypto.randomUUID(),
      action,
      details,
      timestamp: new Date().toISOString(),
      user: user.username,
    };

    const updatedOrder = {
      ...newOrder,
      history: [historyRecord, ...(newOrder.history || [])],
    };

    await onUpdate(updatedOrder);
  };

  const handleAddNote = async () => {
    if (!newNote.trim() || !user) return;

    const note: import("../types").OrderNote = {
      id: crypto.randomUUID(),
      content: newNote.trim(),
      createdAt: new Date().toISOString(),
      createdBy: user.username,
    };

    const updatedOrder = {
      ...order,
      notes: [...(order.notes || []), note],
    };

    try {
      await updateOrderWithHistory(
        updatedOrder,
        "Thêm ghi chú",
        newNote.trim(),
      );
      setNewNote("");
    } catch (err) {
      alert("Có lỗi khi thêm ghi chú. Vui lòng thử lại.");
    }
  };

  const totalOrdered = order.items.reduce(
    (sum, item) => sum + item.orderedQty,
    0,
  );
  const totalReceived = order.items.reduce(
    (sum, item) => sum + item.receivedQty,
    0,
  );
  
  const totalExpectedCost = order.items.reduce(
    (sum, item) => sum + (item.orderedQty * item.expectedPrice),
    0
  );

  const progress =
    totalOrdered > 0 ? Math.round((totalReceived / totalOrdered) * 100) : 0;

  const priceIncreasedItems = order.items.filter((item) => {
    const avgPrice =
      item.receivedQty > 0
        ? (item.totalReceivedCost ?? item.receivedQty * item.actualPrice) /
          item.receivedQty
        : item.actualPrice;
    return (
      avgPrice > item.expectedPrice || item.actualPrice > item.expectedPrice
    );
  }).length;

  const filteredItems = order.items.filter((item) => {
    const term = searchTerm.toLowerCase();
    const matchesSearch =
      String(item.name).toLowerCase().includes(term) ||
      (item.productName &&
        String(item.productName).toLowerCase().includes(term));
    if (!matchesSearch) return false;

    const missingQty = Math.max(0, item.orderedQty - item.receivedQty);
    const isCompleted = item.receivedQty >= item.orderedQty;
    const avgPrice =
      item.receivedQty > 0
        ? (item.totalReceivedCost ?? item.receivedQty * item.actualPrice) /
          item.receivedQty
        : item.actualPrice;
    const isPriceIncreased =
      avgPrice > item.expectedPrice || item.actualPrice > item.expectedPrice;
    const isOverReceived = item.receivedQty > item.orderedQty;

    if (filterStatus === "missing" && missingQty === 0) return false;
    if (filterStatus === "completed" && !isCompleted) return false;
    if (filterStatus === "price_increased" && !isPriceIncreased) return false;
    if (filterStatus === "over_received" && !isOverReceived) return false;

    return true;
  });

  const totalPages = Math.ceil(filteredItems.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const paginatedItems = filteredItems.slice(
    startIndex,
    startIndex + ITEMS_PER_PAGE,
  );

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
    setCurrentPage(1);
  };

  const handleFilterChange = (status: any) => {
    setFilterStatus(status);
    setCurrentPage(1);
  };

  const handleOpenEdit = (item: OrderItem) => {
    setEditingItem(item);
    setNewReceivedQty("0"); // Default to 0 new items
    setNewActualPrice(item.actualPrice.toString());
    setNewForeignActualPrice(item.foreignActualPrice?.toString() || "");
  };

  const handleDeleteItemClick = (itemId: string) => {
    setDeletingItemId(itemId);
  };

  const confirmDeleteItem = async () => {
    if (!deletingItemId) return;
    
    const itemToDelete = order.items.find(i => i.id === deletingItemId);
    if (!itemToDelete) {
      setDeletingItemId(null);
      return;
    }

    const itemName = itemToDelete.name.toLowerCase();

    // 1. Filter from original items
    const updatedItems = order.items.filter(
      (item) => item.id !== deletingItemId,
    );

    // 2. Filter from order files
    const updatedOrderFiles = (order.orderFiles || []).map(file => ({
      ...file,
      records: file.records.filter(r => 
        r.itemId !== deletingItemId && 
        String(r.name || "").toLowerCase() !== itemName
      )
    })).filter(file => file.records.length > 0);

    // 3. Filter from receipts
    const updatedReceipts = (order.receipts || []).map(receipt => ({
      ...receipt,
      records: receipt.records.filter(r => 
        r.itemId !== deletingItemId && 
        String(r.name || "").toLowerCase() !== itemName
      )
    })).filter(receipt => receipt.records.length > 0);

    const finalOrder = recalculateOrder({ 
      ...order, 
      items: updatedItems,
      orderFiles: updatedOrderFiles,
      receipts: updatedReceipts
    }, products);

    try {
      await updateOrderWithHistory(
        finalOrder,
        "Xóa sản phẩm",
        `Đã xóa sản phẩm: ${itemToDelete.name}`,
      );
      setDeletingItemId(null);
    } catch (err) {
      alert("Có lỗi khi xóa sản phẩm. Vui lòng thử lại.");
    }
  };

  const cancelDeleteItem = () => {
    setDeletingItemId(null);
  };

  const handleSaveEdit = async () => {
    if (!editingItem) return;

    const addedQty = parseInt(newReceivedQty, 10) || 0;
    const updatedForeignPrice = parseFloat(newForeignActualPrice) || editingItem.foreignActualPrice || 0;
    const updatedPrice = order.currency && order.currency !== "VND"
      ? Math.round(updatedForeignPrice * (order.exchangeRate || 1))
      : (parseFloat(newActualPrice) || editingItem.actualPrice);

    const newTotalReceived = editingItem.receivedQty + addedQty;
    if (newTotalReceived > editingItem.orderedQty) {
      setOverReceiveConfirm({
        item: editingItem,
        addedQty,
        updatedPrice,
        newTotalReceived,
      });
      return;
    }

    await executeSaveEdit(editingItem, addedQty, updatedPrice);
  };

  const executeSaveEdit = async (
    itemToEdit: OrderItem,
    addedQty: number,
    updatedPrice: number,
  ) => {
    const updatedItems = order.items.map((item) => {
      if (item.id === itemToEdit.id) {
        const manualQty =
          (item.manualReceivedQty !== undefined
            ? item.manualReceivedQty
            : item.receivedQty) + addedQty;
        const currentManualCost =
          item.manualTotalCost !== undefined
            ? item.manualTotalCost
            : (item.totalReceivedCost ?? item.receivedQty * item.actualPrice);
        const manualCost = currentManualCost + addedQty * updatedPrice;

        return {
          ...item,
          manualReceivedQty: manualQty,
          manualTotalCost: manualCost,
          actualPrice: updatedPrice, // Manual update overrides latest price
          foreignActualPrice: order.currency && order.currency !== "VND" ? (parseFloat(newForeignActualPrice) || item.foreignActualPrice) : undefined,
        };
      }
      return item;
    });

    const finalOrder = recalculateOrder({ ...order, items: updatedItems }, products);
    try {
      await updateOrderWithHistory(
        finalOrder,
        "Cập nhật sản phẩm",
        `Sản phẩm: ${itemToEdit.name}\nSố lượng nhận: ${itemToEdit.receivedQty} -> ${itemToEdit.receivedQty + addedQty}\nGiá thực tế: ${formatCurrency(itemToEdit.actualPrice)} -> ${formatCurrency(updatedPrice)}`,
      );
      setEditingItem(null);
      setOverReceiveConfirm(null);
    } catch (err) {
      alert("Có lỗi khi lưu thay đổi. Vui lòng thử lại.");
    }
  };

  const handleExportExcel = () => {
    const data = filteredItems.map((item) => {
      const avgPrice =
        item.receivedQty > 0
          ? (item.totalReceivedCost ?? item.receivedQty * item.actualPrice) /
            item.receivedQty
          : item.actualPrice;

      return {
        "Tên sản phẩm": item.name,
        "Số lượng đặt": item.orderedQty,
        "Đã về": item.receivedQty,
        "Còn thiếu / Dư":
          item.receivedQty > item.orderedQty
            ? `Dư ${item.receivedQty - item.orderedQty}`
            : Math.max(0, item.orderedQty - item.receivedQty),
        "Giá đặt (VND)": item.expectedPrice,
        "Giá mới nhất (VND)": item.actualPrice,
        "Giá bình quân (VND)": Math.round(avgPrice),
        "Chênh lệch giá BQ": Math.round(avgPrice - item.expectedPrice),
        "Trạng thái":
          item.receivedQty > item.orderedQty
            ? "Vượt số lượng"
            : item.receivedQty === item.orderedQty
              ? "Đã đủ"
              : "Còn thiếu",
      };
    });

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Danh sách sản phẩm");

    XLSX.writeFile(
      wb,
      `${order.name}_${new Date().toISOString().split("T")[0]}.xlsx`,
    );
  };

  const handleExportDiscrepancy = () => {
    const discrepancyItems = order.items.filter(
      (item) => item.receivedQty !== item.orderedQty,
    );

    if (discrepancyItems.length === 0) {
      alert("Đơn hàng đã về đủ, không có chênh lệch.");
      return;
    }

    const data = discrepancyItems.map((item) => ({
      "Mã sản phẩm": item.name,
      "Tên sản phẩm": item.productName || "",
      "Số lượng đặt": item.orderedQty,
      "Số lượng thực nhận": item.receivedQty,
      "Chênh lệch": item.receivedQty - item.orderedQty,
      "Trạng thái":
        item.receivedQty > item.orderedQty ? "Dư hàng" : "Thiếu hàng",
      "Giá đặt": item.expectedPrice,
      "Giá thực tế": item.actualPrice,
      "Giá trị chênh lệch (VND)":
        (item.receivedQty - item.orderedQty) * item.expectedPrice,
      "Ghi chú": "",
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Báo cáo chênh lệch");

    XLSX.writeFile(wb, `BAO_CAO_CHENH_LECH_${order.name}.xlsx`);
  };

  const handleBarcodeScan = async (code: string) => {
    const lowerCode = code.toLowerCase();
    const item = order.items.find(
      (i) =>
        String(i.name).toLowerCase() === lowerCode ||
        (i.productName && String(i.productName).toLowerCase() === lowerCode),
    );

    if (item) {
      const updatedItems = order.items.map((i) => {
        if (i.id === item.id) {
          const manualQty =
            (i.manualReceivedQty !== undefined
              ? i.manualReceivedQty
              : i.receivedQty) + 1;
          const currentManualCost =
            i.manualTotalCost !== undefined
              ? i.manualTotalCost
              : (i.totalReceivedCost ?? i.receivedQty * i.actualPrice);
          const manualCost = currentManualCost + 1 * i.actualPrice;

          return {
            ...i,
            manualReceivedQty: manualQty,
            manualTotalCost: manualCost,
            receivedQty: manualQty,
            totalReceivedCost: manualCost,
          };
        }
        return i;
      });
      try {
        await updateOrderWithHistory(
          recalculateOrder({ ...order, items: updatedItems }, products),
          "Quét mã vạch",
          `Đã quét và cộng 1 cho sản phẩm: ${item.name}`,
        );

        // If not continuous scan, close scanner
        if (!isContinuousScan) {
          setShowScanner(false);
        }
      } catch (err) {
        alert("Có lỗi khi cập nhật số lượng. Vui lòng thử lại.");
      }
    } else {
      alert(`Không tìm thấy sản phẩm với mã: ${code}`);
    }
  };

  const handleStatusChange = async (newStatus: OrderStatus) => {
    try {
      await updateOrderWithHistory(
        { ...order, status: newStatus },
        "Cập nhật trạng thái",
        `Trạng thái: ${order.status} -> ${newStatus}`,
      );
    } catch (err) {
      alert("Có lỗi khi cập nhật trạng thái. Vui lòng thử lại.");
    }
  };

  const handleImportReceivedExcel = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsMapping(true);
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const data = evt.target?.result;
        if (!data) return;

        const wb = XLSX.read(data, { type: "array" });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const jsonData = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];

        // Try heuristic first
        const heuristicResult = parseExcelData(jsonData);
        let parsedRecords = Array.isArray(heuristicResult)
          ? heuristicResult
          : heuristicResult.records || [];

        // If heuristic found very few records or failed, try AI mapping
        if (parsedRecords.length === 0 && jsonData.length > 0) {
          const aiResult = await mapExcelHeaders(jsonData);
          const { colMap, headerIndex } = aiResult;

          if (colMap.productCode !== -1 && headerIndex !== -1) {
            const aiRecords = [];
            for (let i = headerIndex + 1; i < jsonData.length; i++) {
              const row = jsonData[i];
              if (!Array.isArray(row)) continue;

              const name = String(row[colMap.productCode] || "").trim();
              if (!name) continue;

              const productName =
                colMap.productName !== -1
                  ? String(row[colMap.productName] || "").trim()
                  : undefined;
              const qty =
                colMap.quantity !== -1 ? parseNumber(row[colMap.quantity]) : 1;
              const price =
                colMap.price !== -1 ? parseNumber(row[colMap.price]) : 0;

              if (name) {
                aiRecords.push({ name, productName, qty, price });
              }
            }
            if (aiRecords.length > 0) {
              parsedRecords = aiRecords;
            }
          }
        }

        const totalKeywords = ["total", "grand total", "tổng cộng", "cộng", "subtotal", "sum"];
        parsedRecords = parsedRecords.filter((record: any) => {
          const name = String(record.name || "").toLowerCase();
          return !totalKeywords.some(keyword => name.includes(keyword));
        });

        if (parsedRecords.length === 0) {
          alert("Lỗi: Không tìm thấy dữ liệu hợp lệ trong file Excel. Vui lòng kiểm tra lại định dạng file, tiêu đề cột hoặc thử lại (có thể do lỗi kết nối AI).");
          return;
        }

        let matchedCount = 0;
        const unmatchedItems: { name: string; productName?: string; qty: number; price: number }[] = [];
        const overReceivedItems: { name: string; excess: number }[] = [];

        const records: import("../types").ReceiptRecord[] = [];

        parsedRecords.forEach((record: any) => {
          const cleanName = String(record.name || "")
            .toLowerCase()
            .trim();
          const cleanProductName = String(record.productName || "")
            .toLowerCase()
            .trim();

          const item = order.items.find((i) => {
            const iName = String(i.name || "")
              .toLowerCase()
              .trim();
            const iProductName = String(i.productName || "")
              .toLowerCase()
              .trim();

            return (
              iName === cleanName ||
              (cleanProductName && iProductName === cleanProductName) ||
              (cleanProductName && iName === cleanProductName) ||
              (iProductName && iProductName === cleanName)
            );
          });

          let finalProductName = record.productName;
          const searchKey1 = String(record.name || "").toLowerCase().trim();
          const searchKey2 = String(record.productName || "").toLowerCase().trim();
          const matchedProduct = products.find(p => 
            p.sku.toLowerCase().trim() === searchKey1 || 
            p.name.toLowerCase().trim() === searchKey1 ||
            (searchKey2 && (p.sku.toLowerCase().trim() === searchKey2 || p.name.toLowerCase().trim() === searchKey2))
          );
          if (matchedProduct) {
            finalProductName = matchedProduct.name;
          }

          if (item) {
            records.push({
              itemId: item.id,
              name: item.name,
              productName: finalProductName,
              qty: record.qty,
              price: record.price,
            });
            matchedCount++;
          } else {
            unmatchedItems.push({
              name: record.name,
              productName: finalProductName,
              qty: record.qty,
              price: record.price,
            });
          }
        });

        const newReceipt: import("../types").Receipt = {
          id: crypto.randomUUID(),
          fileName: file.name,
          importedAt: new Date().toISOString(),
          records,
        };

        const updatedOrder = {
          ...order,
          receipts: [...(order.receipts || []), newReceipt],
        };

        const finalOrder = recalculateOrder(updatedOrder, products);

        // Check for over received
        finalOrder.items.forEach((item) => {
          if (item.receivedQty > item.orderedQty) {
            const record = records.find((r) => r.itemId === item.id);
            if (record) {
              overReceivedItems.push({
                name: item.name,
                excess: item.receivedQty - item.orderedQty,
              });
            }
          }
        });

        try {
          await updateOrderWithHistory(
            finalOrder,
            "Nhập file Excel",
            `File: ${file.name}\nCập nhật thành công ${matchedCount} sản phẩm.`,
          );

          // Cross-order matching for unmatched items
          const foundInOtherOrders: {
            name: string;
            productName?: string;
            qty: number;
            price: number;
            orderId: string;
            orderName: string;
            orderCode?: string;
          }[] = [];
          const trulyUnmatched: typeof unmatchedItems = [];

          unmatchedItems.forEach((unmatched) => {
            const otherOrders = allOrders.filter(
              (o) =>
                o.id !== order.id &&
                (o.status === OrderStatus.PROCESSING ||
                  o.status === OrderStatus.PARTIAL) &&
                ((order.type === OrderType.SALES &&
                  ((order.customerCode && o.customerCode === order.customerCode) ||
                   (!order.customerCode && o.customerName === order.customerName))) ||
                  (order.type === OrderType.PURCHASE &&
                    o.supplier === order.supplier)),
            );

            let found = false;
            for (const otherOrder of otherOrders) {
              const matchingItem = otherOrder.items.find((i) => {
                const iName = String(i.name || "").toLowerCase().trim();
                const iProductName = String(i.productName || "")
                  .toLowerCase()
                  .trim();
                const uName = String(unmatched.name || "").toLowerCase().trim();
                const uProductName = String(unmatched.productName || "")
                  .toLowerCase()
                  .trim();

                return (
                  iName === uName ||
                  (uProductName && iProductName === uProductName) ||
                  (uProductName && iName === uProductName) ||
                  (iProductName && iProductName === uName)
                );
              });

              if (matchingItem) {
                foundInOtherOrders.push({
                  ...unmatched,
                  orderId: otherOrder.id,
                  orderName: otherOrder.name,
                  orderCode: otherOrder.orderCode,
                });
                found = true;
                break;
              }
            }
            if (!found) {
              trulyUnmatched.push(unmatched);
            }
          });

          setImportResult({
            matched: matchedCount,
            unmatched: trulyUnmatched,
            foundInOtherOrders: foundInOtherOrders,
            overReceived: overReceivedItems,
          });
        } catch (err) {
          console.error("Error saving order:", err);
          alert("Có lỗi khi lưu dữ liệu lên máy chủ. Vui lòng thử lại.");
        }
      } catch (err) {
        console.error("Error processing file:", err);
        alert("Có lỗi khi xử lý file Excel. Vui lòng kiểm tra lại định dạng file (.xlsx, .xls, .csv) hoặc liên hệ hỗ trợ.");
      } finally {
        setIsMapping(false);
      }
    };
    reader.readAsArrayBuffer(file);

    if (e.target) {
      e.target.value = "";
    }
  };

  const handleApplyToOtherOrder = async (
    orderId: string,
    items: {
      name: string;
      productName?: string;
      qty: number;
      price: number;
      orderId: string;
      orderName: string;
    }[],
  ) => {
    const targetOrder = allOrders.find((o) => o.id === orderId);
    if (!targetOrder) return;

    const newReceipt: import("../types").Receipt = {
      id: crypto.randomUUID(),
      fileName: `Phát sinh từ ${order.name}`,
      importedAt: new Date().toISOString(),
      records: items.map((item) => {
        const matchingItem = targetOrder.items.find((i) => {
          const iName = String(i.name || "").toLowerCase().trim();
          const iProductName = String(i.productName || "")
            .toLowerCase()
            .trim();
          const uName = String(item.name || "").toLowerCase().trim();
          const uProductName = String(item.productName || "")
            .toLowerCase()
            .trim();
          return (
            iName === uName ||
            (uProductName && iProductName === uProductName) ||
            (uProductName && iName === uProductName) ||
            (iProductName && iProductName === uName)
          );
        });
        return {
          itemId: matchingItem!.id,
          name: matchingItem!.name,
          productName: item.productName,
          qty: item.qty,
          price: item.price,
        };
      }),
    };

    const updatedOrder = {
      ...targetOrder,
      receipts: [...(targetOrder.receipts || []), newReceipt],
    };

    const finalOrder = recalculateOrder(updatedOrder, products);

    try {
      await onUpdate(finalOrder);
      // Remove these items from importResult
      if (importResult) {
        setImportResult({
          ...importResult,
          foundInOtherOrders: importResult.foundInOtherOrders.filter(
            (f) => f.orderId !== orderId,
          ),
        });
      }
    } catch (err) {
      console.error("Error applying to other order:", err);
      alert("Có lỗi khi cập nhật đơn hàng khác.");
    }
  };

  const handleAddUnmatchedItems = async () => {
    if (!importResult || importResult.unmatched.length === 0) return;

    // Latest receipt is the one we just added
    const latestReceipt = order.receipts?.[order.receipts.length - 1];
    if (!latestReceipt) return;

    const newRecords = importResult.unmatched.map((unmatched) => ({
      itemId: crypto.randomUUID(),
      name: unmatched.name,
      productName: unmatched.productName,
      qty: unmatched.qty,
      price: unmatched.price,
    }));

    const updatedReceipts = order.receipts!.map((r, idx) => {
      if (idx === order.receipts!.length - 1) {
        return {
          ...r,
          records: [...r.records, ...newRecords],
        };
      }
      return r;
    });

    const updatedOrder = {
      ...order,
      receipts: updatedReceipts,
    };

    const finalOrder = recalculateOrder(updatedOrder, products);

    try {
      await updateOrderWithHistory(
        finalOrder,
        "Thêm sản phẩm phát sinh",
        `Đã thêm ${newRecords.length} sản phẩm phát sinh từ file NCC vào đơn hàng.`
      );
      setImportResult(null);
    } catch (err) {
      console.error("Error adding unmatched items:", err);
      alert("Có lỗi khi thêm sản phẩm phát sinh. Vui lòng thử lại.");
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (isOrderClosed) return;
    const file = e.dataTransfer.files?.[0];
    if (file && (file.name.endsWith(".xlsx") || file.name.endsWith(".xls") || file.name.endsWith(".csv"))) {
      const mockEvent = {
        target: { files: [file] }
      } as unknown as React.ChangeEvent<HTMLInputElement>;
      handleImportReceivedExcel(mockEvent);
    } else {
      alert("Vui lòng kéo thả file Excel (.xlsx, .xls, .csv)");
    }
  };

  return (
    <div 
      className="p-8 max-w-7xl mx-auto relative"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {isDragging && !isOrderClosed && (
        <div className="absolute inset-0 z-50 bg-blue-500/10 border-4 border-dashed border-blue-500 rounded-3xl flex items-center justify-center backdrop-blur-sm transition-all animate-in fade-in duration-200">
          <div className="bg-white p-8 rounded-2xl shadow-2xl text-center">
            <Upload className="w-16 h-16 text-blue-600 mx-auto mb-4 animate-bounce" />
            <h3 className="text-xl font-bold text-slate-900">Thả file vào đây để nhập Excel hàng về</h3>
            <p className="text-slate-500 mt-2">Hỗ trợ .xlsx, .xls, .csv</p>
          </div>
        </div>
      )}
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-slate-500 hover:text-slate-900 transition-colors mb-6 font-medium"
      >
        <ArrowLeft className="w-4 h-4" />
        Quay lại danh sách
      </button>

      {isMapping && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="bg-white p-8 rounded-2xl shadow-xl flex flex-col items-center gap-4 max-w-sm text-center">
            <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
            <h3 className="text-lg font-bold text-slate-900">
              Đang xử lý dữ liệu AI...
            </h3>
            <p className="text-slate-500">
              Hệ thống đang tự động nhận diện và ghép các cột từ file Excel của
              bạn.
            </p>
          </div>
        </div>
      )}

      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-3xl font-bold text-slate-900 tracking-tight">
              {order.name}
            </h1>
            {order.orderCode && (
              <span className="text-xs font-mono bg-slate-100 text-slate-600 px-2 py-1 rounded-md border border-slate-200">
                Mã ĐH: {order.orderCode}
              </span>
            )}
            <select
              value={order.status || OrderStatus.PROCESSING}
              onChange={(e) =>
                handleStatusChange(e.target.value as OrderStatus)
              }
              disabled={!isAdmin}
              className={`text-xs font-bold px-3 py-1 rounded-full border-2 transition-all outline-none ${
                !isAdmin
                  ? "cursor-not-allowed opacity-80"
                  : "cursor-pointer hover:bg-opacity-80"
              } ${
                order.status === OrderStatus.COMPLETED
                  ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                  : order.status === OrderStatus.PARTIAL
                    ? "bg-blue-50 text-blue-700 border-blue-200"
                    : order.status === OrderStatus.PROCESSING
                      ? "bg-indigo-50 text-indigo-700 border-indigo-200"
                      : order.status === OrderStatus.CANCELLED
                        ? "bg-slate-100 text-slate-700 border-slate-300"
                        : "bg-slate-50 text-slate-700 border-slate-200"
              }`}
            >
              <option value={OrderStatus.PROCESSING}>ĐANG XỬ LÝ</option>
              <option value={OrderStatus.PARTIAL}>ĐANG VỀ (MỘT PHẦN)</option>
              <option value={OrderStatus.COMPLETED}>HOÀN TẤT</option>
              <option value={OrderStatus.CANCELLED}>ĐÃ HỦY</option>
            </select>
            {order.type === OrderType.PURCHASE && (
              <div className="flex items-center gap-2 bg-slate-100 px-3 py-1 rounded-lg border border-slate-200">
                <span className="text-xs font-bold text-slate-500 uppercase">Tiền tệ:</span>
                <select
                  value={order.currency || "VND"}
                  disabled={!canModifyOrder()}
                  onChange={async (e) => {
                    const newCurrency = e.target.value;
                    const updatedOrder = {
                      ...order,
                      currency: newCurrency,
                      exchangeRate: newCurrency === "VND" ? 1 : (order.exchangeRate || 1)
                    };
                    await updateOrderWithHistory(updatedOrder, "Thay đổi tiền tệ", `Tiền tệ: ${newCurrency}`);
                  }}
                  className="text-xs font-bold bg-transparent outline-none text-slate-700 cursor-pointer disabled:cursor-not-allowed"
                >
                  <option value="VND">VND</option>
                  <option value="USD">USD</option>
                  <option value="KRW">KRW</option>
                  <option value="CNY">CNY</option>
                </select>
                {order.currency && order.currency !== "VND" && (
                  <>
                    <span className="text-slate-300">|</span>
                    <span className="text-xs font-bold text-slate-500 uppercase">Tỷ giá:</span>
                    <input
                      type="text"
                      value={exchangeRateInput}
                      disabled={!canModifyOrder()}
                      onChange={(e) => setExchangeRateInput(e.target.value)}
                      onBlur={async () => {
                        const newRate = parseNumber(exchangeRateInput);
                        if (newRate <= 0 || newRate === order.exchangeRate) {
                          setExchangeRateInput(order.exchangeRate?.toString() || "1");
                          return;
                        }
                        setExchangeRateInput(new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 4 }).format(newRate));
                        const updatedItems = order.items.map(item => ({
                          ...item,
                          expectedPrice: Math.round((item.foreignExpectedPrice || 0) * newRate),
                          actualPrice: Math.round((item.foreignActualPrice || 0) * newRate)
                        }));
                        const updatedOrder = {
                          ...order,
                          exchangeRate: newRate,
                          items: updatedItems
                        };
                        await updateOrderWithHistory(recalculateOrder(updatedOrder, products), "Thay đổi tỷ giá", `Tỷ giá: ${newRate}`);
                      }}
                      onKeyDown={async (e) => {
                        if (e.key === 'Enter') {
                          e.currentTarget.blur();
                        }
                      }}
                      className="w-20 text-xs font-bold bg-transparent outline-none text-slate-700 border-b border-slate-300 focus:border-emerald-500 disabled:cursor-not-allowed"
                    />
                  </>
                )}
              </div>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-slate-500">
            {order.type === OrderType.SALES ? (
              <span className="flex items-center gap-1.5">
                Khách hàng:{" "}
                <strong className="text-slate-700">
                  {order.customerName || "Khách lẻ"}
                  {order.customerCode && ` (${order.customerCode})`}
                </strong>
              </span>
            ) : (
              <span className="flex items-center gap-1.5">
                NCC: <strong className="text-slate-700">{order.supplier || "Chưa xác định"}</strong>
              </span>
            )}
            <span className="hidden sm:inline text-slate-300">•</span>
            <span className="flex items-center gap-1.5">
              Ngày đặt:{" "}
              <strong className="text-slate-700">
                {new Date(order.date).toLocaleDateString("vi-VN")}
              </strong>
            </span>
            <span className="hidden sm:inline text-slate-300">•</span>
            <span className="flex items-center gap-1.5">
              Tiến độ: <strong className="text-blue-600">{progress}%</strong>
              <span className="text-slate-400 text-xs">
                ({formatNumber(totalReceived)}/{formatNumber(totalOrdered)})
              </span>
            </span>
          </div>
        </div>
        <div className="flex flex-wrap gap-3 w-full md:w-auto">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleImportReceivedExcel}
            accept=".xlsx, .xls, .csv"
            className="hidden"
            disabled={isOrderClosed}
          />
          {!isOrderClosed && (
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isMapping}
              className="bg-blue-50 text-blue-600 hover:bg-blue-100 px-4 py-2 rounded-xl font-medium flex items-center gap-2 transition-all shadow-sm disabled:opacity-50"
            >
              {isMapping ? (
                <div className="w-4 h-4 border-2 border-slate-300 border-t-blue-600 rounded-full animate-spin" />
              ) : (
                <Upload className="w-4 h-4" />
              )}
              Nhập file NCC
            </button>
          )}
          <button
            onClick={handleExportDiscrepancy}
            className="bg-rose-50 text-rose-600 hover:bg-rose-100 px-4 py-2 rounded-xl font-medium flex items-center gap-2 transition-all shadow-sm"
          >
            <FileWarning className="w-4 h-4" />
            Báo cáo chênh lệch
          </button>
          <button
            onClick={handleExportExcel}
            className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 px-4 py-2 rounded-xl font-medium flex items-center gap-2 transition-all shadow-sm"
          >
            <Download className="w-4 h-4" />
            Xuất Excel
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 hover:border-blue-200 transition-colors">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-slate-500 font-medium text-sm uppercase tracking-wider">
              Tổng đặt hàng
            </h3>
            <Package className="w-5 h-5 text-blue-500" />
          </div>
          <div className="text-3xl font-bold text-slate-900">
            {formatNumber(totalOrdered)}
          </div>
          <p className="text-xs text-slate-400 mt-2">
            Số lượng sản phẩm theo đơn đặt
          </p>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 hover:border-emerald-200 transition-colors">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-slate-500 font-medium text-sm uppercase tracking-wider">
              Tổng đã nhận
            </h3>
            <CheckCircle className="w-5 h-5 text-emerald-500" />
          </div>
          <div className="text-3xl font-bold text-slate-900">
            {formatNumber(totalReceived)}
          </div>
          <p className="text-xs text-slate-400 mt-2">
            Số lượng thực tế đã nhập kho
          </p>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 hover:border-indigo-200 transition-colors">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-slate-500 font-medium text-sm uppercase tracking-wider">
              Tiến độ hoàn thành
            </h3>
            <TrendingUp className="w-5 h-5 text-indigo-500" />
          </div>
          <div className="flex items-end gap-3 mb-3">
            <div className="text-3xl font-bold text-slate-900">{progress}%</div>
            <div className="text-xs text-slate-400 pb-1">hoàn thành</div>
          </div>
          <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-indigo-500 rounded-full transition-all duration-500"
              style={{ width: `${Math.min(progress, 100)}%` }}
            />
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 hover:border-rose-200 transition-colors">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-slate-500 font-medium text-sm uppercase tracking-wider">
              Cảnh báo giá
            </h3>
            <AlertTriangle
              className={`w-5 h-5 ${priceIncreasedItems > 0 ? "text-rose-500" : "text-slate-300"}`}
            />
          </div>
          <div className="text-3xl font-bold text-slate-900">
            {priceIncreasedItems}
          </div>
          <p className="text-xs text-slate-400 mt-2">
            Sản phẩm bị tăng giá so với đặt hàng
          </p>
        </div>
      </div>

      <div className="flex gap-4 mb-6 border-b border-slate-200">
        <button
          onClick={() => setActiveTab("items")}
          className={`pb-3 px-4 font-medium text-sm flex items-center gap-2 transition-colors relative ${
            activeTab === "items"
              ? "text-emerald-600"
              : "text-slate-500 hover:text-slate-700"
          }`}
        >
          <Package className="w-4 h-4" />
          Chi tiết sản phẩm
          {activeTab === "items" && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-emerald-600 rounded-t-full" />
          )}
        </button>
        <button
          onClick={() => setActiveTab("payments")}
          className={`pb-3 px-4 font-medium text-sm flex items-center gap-2 transition-colors relative ${
            activeTab === "payments"
              ? "text-emerald-600"
              : "text-slate-500 hover:text-slate-700"
          }`}
        >
          <FileText className="w-4 h-4" />
          Thanh toán
          {activeTab === "payments" && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-emerald-600 rounded-t-full" />
          )}
        </button>
        <button
          onClick={() => setActiveTab("analytics")}
          className={`pb-3 px-4 font-medium text-sm flex items-center gap-2 transition-colors relative ${
            activeTab === "analytics"
              ? "text-emerald-600"
              : "text-slate-500 hover:text-slate-700"
          }`}
        >
          <TrendingUp className="w-4 h-4" />
          Thống kê
          {activeTab === "analytics" && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-emerald-600 rounded-t-full" />
          )}
        </button>
      </div>

      {activeTab === "items" && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between bg-slate-50/50 gap-4">
            <h2 className="text-lg font-bold text-slate-800">
              Danh sách sản phẩm
            </h2>
            <div className="flex flex-col sm:flex-row gap-3">
            {!isOrderClosed && (
              <>
                <button
                  onClick={() => setShowScanner(true)}
                  className="px-3 py-2 rounded-lg flex items-center gap-2 text-sm font-medium transition-colors border bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200"
                >
                  <Camera className="w-4 h-4" />
                  Quét Camera
                </button>
                <button
                  onClick={() => {
                    setIsContinuousScan(!isContinuousScan);
                    searchInputRef.current?.focus();
                  }}
                  className={`px-3 py-2 rounded-lg flex items-center gap-2 text-sm font-medium transition-colors border ${
                    isContinuousScan
                      ? "bg-emerald-100 text-emerald-700 border-emerald-200"
                      : "bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200"
                  }`}
                  title="Chế độ quét liên tục: Tự động cộng 1 khi quét mã"
                >
                  <Barcode className="w-4 h-4" />
                  {isContinuousScan ? "Đang quét liên tục" : "Quét mã"}
                </button>
              </>
            )}
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Tìm mã hoặc tên sản phẩm..."
                value={searchTerm}
                onChange={handleSearchChange}
                onKeyDown={async (e) => {
                  if (e.key === "Enter") {
                    if (isOrderClosed) return;
                    if (filteredItems.length === 1) {
                      if (isContinuousScan) {
                        const item = filteredItems[0];
                        const updatedItems = order.items.map((i) => {
                          if (i.id === item.id) {
                            const manualQty =
                              (i.manualReceivedQty !== undefined
                                ? i.manualReceivedQty
                                : i.receivedQty) + 1;
                            const currentManualCost =
                              i.manualTotalCost !== undefined
                                ? i.manualTotalCost
                                : (i.totalReceivedCost ??
                                  i.receivedQty * i.actualPrice);
                            const manualCost =
                              currentManualCost + 1 * i.actualPrice;

                            return {
                              ...i,
                              manualReceivedQty: manualQty,
                              manualTotalCost: manualCost,
                              receivedQty: manualQty,
                              totalReceivedCost: manualCost,
                            };
                          }
                          return i;
                        });
                        try {
                          await updateOrderWithHistory(
                            recalculateOrder({ ...order, items: updatedItems }, products),
                            "Quét mã vạch (Tìm kiếm)",
                            `Đã quét và cộng 1 cho sản phẩm: ${item.name}`,
                          );
                        } catch (err) {
                          alert(
                            "Có lỗi khi cập nhật sản phẩm. Vui lòng thử lại.",
                          );
                        }
                        setSearchTerm("");
                      } else {
                        handleOpenEdit(filteredItems[0]);
                        setSearchTerm("");
                      }
                    } else if (
                      filteredItems.length === 0 &&
                      searchTerm.trim() !== ""
                    ) {
                      alert("Không tìm thấy sản phẩm nào với mã này.");
                      setSearchTerm("");
                    }
                  }
                }}
                className="w-full pl-9 pr-4 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
              />
            </div>
            <div className="relative">
              <select
                value={filterStatus}
                onChange={(e) => handleFilterChange(e.target.value as any)}
                className="w-full sm:w-auto pl-9 pr-8 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all appearance-none"
              >
                <option value="all">Tất cả trạng thái</option>
                <option value="missing">Còn thiếu hàng</option>
                <option value="completed">Đã giao đủ</option>
                <option value="price_increased">Bị tăng giá</option>
                <option value="over_received">Vượt số lượng</option>
              </select>
              <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 text-xs uppercase tracking-wider font-semibold">
                <th className="px-6 py-4 whitespace-nowrap w-16">STT</th>
                <th className="px-6 py-4 whitespace-nowrap">Mã sản phẩm</th>
                <th className="px-6 py-4 whitespace-nowrap">Tên sản phẩm</th>
                <th className="px-6 py-4 text-right whitespace-nowrap">
                  Số lượng đặt
                </th>
                <th className="px-6 py-4 text-right whitespace-nowrap">
                  Số lượng thực nhận
                </th>
                <th className="px-6 py-4 text-right whitespace-nowrap">
                  Chênh lệch
                </th>
                {order.currency && order.currency !== "VND" && (
                  <th className="px-6 py-4 text-right whitespace-nowrap">
                    Đơn giá dự kiến ({order.currency})
                  </th>
                )}
                <th className="px-6 py-4 text-right whitespace-nowrap">
                  Đơn giá dự kiến (VND)
                </th>
                {order.currency && order.currency !== "VND" && (
                  <th className="px-6 py-4 text-right whitespace-nowrap">
                    Đơn giá thực tế ({order.currency})
                  </th>
                )}
                <th className="px-6 py-4 text-right whitespace-nowrap">
                  Đơn giá thực tế (VND)
                </th>
                <th className="px-6 py-4 text-right whitespace-nowrap">
                  Đơn giá bình quân
                </th>
                <th className="px-6 py-4 text-center whitespace-nowrap">
                  Cảnh báo
                </th>
                <th className="px-6 py-4 text-center whitespace-nowrap">
                  Thao tác
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paginatedItems.map((item, index) => {
                const missingQty = Math.max(
                  0,
                  item.orderedQty - item.receivedQty,
                );
                const avgPrice =
                  item.receivedQty > 0
                    ? (item.totalReceivedCost ??
                        item.receivedQty * item.actualPrice) / item.receivedQty
                    : item.actualPrice;
                const priceDiff = avgPrice - item.expectedPrice;
                const isPriceIncreased = priceDiff > 0;
                const isPriceDecreased = priceDiff < 0;
                const isCompleted = item.receivedQty >= item.orderedQty;
                const isOverReceived = item.receivedQty > item.orderedQty;
                const hasWarning =
                  missingQty > 0 || isPriceIncreased || isOverReceived;

                return (
                  <tr
                    key={item.id}
                    className={`transition-colors ${hasWarning ? "bg-rose-50/20 hover:bg-rose-50/40" : "hover:bg-slate-50/50"}`}
                  >
                    <td className="px-6 py-4 text-sm text-slate-500 font-medium">
                      {startIndex + index + 1}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="font-bold text-slate-900">
                        {item.name}
                      </div>
                    </td>
                    <td className="px-6 py-4 min-w-[200px]">
                      <div className="text-slate-600 text-sm line-clamp-2">
                        {item.productName || "-"}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right text-slate-600 font-medium whitespace-nowrap">
                      {formatNumber(item.orderedQty)}
                    </td>
                    <td className="px-6 py-4 text-right whitespace-nowrap">
                      <span
                        className={`font-bold ${isCompleted ? "text-emerald-600" : "text-blue-600"}`}
                      >
                        {formatNumber(item.receivedQty)}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right whitespace-nowrap">
                      {missingQty > 0 ? (
                        <span className="text-rose-600 font-bold bg-rose-50 px-2 py-1 rounded-md">
                          Thiếu {formatNumber(missingQty)}
                        </span>
                      ) : isOverReceived ? (
                        <span className="text-amber-600 font-bold bg-amber-50 px-2 py-1 rounded-md">
                          Dư {formatNumber(item.receivedQty - item.orderedQty)}
                        </span>
                      ) : (
                        <span className="text-slate-300">-</span>
                      )}
                    </td>
                    {order.currency && order.currency !== "VND" && (
                      <td className="px-6 py-4 text-right text-blue-600 font-medium whitespace-nowrap">
                        {formatNumber(item.foreignExpectedPrice || 0)}
                      </td>
                    )}
                    <td className="px-6 py-4 text-right text-slate-600 whitespace-nowrap">
                      {formatCurrency(item.expectedPrice)}
                    </td>
                    {order.currency && order.currency !== "VND" && (
                      <td className="px-6 py-4 text-right text-blue-500 whitespace-nowrap">
                        {formatNumber(item.foreignActualPrice || 0)}
                      </td>
                    )}
                    <td className="px-6 py-4 text-right text-slate-500 whitespace-nowrap">
                      {formatCurrency(item.actualPrice)}
                    </td>
                    <td className="px-6 py-4 text-right whitespace-nowrap">
                      <span
                        className={`font-bold ${isPriceIncreased ? "text-rose-600" : isPriceDecreased ? "text-emerald-600" : "text-slate-900"}`}
                      >
                        {formatCurrency(avgPrice)}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center whitespace-nowrap">
                      <div className="flex flex-col items-center gap-1.5">
                        {isPriceIncreased && (
                          <div className="flex items-center gap-1 text-rose-700 bg-rose-100 px-2 py-1 rounded text-xs font-bold border border-rose-200">
                            <TrendingUp className="w-3 h-3" /> Tăng{" "}
                            {formatCurrency(priceDiff)}
                          </div>
                        )}
                        {missingQty > 0 && (
                          <div className="flex items-center gap-1 text-orange-700 bg-orange-100 px-2 py-1 rounded text-xs font-bold border border-orange-200">
                            <AlertTriangle className="w-3 h-3" /> Thiếu hàng
                          </div>
                        )}
                        {isOverReceived && (
                          <div className="flex items-center gap-1 text-amber-700 bg-amber-100 px-2 py-1 rounded text-xs font-bold border border-amber-200">
                            <AlertTriangle className="w-3 h-3" /> Dư hàng
                          </div>
                        )}
                        {!isPriceIncreased &&
                          missingQty === 0 &&
                          !isOverReceived && (
                            <div className="flex items-center gap-1 text-emerald-700 bg-emerald-100 px-2 py-1 rounded text-xs font-bold border border-emerald-200">
                              <CheckCircle className="w-3 h-3" /> Ổn định
                            </div>
                          )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center whitespace-nowrap">
                      <div className="flex items-center justify-center gap-2">
                        {isAdmin &&
                          onAddProduct &&
                          !products.some((p) => p.sku === item.name) && (
                            <button
                              onClick={() => {
                                const newProduct: Product = {
                                  id: crypto.randomUUID(),
                                  sku: item.name,
                                  name: item.productName || item.name,
                                  basePrice: item.expectedPrice,
                                  unit: "",
                                  createdAt: new Date().toISOString(),
                                  updatedAt: new Date().toISOString(),
                                };
                                onAddProduct(newProduct);
                                alert("Đã lưu vào danh mục!");
                              }}
                              className="text-blue-600 hover:text-blue-700 hover:bg-blue-50 px-2 py-1 rounded-lg text-[10px] font-bold transition-colors border border-blue-100 flex items-center gap-1"
                              title="Lưu vào danh mục chuẩn"
                            >
                              <Save size={12} /> LƯU MÃ SẢN PHẨM
                            </button>
                          )}
                        {!isOrderClosed && (
                          <button
                            onClick={() => handleOpenEdit(item)}
                            className="text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border border-transparent hover:border-emerald-100"
                          >
                            Cập nhật
                          </button>
                        )}
                        {canModifyOrder() && (
                          <button
                            onClick={() => handleDeleteItemClick(item.id)}
                            className="text-rose-600 hover:text-rose-700 hover:bg-rose-50 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border border-transparent hover:border-rose-100"
                          >
                            Xóa
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {paginatedItems.length === 0 && (
                <tr>
                  <td
                    colSpan={10}
                    className="px-6 py-12 text-center text-slate-500"
                  >
                    <div className="flex flex-col items-center">
                      <Package className="w-12 h-12 text-slate-200 mb-2" />
                      <p>Không tìm thấy sản phẩm nào khớp với bộ lọc</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Controls */}
        {totalPages > 1 && (
          <div className="p-4 border-t border-slate-100 bg-slate-50/30 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="text-sm text-slate-500">
              Hiển thị{" "}
              <span className="font-medium text-slate-700">
                {startIndex + 1}
              </span>{" "}
              -{" "}
              <span className="font-medium text-slate-700">
                {Math.min(startIndex + ITEMS_PER_PAGE, filteredItems.length)}
              </span>{" "}
              trong tổng số{" "}
              <span className="font-medium text-slate-700">
                {filteredItems.length}
              </span>{" "}
              sản phẩm
            </div>
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={setCurrentPage}
            />
          </div>
        )}
      </div>
      )}

      {activeTab === "payments" && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between bg-slate-50/50 gap-4">
            <h2 className="text-lg font-bold text-slate-800">
              Lịch sử thanh toán
            </h2>
            {!isOrderClosed && (
              <button
                onClick={() => setShowPaymentModal(true)}
                className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl font-medium flex items-center gap-2 transition-all shadow-sm shadow-emerald-600/20"
              >
                <Plus className="w-4 h-4" />
                Ghi nhận thanh toán
              </button>
            )}
          </div>
          
          <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-6 border-b border-slate-100">
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
              <div className="text-sm text-slate-500 mb-1">Tổng tiền cần thanh toán</div>
              <div className="text-2xl font-bold text-slate-900">
                {formatCurrency(totalExpectedCost)}
              </div>
            </div>
            <div className="bg-emerald-50 p-4 rounded-xl border border-emerald-100">
              <div className="text-sm text-emerald-600 mb-1">Đã thanh toán</div>
              <div className="text-2xl font-bold text-emerald-700">
                {formatCurrency(order.paidAmount || 0)}
              </div>
            </div>
            <div className="bg-rose-50 p-4 rounded-xl border border-rose-100">
              <div className="text-sm text-rose-600 mb-1">Còn nợ</div>
              <div className="text-2xl font-bold text-rose-700">
                {formatCurrency(Math.max(0, totalExpectedCost - (order.paidAmount || 0)))}
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 text-xs uppercase tracking-wider font-semibold">
                  <th className="px-6 py-4 whitespace-nowrap">Ngày</th>
                  <th className="px-6 py-4 whitespace-nowrap">Số tiền</th>
                  <th className="px-6 py-4 whitespace-nowrap">Phương thức</th>
                  <th className="px-6 py-4 whitespace-nowrap">Mã giao dịch</th>
                  <th className="px-6 py-4 whitespace-nowrap">Người ghi nhận</th>
                  <th className="px-6 py-4 whitespace-nowrap">Ghi chú</th>
                  <th className="px-6 py-4 whitespace-nowrap text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {order.payments && order.payments.length > 0 ? (
                  order.payments.map((payment) => (
                    <tr key={payment.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-6 py-4 text-slate-900 font-medium">
                        {new Date(payment.date).toLocaleDateString("vi-VN")}
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-emerald-600 font-bold">
                          {formatCurrency(payment.amount)}
                        </div>
                        {payment.foreignAmount && (
                          <div className="text-xs text-slate-500">
                            {formatForeignCurrency(payment.foreignAmount, payment.currency || "")} (Tỷ giá: {formatNumber(payment.exchangeRate || 0)})
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-800">
                          {formatPaymentMethod(payment.method)}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-slate-600 font-mono text-sm">
                        {payment.reference || "-"}
                      </td>
                      <td className="px-6 py-4 text-slate-600">
                        {payment.recordedBy}
                      </td>
                      <td className="px-6 py-4 text-slate-600 max-w-xs truncate" title={payment.notes}>
                        {payment.notes || "-"}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => handleEditPayment(payment)}
                            className="text-slate-400 hover:text-indigo-600 p-1.5 rounded-lg hover:bg-indigo-50 transition-colors"
                            title="Sửa"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeletePayment(payment.id)}
                            className="text-slate-400 hover:text-rose-600 p-1.5 rounded-lg hover:bg-rose-50 transition-colors"
                            title="Xóa"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-slate-500">
                      Chưa có giao dịch thanh toán nào
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === "analytics" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Pie Chart: Trạng thái nhập hàng */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
              <h3 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2">
                <PieChartIcon className="w-5 h-5 text-indigo-500" />
                Trạng thái sản phẩm
              </h3>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={[
                        { name: "Đã đủ", value: order.items.filter(i => i.receivedQty === i.orderedQty).length, color: "#10b981" },
                        { name: "Còn thiếu", value: order.items.filter(i => i.receivedQty > 0 && i.receivedQty < i.orderedQty).length, color: "#f59e0b" },
                        { name: "Chưa nhập", value: order.items.filter(i => i.receivedQty === 0).length, color: "#94a3b8" },
                        { name: "Vượt số lượng", value: order.items.filter(i => i.receivedQty > i.orderedQty).length, color: "#3b82f6" },
                      ].filter(d => d.value > 0)}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {
                        [
                          { name: "Đã đủ", value: order.items.filter(i => i.receivedQty === i.orderedQty).length, color: "#10b981" },
                          { name: "Còn thiếu", value: order.items.filter(i => i.receivedQty > 0 && i.receivedQty < i.orderedQty).length, color: "#f59e0b" },
                          { name: "Chưa nhập", value: order.items.filter(i => i.receivedQty === 0).length, color: "#94a3b8" },
                          { name: "Vượt số lượng", value: order.items.filter(i => i.receivedQty > i.orderedQty).length, color: "#3b82f6" },
                        ].filter(d => d.value > 0).map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))
                      }
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Bar Chart: Top 5 giá trị sản phẩm */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
              <h3 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2">
                <BarChartIcon className="w-5 h-5 text-blue-500" />
                Top 5 sản phẩm theo giá trị đặt (VND)
              </h3>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={[...order.items]
                      .sort((a, b) => (b.orderedQty * b.expectedPrice) - (a.orderedQty * a.expectedPrice))
                      .slice(0, 5)
                      .map(i => ({
                        name: i.name,
                        "Đặt hàng": i.orderedQty * i.expectedPrice,
                        "Đã nhận": (i.totalReceivedCost ?? i.receivedQty * i.actualPrice),
                      }))}
                    layout="vertical"
                    margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" tickFormatter={(value) => new Intl.NumberFormat("vi-VN", { notation: "compact", compactDisplay: "short" }).format(value)} />
                    <YAxis dataKey="name" type="category" width={100} tick={{ fontSize: 12 }} />
                    <Tooltip formatter={(value: number) => new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(value)} />
                    <Legend />
                    <Bar dataKey="Đặt hàng" fill="#94a3b8" radius={[0, 4, 4, 0]} />
                    <Bar dataKey="Đã nhận" fill="#10b981" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Line Chart: Tiến độ nhập hàng */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
            <h3 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-emerald-500" />
              Tiến độ nhập hàng theo ngày
            </h3>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={Array.from(
                    (order.receipts || []).reduce((acc, r) => {
                      const date = new Date(r.importedAt).toLocaleDateString("vi-VN");
                      const qty = r.records.reduce((sum, rec) => sum + rec.qty, 0);
                      acc.set(date, (acc.get(date) || 0) + qty);
                      return acc;
                    }, new Map<string, number>()).entries()
                  ).map(([date, qty]) => ({ date, "Số lượng nhập": qty }))}
                  margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="Số lượng nhập" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* Notes and History Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mt-8">
        <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
          <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
            <Clock className="w-5 h-5 text-slate-400" />
            Lịch sử cập nhật
          </h3>
          <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2">
            {order.history && order.history.length > 0 ? (
              order.history.map((record) => (
                <div
                  key={record.id}
                  className="flex gap-4 p-4 bg-slate-50 rounded-xl border border-slate-100"
                >
                  <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                    <span className="text-blue-700 font-bold text-sm">
                      {record.user.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold text-slate-900">
                        {record.user}
                      </span>
                      <span className="text-xs text-slate-500">
                        {new Date(record.timestamp).toLocaleString("vi-VN")}
                      </span>
                    </div>
                    <p className="text-sm font-medium text-slate-700">
                      {record.action}
                    </p>
                    {record.details && (
                      <p className="text-sm text-slate-600 mt-1 whitespace-pre-wrap">
                        {record.details}
                      </p>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-8 text-slate-500">
                Chưa có lịch sử cập nhật nào.
              </div>
            )}
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 flex flex-col">
          <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
            <FileText className="w-5 h-5 text-slate-400" />
            Ghi chú đơn hàng
          </h3>
          <div className="flex-1 space-y-4 max-h-[300px] overflow-y-auto pr-2 mb-4">
            {order.notes && order.notes.length > 0 ? (
              order.notes.map((note) => (
                <div
                  key={note.id}
                  className="p-3 bg-amber-50 rounded-xl border border-amber-100"
                >
                  <p className="text-sm text-slate-800 whitespace-pre-wrap">
                    {note.content}
                  </p>
                  <div className="flex justify-between items-center mt-2 text-xs text-slate-500">
                    <span>{note.createdBy}</span>
                    <span>
                      {new Date(note.createdAt).toLocaleString("vi-VN")}
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-8 text-slate-500 text-sm">
                Chưa có ghi chú nào.
              </div>
            )}
          </div>
          <div className="mt-auto">
            <textarea
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              placeholder={
                isOrderClosed
                  ? "Đơn hàng đã đóng, không thể thêm ghi chú."
                  : "Thêm ghi chú mới..."
              }
              disabled={isOrderClosed}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-sm resize-none mb-2 disabled:bg-slate-50 disabled:text-slate-500"
              rows={3}
            />
            <button
              onClick={handleAddNote}
              disabled={!newNote.trim() || isOrderClosed}
              className="w-full bg-emerald-600 text-white font-medium py-2 rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
            >
              Thêm ghi chú
            </button>
          </div>
        </div>
      </div>

      {/* Edit Modal */}
      {editingItem && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="p-6 border-b border-slate-100">
              <h3 className="text-xl font-bold text-slate-900">
                Cập nhật hàng về
              </h3>
              <p className="text-slate-500 mt-1">{editingItem.name}</p>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Số lượng mới về thêm
                </label>
                <div className="flex items-center gap-2">
                  <input
                    autoFocus
                    type="text"
                    value={newReceivedQty === "0" ? "0" : newReceivedQty}
                    onChange={(e) => {
                      let val = e.target.value.replace(/[^0-9]/g, "");
                      val = val.replace(/^0+(?=\d)/, "");
                      setNewReceivedQty(val === "" ? "0" : val);
                    }}
                    onFocus={(e) => {
                      if (e.target.value === "0") {
                        e.target.select();
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        handleSaveEdit();
                      }
                    }}
                    className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                    placeholder="0"
                  />
                  <span className="text-sm text-slate-500 whitespace-nowrap">
                    (Đã nhận: {editingItem.receivedQty})
                  </span>
                </div>
              </div>
              {order.currency && order.currency !== "VND" && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Giá thực tế mới nhất ({order.currency})
                  </label>
                  <input
                    type="text"
                    value={newForeignActualPrice === "0" ? "0" : newForeignActualPrice}
                    onChange={(e) => {
                      let val = e.target.value.replace(/[^0-9.]/g, "");
                      const parts = val.split(".");
                      if (parts.length > 2) {
                        val = parts[0] + "." + parts.slice(1).join("");
                      }
                      val = val.replace(/^0+(?=\d)/, "");
                      setNewForeignActualPrice(val === "" ? "0" : val);
                      const numVal = parseFloat(val) || 0;
                      setNewActualPrice(Math.round(numVal * (order.exchangeRate || 1)).toString());
                    }}
                    onFocus={(e) => {
                      if (e.target.value === "0") {
                        e.target.select();
                      }
                    }}
                    className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  />
                  <p className="text-xs text-slate-500 mt-1">
                    Giá đặt ban đầu: {formatNumber(editingItem.foreignExpectedPrice || 0)} {order.currency}
                  </p>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Giá thực tế mới nhất (VND)
                </label>
                <input
                  type="text"
                  value={newActualPrice === "0" ? "0" : newActualPrice}
                  onChange={(e) => {
                    let val = e.target.value.replace(/[^0-9]/g, "");
                    val = val.replace(/^0+(?=\d)/, "");
                    setNewActualPrice(val === "" ? "0" : val);
                    if (order.currency && order.currency !== "VND" && (order.exchangeRate || 0) > 0) {
                      setNewForeignActualPrice((parseFloat(val || "0") / (order.exchangeRate || 1)).toFixed(2));
                    }
                  }}
                  onFocus={(e) => {
                    if (e.target.value === "0") {
                      e.target.select();
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      handleSaveEdit();
                    }
                  }}
                  className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                />
                <p className="text-xs text-slate-500 mt-1">
                  Giá đặt ban đầu: {formatCurrency(editingItem.expectedPrice)}
                </p>
              </div>
            </div>
            <div className="p-6 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
              <button
                onClick={() => setEditingItem(null)}
                className="px-4 py-2 text-slate-600 font-medium hover:bg-slate-200 rounded-lg transition-colors"
              >
                Hủy
              </button>
              <button
                onClick={handleSaveEdit}
                className="px-4 py-2 bg-emerald-600 text-white font-medium hover:bg-emerald-700 rounded-lg transition-colors shadow-sm shadow-emerald-600/20"
              >
                Lưu cập nhật
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Barcode Scanner */}
      {showScanner && (
        <BarcodeScanner
          onScan={handleBarcodeScan}
          onClose={() => setShowScanner(false)}
        />
      )}

      {/* Import Result Modal */}
      {importResult && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] flex flex-col overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center shrink-0">
              <h3 className="text-xl font-bold text-slate-900">
                Kết quả đối chiếu
              </h3>
              <button
                onClick={() => setImportResult(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4 overflow-y-auto">
              <div className="flex items-center gap-3 text-emerald-600 bg-emerald-50 p-4 rounded-xl">
                <CheckCircle className="w-6 h-6" />
                <div>
                  <p className="font-bold text-lg">
                    {importResult.matched} sản phẩm
                  </p>
                  <p className="text-sm">
                    Đã được cập nhật số lượng thành công.
                  </p>
                </div>
              </div>

              {importResult.overReceived.length > 0 && (
                <div className="mt-4">
                  <div className="flex items-center gap-2 text-amber-600 mb-2">
                    <AlertTriangle className="w-5 h-5" />
                    <span className="font-bold">
                      Cảnh báo: {importResult.overReceived.length} sản phẩm giao
                      vượt số lượng đặt:
                    </span>
                  </div>
                  <div className="bg-amber-50 p-3 rounded-lg max-h-40 overflow-y-auto text-sm text-amber-700">
                    <ul className="list-disc pl-5 space-y-1">
                      {importResult.overReceived.map((item, idx) => (
                        <li key={idx}>
                          {item.name} (Vượt: {item.excess})
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}

              {importResult.foundInOtherOrders.length > 0 && (
                <div className="mt-4">
                  <div className="flex items-center gap-2 text-indigo-600 mb-2">
                    <Package className="w-5 h-5" />
                    <span className="font-bold">
                      Tìm thấy {importResult.foundInOtherOrders.length} sản phẩm
                      trong các đơn khác:
                    </span>
                  </div>
                  <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                    {Object.entries(
                      importResult.foundInOtherOrders.reduce((acc, item) => {
                        if (!acc[item.orderId]) {
                          acc[item.orderId] = {
                            name: item.orderName,
                            orderCode: item.orderCode,
                            items: [],
                          };
                        }
                        acc[item.orderId].items.push(item);
                        return acc;
                      }, {} as Record<string, { name: string; orderCode?: string; items: any[] }>),
                    ).map(([orderId, data]: [string, any]) => (
                      <div
                        key={orderId}
                        className="bg-indigo-50 p-3 rounded-xl border border-indigo-100"
                      >
                        <div className="flex justify-between items-center mb-2">
                          <div className="flex flex-col">
                            <span className="text-xs font-bold text-indigo-700 uppercase tracking-wider">
                              {data.name}
                            </span>
                            {data.orderCode && (
                              <span className="text-[10px] text-indigo-500 font-mono mt-0.5">
                                {data.orderCode}
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] bg-indigo-200 text-indigo-800 px-1.5 py-0.5 rounded font-bold">
                            {data.items.length} SP
                          </span>
                        </div>
                        <ul className="text-xs text-indigo-600 list-disc pl-4 mb-3 space-y-0.5">
                          {data.items.map((item, idx) => (
                            <li key={idx}>
                              {item.name} (SL: {item.qty})
                            </li>
                          ))}
                        </ul>
                        <button
                          onClick={() =>
                            handleApplyToOtherOrder(orderId, data.items)
                          }
                          className="w-full py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-bold hover:bg-indigo-700 transition-colors shadow-sm"
                        >
                          Cập nhật vào đơn này
                        </button>
                      </div>
                    ))}
                  </div>
                  <p className="text-[10px] text-slate-500 mt-2 italic">
                    * Các sản phẩm này thuộc về các đơn hàng khác của cùng khách
                    hàng/NCC này.
                  </p>
                </div>
              )}

              {importResult.unmatched.length > 0 && (
                <div className="mt-4">
                  <div className="flex items-center gap-2 text-rose-600 mb-2">
                    <AlertTriangle className="w-5 h-5" />
                    <span className="font-bold">
                      Không tìm thấy {importResult.unmatched.length} sản phẩm:
                    </span>
                  </div>
                  <div className="bg-rose-50 p-3 rounded-lg max-h-40 overflow-y-auto text-sm text-rose-700">
                    <ul className="list-disc pl-5 space-y-1">
                      {importResult.unmatched.map((item, idx) => (
                        <li key={idx}>{item.name}</li>
                      ))}
                    </ul>
                  </div>
                  <div className="mt-3">
                    <button
                      onClick={handleAddUnmatchedItems}
                      className="w-full py-2 bg-rose-100 text-rose-700 rounded-lg text-sm font-bold hover:bg-rose-200 transition-colors flex items-center justify-center gap-2"
                    >
                      <Plus className="w-4 h-4" />
                      Thêm các sản phẩm này vào đơn hàng
                    </button>
                  </div>
                  <p className="text-xs text-slate-500 mt-2 italic">
                    * Các sản phẩm này có trong file của NCC nhưng không khớp
                    với tên sản phẩm trong đơn đặt hàng của bạn. Bạn có thể thêm
                    chúng vào đơn hàng như sản phẩm phát sinh.
                  </p>
                </div>
              )}
            </div>
            <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end shrink-0">
              <button
                onClick={() => setImportResult(null)}
                className="px-6 py-2 bg-slate-800 text-white font-medium hover:bg-slate-900 rounded-lg transition-colors"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={deletingItemId !== null}
        title="Xóa sản phẩm"
        message={`Bạn có chắc chắn muốn xóa sản phẩm "${deletingItemId ? order.items.find((i) => i.id === deletingItemId)?.name : ""}" khỏi đơn hàng này?`}
        onConfirm={confirmDeleteItem}
        onCancel={cancelDeleteItem}
      />

      <ConfirmModal
        isOpen={deletingPaymentId !== null}
        title="Xóa thanh toán"
        message="Bạn có chắc chắn muốn xóa giao dịch thanh toán này?"
        onConfirm={confirmDeletePayment}
        onCancel={cancelDeletePayment}
      />

      <ConfirmModal
        isOpen={overReceiveConfirm !== null}
        title="Cảnh báo số lượng vượt mức"
        message={
          overReceiveConfirm
            ? `Sản phẩm "${overReceiveConfirm.item.name}" sẽ có tổng số lượng về (${overReceiveConfirm.newTotalReceived}) vượt quá số lượng đặt (${overReceiveConfirm.item.orderedQty}). Bạn có chắc chắn muốn lưu?`
            : ""
        }
        onConfirm={() => {
          if (overReceiveConfirm) {
            executeSaveEdit(
              overReceiveConfirm.item,
              overReceiveConfirm.addedQty,
              overReceiveConfirm.updatedPrice,
            );
          }
        }}
        onCancel={() => setOverReceiveConfirm(null)}
      />

      {showPaymentModal && (
        <PaymentModal
          order={order}
          totalExpectedCost={totalExpectedCost}
          editingPayment={editingPayment}
          onClose={() => {
            setShowPaymentModal(false);
            setEditingPayment(null);
          }}
          onSave={async (payment) => {
            let updatedPayments = [...(order.payments || [])];
            let actionName = "Ghi nhận thanh toán";
            
            if (editingPayment) {
              updatedPayments = updatedPayments.map(p => 
                p.id === payment.id ? payment : p
              );
              actionName = "Cập nhật thanh toán";
            } else {
              updatedPayments.push(payment);
            }

            const updatedOrder = {
              ...order,
              payments: updatedPayments,
            };
            const finalOrder = recalculateOrder(updatedOrder, products);
            const paymentDetail = payment.foreignAmount 
              ? `${formatForeignCurrency(payment.foreignAmount, payment.currency || "")} (Tỷ giá: ${formatNumber(payment.exchangeRate || 0)}) ~ ${formatCurrency(payment.amount)}`
              : formatCurrency(payment.amount);
            
            await updateOrderWithHistory(
              finalOrder,
              actionName,
              `Số tiền: ${paymentDetail} - Phương thức: ${formatPaymentMethod(payment.method)}`
            );
            setShowPaymentModal(false);
            setEditingPayment(null);
          }}
        />
      )}
    </div>
  );
}

function PaymentModal({
  order,
  totalExpectedCost,
  editingPayment,
  onClose,
  onSave,
}: {
  order: Order;
  totalExpectedCost: number;
  editingPayment?: Payment | null;
  onClose: () => void;
  onSave: (payment: Payment) => void;
}) {
  const { user } = useAuth();
  const remainingAmount = Math.max(0, totalExpectedCost - (order.paidAmount || 0));
  
  const [currency, setCurrency] = useState(editingPayment?.currency || order.currency || "VND");
  const [exchangeRate, setExchangeRate] = useState((editingPayment?.exchangeRate || order.exchangeRate || 1).toString());
  const [amount, setAmount] = useState(editingPayment ? formatNumber(editingPayment.amount) : remainingAmount.toString());
  const [foreignAmount, setForeignAmount] = useState(editingPayment?.foreignAmount?.toString() || "");
  const [date, setDate] = useState(editingPayment ? new Date(editingPayment.date).toISOString().split("T")[0] : new Date().toISOString().split("T")[0]);
  const [method, setMethod] = useState<PaymentMethod>(editingPayment?.method || PaymentMethod.BANK_TRANSFER);
  const [reference, setReference] = useState(editingPayment?.reference || "");
  const [notes, setNotes] = useState(editingPayment?.notes || "");

  const isFirstRender = useRef(true);

  // Sync amounts when currency or exchange rate changes
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    
    if (currency === "VND") {
      setForeignAmount("");
    } else {
      const rate = parseNumber(exchangeRate) || 1;
      const vndAmount = parseNumber(amount);
      if (vndAmount > 0) {
        setForeignAmount((vndAmount / rate).toFixed(2));
      }
    }
  }, [currency]);

  const handleAmountChange = (val: string) => {
    const cleanVal = val.replace(/[^0-9]/g, "");
    setAmount(cleanVal ? formatNumber(parseInt(cleanVal, 10)) : "");
    
    if (currency !== "VND") {
      const rate = parseNumber(exchangeRate) || 1;
      const numVal = parseInt(cleanVal, 10) || 0;
      setForeignAmount((numVal / rate).toFixed(2));
    }
  };

  const handleForeignAmountChange = (val: string) => {
    setForeignAmount(val);
    const rate = parseNumber(exchangeRate) || 1;
    const numVal = parseNumber(val) || 0;
    setAmount(formatNumber(Math.round(numVal * rate)));
  };

  const handleExchangeRateChange = (val: string) => {
    setExchangeRate(val);
    const rate = parseNumber(val) || 1;
    if (currency !== "VND") {
      const fAmount = parseNumber(foreignAmount) || 0;
      if (fAmount > 0) {
        setAmount(formatNumber(Math.round(fAmount * rate)));
      } else {
        const vndAmount = parseNumber(amount);
        setForeignAmount((vndAmount / rate).toFixed(2));
      }
    }
  };

  const handleSave = () => {
    const numAmount = parseNumber(amount);
    if (numAmount <= 0) {
      alert("Vui lòng nhập số tiền hợp lệ");
      return;
    }

    onSave({
      id: editingPayment?.id || crypto.randomUUID(),
      amount: numAmount,
      foreignAmount: currency !== "VND" ? parseNumber(foreignAmount) : undefined,
      currency: currency !== "VND" ? currency : undefined,
      exchangeRate: currency !== "VND" ? parseNumber(exchangeRate) : undefined,
      date: new Date(date).toISOString(),
      method,
      reference: reference.trim(),
      notes: notes.trim(),
      recordedBy: editingPayment?.recordedBy || user?.username || "Unknown",
    });
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex justify-between items-center">
          <h3 className="text-xl font-bold text-slate-900">
            {editingPayment ? "Cập nhật thanh toán" : "Ghi nhận thanh toán"}
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Loại tiền
              </label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
              >
                <option value="VND">VND</option>
                <option value="USD">USD</option>
                <option value="KRW">KRW</option>
                <option value="CNY">CNY</option>
              </select>
            </div>
            {currency !== "VND" && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Tỷ giá
                </label>
                <input
                  type="text"
                  value={exchangeRate}
                  onChange={(e) => handleExchangeRateChange(e.target.value)}
                  onBlur={() => {
                    if (exchangeRate) {
                      const num = parseNumber(exchangeRate);
                      setExchangeRate(new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 4 }).format(num));
                    }
                  }}
                  className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-mono"
                />
              </div>
            )}
          </div>

          {currency !== "VND" && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Số tiền ({currency})
              </label>
              <input
                type="text"
                value={foreignAmount}
                onChange={(e) => handleForeignAmountChange(e.target.value)}
                onBlur={() => {
                  if (foreignAmount) {
                    const num = parseNumber(foreignAmount);
                    setForeignAmount(new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 }).format(num));
                  }
                }}
                className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-bold text-emerald-600"
                placeholder="0.00"
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Số tiền quy đổi (VND)
            </label>
            <div className="relative">
              <input
                type="text"
                value={amount}
                onChange={(e) => handleAmountChange(e.target.value)}
                className="w-full pl-4 pr-12 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-bold"
                placeholder="0"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 font-medium">
                VND
              </span>
            </div>
            {remainingAmount > 0 && (
              <p className="text-xs text-slate-500 mt-1">
                Gợi ý: Còn nợ {formatCurrency(remainingAmount)}
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Ngày thanh toán
            </label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Phương thức
            </label>
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value as PaymentMethod)}
              className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
            >
              <option value={PaymentMethod.CASH}>Tiền mặt</option>
              <option value={PaymentMethod.BANK_TRANSFER}>Chuyển khoản</option>
              <option value={PaymentMethod.CREDIT_CARD}>Thẻ tín dụng</option>
              <option value={PaymentMethod.OTHER}>Khác</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Mã giao dịch (Tùy chọn)
            </label>
            <input
              type="text"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="VD: FT2109..."
              className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Ghi chú (Tùy chọn)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
            />
          </div>
        </div>
        <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-slate-600 font-medium hover:bg-slate-200 rounded-lg transition-colors"
          >
            Hủy
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 bg-emerald-600 text-white font-medium hover:bg-emerald-700 rounded-lg transition-colors shadow-sm shadow-emerald-600/20"
          >
            {editingPayment ? "Cập nhật" : "Lưu thanh toán"}
          </button>
        </div>
      </div>
    </div>
  );
}
