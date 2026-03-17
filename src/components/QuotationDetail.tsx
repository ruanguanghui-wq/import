import React, { useState, useRef } from "react";
import {
  Quotation,
  QuotationItem,
  QuotationStatus,
  Order,
  OrderStatus,
  Product,
  QuotationType,
  OrderType,
} from "../types";
import { useAuth, useUsers } from "../store";
import {
  ArrowLeft,
  Save,
  Send,
  CheckCircle,
  XCircle,
  Trash2,
  Plus,
  Upload,
  Download,
  FileText,
  Search,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import {
  formatCurrency,
  formatNumber,
  formatForeignCurrency,
  parseExcelData,
  parseNumber,
  parseDate,
} from "../utils";
import { ConfirmModal } from "./ConfirmModal";
import { Pagination } from "./Pagination";
import { mapExcelHeaders } from "../services/gemini";
import * as XLSX from "xlsx";

interface QuotationDetailProps {
  quotation: Quotation;
  onUpdate: (quotation: Quotation) => Promise<void>;
  onBack: () => void;
  onConvertToOrder: (order: Order) => Promise<void>;
  products?: Product[];
  onAddProduct?: (product: Product) => void;
}

export function QuotationDetail({
  quotation,
  onUpdate,
  onBack,
  onConvertToOrder,
  products = [],
  onAddProduct,
}: QuotationDetailProps) {
  const { user, token } = useAuth();
  const { users } = useUsers(user, token);
  const isAdmin = user?.role === "admin";

  const [editingQuotation, setEditingQuotation] =
    useState<Quotation>(quotation);
  const [isSaving, setIsSaving] = useState(false);
  const [showAutoSaveMsg, setShowAutoSaveMsg] = useState(false);
  const [confirmAction, setConfirmAction] = useState<"send" | "approve" | null>(
    null,
  );
  const [deletingItemIndex, setDeletingItemIndex] = useState<number | null>(
    null,
  );
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState<
    number | null
  >(null);
  const [isMapping, setIsMapping] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null);

  const ITEMS_PER_PAGE = 50;
  const totalPages = Math.ceil(editingQuotation.items.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const paginatedItems = editingQuotation.items.slice(
    startIndex,
    startIndex + ITEMS_PER_PAGE,
  );

  // Auto update status to REVIEWING if customer opens it and it was SENT
  React.useEffect(() => {
    if (!isAdmin && quotation.status === QuotationStatus.SENT) {
      const updateStatus = async () => {
        await onUpdate({ ...quotation, status: QuotationStatus.REVIEWING });
      };
      updateStatus();
    }
  }, [isAdmin, quotation, onUpdate]);

  // Auto-save logic for customer edits
  React.useEffect(() => {
    const isEditableByCustomer =
      !isAdmin &&
      (editingQuotation.status === QuotationStatus.DRAFT ||
        editingQuotation.status === QuotationStatus.SENT ||
        editingQuotation.status === QuotationStatus.REVIEWING);

    if (
      isEditableByCustomer &&
      JSON.stringify(editingQuotation) !== JSON.stringify(quotation)
    ) {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);

      autoSaveTimerRef.current = setTimeout(async () => {
        setIsSaving(true);
        try {
          const updatedQuotation = {
            ...editingQuotation,
            exchangeRate: Number(editingQuotation.exchangeRate) || 1,
          };
          await onUpdate(updatedQuotation);
          setEditingQuotation(updatedQuotation);
          setLastSaved(new Date().toLocaleTimeString("vi-VN"));
          setShowAutoSaveMsg(true);
          setTimeout(() => setShowAutoSaveMsg(false), 3000);
        } catch (err) {
          console.error("Auto-save failed", err);
        } finally {
          setIsSaving(false);
        }
      }, 3000); // 3 seconds debounce
    }

    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
  }, [editingQuotation, isAdmin, onUpdate, quotation]);

  const handleSave = async (showSuccess = true) => {
    setIsSaving(true);
    try {
      const updatedQuotation = {
        ...editingQuotation,
        exchangeRate: Number(editingQuotation.exchangeRate) || 1,
      };
      await onUpdate(updatedQuotation);
      setEditingQuotation(updatedQuotation);
      setLastSaved(new Date().toLocaleTimeString("vi-VN"));
      if (showSuccess) alert("Đã lưu báo giá thành công!");
    } catch (err) {
      if (showSuccess) alert("Có lỗi khi lưu báo giá.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSendToCustomer = async () => {
    if (editingQuotation.type === QuotationType.CUSTOMER && !editingQuotation.customerId) {
      alert("Vui lòng chọn khách hàng trước khi gửi.");
      return;
    }
    if (editingQuotation.items.length === 0) {
      alert("Báo giá chưa có sản phẩm nào.");
      return;
    }

    setConfirmAction("send");
  };

  const confirmSendToCustomer = async () => {
    setIsSaving(true);
    try {
      const updatedQuotation = {
        ...editingQuotation,
        status: QuotationStatus.SENT,
        exchangeRate: Number(editingQuotation.exchangeRate) || 1,
      };
      await onUpdate(updatedQuotation);
      setEditingQuotation(updatedQuotation);
      alert(editingQuotation.type === QuotationType.CUSTOMER ? "Đã gửi báo giá cho khách hàng!" : "Đã chuyển trạng thái báo giá!");
      setConfirmAction(null);
    } catch (err) {
      alert("Có lỗi khi gửi báo giá.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleApprove = async () => {
    setConfirmAction("approve");
  };

  const confirmApprove = async () => {
    setIsSaving(true);
    try {
      // Create Order
      const newOrder: Order = {
        id: crypto.randomUUID(),
        name: `Đơn hàng từ ${editingQuotation.name}`,
        date: new Date().toISOString(),
        type: editingQuotation.type === QuotationType.SUPPLIER ? OrderType.PURCHASE : OrderType.SALES,
        supplier: editingQuotation.supplierName || "Nhà cung cấp", // Default or could be selected
        customerName: editingQuotation.customerName,
        customerEmail: editingQuotation.customerEmail,
        userId: editingQuotation.customerId,
        quotationId: editingQuotation.id,
        status: OrderStatus.PROCESSING,
        currency: editingQuotation.currency || "VND",
        exchangeRate: Number(editingQuotation.exchangeRate) || 1,
        items: editingQuotation.items.map((item) => ({
          id: crypto.randomUUID(),
          name: item.name,
          productName: item.productName,
          orderedQty: item.quantity,
          expectedPrice: item.quotedPrice,
          receivedQty: 0,
          actualPrice: 0,
          foreignExpectedPrice: item.foreignQuotedPrice,
        })),
      };

      await onConvertToOrder(newOrder);

      // Update Quotation Status
      await onUpdate({
        ...editingQuotation,
        status: QuotationStatus.APPROVED,
        orderId: newOrder.id,
      });

      alert("Đã tạo đơn hàng thành công!");
      onBack();
    } catch (err) {
      alert("Có lỗi khi tạo đơn hàng.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleItemChange = (
    index: number,
    field: keyof QuotationItem,
    value: any,
  ) => {
    const newItems = [...editingQuotation.items];
    const item = { ...newItems[index], [field]: value };
    
    if (field === "name") {
      const searchKey = String(value).toLowerCase().trim();
      const matchedProduct = products.find(p => p.sku.toLowerCase().trim() === searchKey || p.name.toLowerCase().trim() === searchKey);
      if (matchedProduct) {
        item.productName = matchedProduct.name;
        if (item.quotedPrice === 0 && matchedProduct.basePrice) {
          item.quotedPrice = matchedProduct.basePrice;
        }
      }
    }

    // Auto-calculate VND price if foreign price or exchange rate changes
    if (field === "foreignQuotedPrice") {
      const rate = Number(editingQuotation.exchangeRate) || 1;
      item.quotedPrice = Math.ceil((value || 0) * rate);
    } else if (field === "quotedPrice" && editingQuotation.currency === "VND") {
      item.foreignQuotedPrice = undefined;
    }

    newItems[index] = item;
    setEditingQuotation({ ...editingQuotation, items: newItems });
  };

  const handleCurrencyChange = (currency: string) => {
    const rate = currency === "VND" ? 1 : (Number(editingQuotation.exchangeRate) || 1);
    const newItems = editingQuotation.items.map(item => {
      if (currency === "VND") {
        return { ...item, foreignQuotedPrice: undefined };
      } else {
        // If switching to foreign currency, assume current quotedPrice is VND and calculate foreign
        const foreignPrice = item.quotedPrice / rate;
        return { ...item, foreignQuotedPrice: foreignPrice };
      }
    });
    setEditingQuotation({ ...editingQuotation, currency, exchangeRate: rate, items: newItems });
  };

  const handleExchangeRateChange = (rate: number | string) => {
    if (rate === "") {
      setEditingQuotation({ ...editingQuotation, exchangeRate: "" as any });
      return;
    }
    const numRate = typeof rate === "string" ? parseFloat(rate) : rate;
    if (isNaN(numRate)) {
      setEditingQuotation({ ...editingQuotation, exchangeRate: rate as any });
      return;
    }

    const newItems = editingQuotation.items.map(item => {
      if (editingQuotation.currency !== "VND" && item.foreignQuotedPrice !== undefined) {
        return { ...item, quotedPrice: Math.ceil(item.foreignQuotedPrice * numRate) };
      }
      return item;
    });
    setEditingQuotation({ ...editingQuotation, exchangeRate: rate as any, items: newItems });
  };

  const handleDeleteItemClick = (index: number) => {
    setDeletingItemIndex(index);
  };

  const confirmDeleteItem = () => {
    if (deletingItemIndex === null) return;
    const newItems = editingQuotation.items.filter(
      (_, i) => i !== deletingItemIndex,
    );
    setEditingQuotation({ ...editingQuotation, items: newItems });
    setDeletingItemIndex(null);
  };

  const cancelDeleteItem = () => {
    setDeletingItemIndex(null);
  };

  const handleAddItem = () => {
    setEditingQuotation({
      ...editingQuotation,
      items: [
        ...editingQuotation.items,
        { id: crypto.randomUUID(), name: "", quantity: 1, quotedPrice: 0 },
      ],
    });
  };

  const handleImportExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsMapping(true);
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const data = evt.target?.result;
        if (!data) return;

        const wb = XLSX.read(data, { type: "binary" });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        if (!ws) {
          alert("File Excel không có dữ liệu hoặc không hợp lệ.");
          return;
        }
        const jsonData = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];

        if (jsonData.length === 0) {
          alert("File Excel trống.");
          return;
        }

        // Try heuristic first
        const heuristicResult = parseExcelData(jsonData);
        let parsedRecords = Array.isArray(heuristicResult)
          ? heuristicResult
          : heuristicResult.records || [];
        let documentDate = Array.isArray(heuristicResult)
          ? undefined
          : heuristicResult.documentDate;

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

              if (!documentDate && colMap.date !== -1 && row[colMap.date]) {
                documentDate = parseDate(row[colMap.date]);
              }

              if (name) {
                aiRecords.push({ name, productName, qty, price });
              }
            }
            if (aiRecords.length > 0) {
              parsedRecords = aiRecords;
            }
          }
        }

        const newItems: QuotationItem[] = parsedRecords.map((record) => {
          const currency = editingQuotation.currency || "VND";
          const rate = Number(editingQuotation.exchangeRate) || 1;
          const foreignPrice = currency !== "VND" ? record.price : undefined;
          const vndPrice = currency !== "VND" ? Math.ceil(record.price * rate) : record.price;

          const searchKey1 = String(record.name || "").toLowerCase().trim();
          const searchKey2 = String(record.productName || "").toLowerCase().trim();
          
          let matchedProduct = products.find(p => 
            p.sku.toLowerCase().trim() === searchKey1 || 
            p.name.toLowerCase().trim() === searchKey1 ||
            (searchKey2 && (p.sku.toLowerCase().trim() === searchKey2 || p.name.toLowerCase().trim() === searchKey2))
          );

          return {
            id: crypto.randomUUID(),
            name: record.name,
            productName: matchedProduct ? matchedProduct.name : (record.productName || ""),
            quantity: record.qty || 1,
            quotedPrice: vndPrice,
            foreignQuotedPrice: foreignPrice,
            note: "",
          };
        });

        if (newItems.length === 0) {
          alert(
            "Lỗi: Không tìm thấy dữ liệu sản phẩm hợp lệ trong file. Vui lòng kiểm tra lại tiêu đề các cột (Mã sản phẩm, Số lượng, Đơn giá) hoặc thử lại (có thể do lỗi kết nối AI).",
          );
        } else {
          setEditingQuotation({
            ...editingQuotation,
            items: [...editingQuotation.items, ...newItems],
            date: documentDate || editingQuotation.date,
          });
          alert(`Đã nhập thành công ${newItems.length} sản phẩm.`);
        }
      } catch (err) {
        console.error("Error importing excel:", err);
        alert(
          "Lỗi khi đọc file Excel. Vui lòng kiểm tra lại định dạng file (.xlsx, .xls, .csv) hoặc liên hệ hỗ trợ.",
        );
      } finally {
        setIsMapping(false);
        if (e.target) e.target.value = "";
      }
    };
    reader.readAsBinaryString(file);
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
    const file = e.dataTransfer.files?.[0];
    if (file && (file.name.endsWith(".xlsx") || file.name.endsWith(".xls") || file.name.endsWith(".csv"))) {
      const mockEvent = {
        target: { files: [file] }
      } as unknown as React.ChangeEvent<HTMLInputElement>;
      handleImportExcel(mockEvent);
    } else {
      alert("Vui lòng kéo thả file Excel (.xlsx, .xls, .csv)");
    }
  };

  const totalAmount = editingQuotation.items.reduce(
    (sum, item) => sum + item.quantity * item.quotedPrice,
    0,
  );
  const isEditableByAdmin =
    isAdmin &&
    (editingQuotation.status === QuotationStatus.DRAFT ||
      editingQuotation.status === QuotationStatus.SENT ||
      editingQuotation.status === QuotationStatus.REVIEWING);
  const isEditableByCustomer =
    !isAdmin &&
    (editingQuotation.status === QuotationStatus.DRAFT ||
      editingQuotation.status === QuotationStatus.SENT ||
      editingQuotation.status === QuotationStatus.REVIEWING);

  return (
    <div 
      className="p-8 max-w-7xl mx-auto relative"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {isDragging && (
        <div className="absolute inset-0 z-50 bg-indigo-500/10 border-4 border-dashed border-indigo-500 rounded-3xl flex items-center justify-center backdrop-blur-sm transition-all animate-in fade-in duration-200">
          <div className="bg-white p-8 rounded-2xl shadow-2xl text-center">
            <Upload className="w-16 h-16 text-indigo-600 mx-auto mb-4 animate-bounce" />
            <h3 className="text-xl font-bold text-slate-900">Thả file vào đây để nhập Excel</h3>
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

      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 mb-8 bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
        <div className="flex-1 w-full">
          <div className="flex items-center gap-3 mb-2">
            {isAdmin && isEditableByAdmin ? (
              <input
                type="text"
                value={editingQuotation.name}
                onChange={(e) =>
                  setEditingQuotation({
                    ...editingQuotation,
                    name: e.target.value,
                  })
                }
                className="text-2xl font-bold text-slate-900 bg-transparent border-b-2 border-dashed border-slate-300 focus:border-indigo-500 focus:outline-none px-1 py-0.5 w-full max-w-md"
                placeholder="Tên báo giá..."
              />
            ) : (
              <h1 className="text-2xl font-bold text-slate-900">
                {editingQuotation.name}
              </h1>
            )}
            <span
              className={`px-3 py-1 rounded-full text-xs font-bold ${
                editingQuotation.status === QuotationStatus.DRAFT
                  ? "bg-slate-100 text-slate-700"
                  : editingQuotation.status === QuotationStatus.SENT
                    ? "bg-blue-100 text-blue-700"
                    : editingQuotation.status === QuotationStatus.REVIEWING
                      ? "bg-amber-100 text-amber-700"
                      : editingQuotation.status === QuotationStatus.APPROVED
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-rose-100 text-rose-700"
              }`}
            >
              {editingQuotation.status}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-4 mt-4 text-sm text-slate-600">
            {editingQuotation.type === QuotationType.CUSTOMER ? (
              <div className="flex items-center gap-2">
                <span className="font-medium">Khách hàng:</span>
                {isAdmin && isEditableByAdmin && !quotation.customerId ? (
                  <select
                    value={editingQuotation.customerId}
                    disabled={editingQuotation.status !== QuotationStatus.DRAFT}
                    onChange={(e) => {
                      const selectedUser = users.find(
                        (u) => u.id === e.target.value,
                      );
                      setEditingQuotation({
                        ...editingQuotation,
                        customerId: e.target.value,
                        customerName: selectedUser ? selectedUser.username : "",
                        customerEmail: selectedUser ? selectedUser.email : "",
                      });
                    }}
                    className={`px-3 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 bg-slate-50 ${editingQuotation.status !== QuotationStatus.DRAFT ? "opacity-50 cursor-not-allowed" : ""}`}
                  >
                    <option value="">-- Chọn khách hàng --</option>
                    {users
                      .filter((u) => u.role === "user" && !(u as any).isOrphaned)
                      .map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.username} ({u.email})
                        </option>
                      ))}
                  </select>
                ) : (
                  <span className="font-bold text-slate-900">
                    {editingQuotation.customerName || <span className="text-slate-400 italic font-normal">Chưa chọn khách hàng</span>}
                  </span>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className="font-medium">Nhà cung cấp:</span>
                {isAdmin && isEditableByAdmin ? (
                  <input
                    type="text"
                    value={editingQuotation.supplierName || ""}
                    disabled={editingQuotation.status !== QuotationStatus.DRAFT}
                    onChange={(e) => {
                      setEditingQuotation({
                        ...editingQuotation,
                        supplierName: e.target.value,
                      });
                    }}
                    placeholder="Nhập tên nhà cung cấp..."
                    className={`px-3 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 bg-slate-50 ${editingQuotation.status !== QuotationStatus.DRAFT ? "opacity-50 cursor-not-allowed" : ""}`}
                  />
                ) : (
                  <span className="font-bold text-slate-900">
                    {editingQuotation.supplierName || "Chưa xác định"}
                  </span>
                )}
              </div>
            )}
            <span>•</span>
            <span>
              Ngày tạo:{" "}
              <strong className="text-slate-900">
                {new Date(editingQuotation.date).toLocaleDateString("vi-VN")}
              </strong>
            </span>
            <span>•</span>
            <div className="flex items-center gap-2">
              <span className="font-medium">Tiền tệ:</span>
              {isAdmin && isEditableByAdmin ? (
                <select
                  value={editingQuotation.currency || "VND"}
                  onChange={(e) => handleCurrencyChange(e.target.value)}
                  className="px-2 py-1 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 bg-slate-50 text-xs font-bold"
                >
                  <option value="VND">VND</option>
                  <option value="USD">USD</option>
                  <option value="KRW">KRW</option>
                  <option value="CNY">CNY</option>
                </select>
              ) : (
                <span className="font-bold text-slate-900">{editingQuotation.currency || "VND"}</span>
              )}
            </div>
            {(editingQuotation.currency && editingQuotation.currency !== "VND") && (
              <>
                <span>•</span>
                <div className="flex items-center gap-2">
                  <span className="font-medium">Tỷ giá:</span>
                  {isAdmin && isEditableByAdmin ? (
                    <input
                      type="number"
                      value={editingQuotation.exchangeRate !== undefined ? editingQuotation.exchangeRate : 1}
                      onChange={(e) => handleExchangeRateChange(e.target.value)}
                      className="w-24 px-2 py-1 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 bg-slate-50 text-xs font-bold text-right"
                    />
                  ) : (
                    <span className="font-bold text-slate-900">{formatNumber(editingQuotation.exchangeRate || 1)}</span>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-3 w-full lg:w-auto">
          {confirmAction === "send" && (
            <div className="flex items-center gap-2 bg-indigo-50 px-4 py-2 rounded-xl border border-indigo-100">
              <span className="text-sm font-medium text-indigo-700">
                Xác nhận gửi?
              </span>
              <button
                onClick={confirmSendToCustomer}
                className="px-3 py-1 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700"
              >
                Có
              </button>
              <button
                onClick={() => setConfirmAction(null)}
                className="px-3 py-1 bg-white text-slate-600 border border-slate-200 text-sm rounded-lg hover:bg-slate-50"
              >
                Không
              </button>
            </div>
          )}
          {confirmAction === "approve" && (
            <div className="flex items-center gap-2 bg-emerald-50 px-4 py-2 rounded-xl border border-emerald-100">
              <span className="text-sm font-medium text-emerald-700">
                Xác nhận tạo đơn hàng?
              </span>
              <button
                onClick={confirmApprove}
                className="px-3 py-1 bg-emerald-600 text-white text-sm rounded-lg hover:bg-emerald-700"
              >
                Có
              </button>
              <button
                onClick={() => setConfirmAction(null)}
                className="px-3 py-1 bg-white text-slate-600 border border-slate-200 text-sm rounded-lg hover:bg-slate-50"
              >
                Không
              </button>
            </div>
          )}

          {!confirmAction && isAdmin && isEditableByAdmin && (
            <>
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="flex items-center justify-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-xl font-medium hover:bg-slate-50 transition-colors shadow-sm"
              >
                <Save className="w-4 h-4" />
                Lưu nháp
              </button>
              <button
                onClick={handleSendToCustomer}
                disabled={isSaving || (editingQuotation.type === QuotationType.CUSTOMER && !editingQuotation.customerId)}
                className="flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 transition-colors shadow-sm shadow-indigo-600/20 disabled:opacity-50"
              >
                <Send className="w-4 h-4" />
                {editingQuotation.type === QuotationType.CUSTOMER ? "Gửi khách hàng" : "Chuyển trạng thái Đã gửi"}
              </button>
              <button
                onClick={handleApprove}
                disabled={isSaving}
                className="flex items-center justify-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-xl font-medium hover:bg-emerald-700 transition-colors shadow-sm shadow-emerald-600/20 disabled:opacity-50"
              >
                <CheckCircle className="w-4 h-4" />
                Tạo đơn hàng
              </button>
            </>
          )}

          {!confirmAction && isEditableByCustomer && (
            <div className="flex items-center gap-3">
              {(lastSaved || showAutoSaveMsg) && (
                <span className={`text-xs italic transition-all duration-500 ${showAutoSaveMsg ? "text-emerald-600 font-bold scale-110" : "text-slate-400"}`}>
                  {showAutoSaveMsg ? "✓ Đã tự động lưu" : `Đã tự động lưu lúc ${lastSaved}`}
                </span>
              )}
              <button
                onClick={() => handleSave(true)}
                disabled={isSaving}
                className="flex items-center justify-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-xl font-medium hover:bg-slate-50 transition-colors shadow-sm"
              >
                <Save className="w-4 h-4" />
                Lưu tạm
              </button>
              <button
                onClick={handleApprove}
                disabled={isSaving}
                className="flex items-center justify-center gap-2 px-6 py-2 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 transition-colors shadow-sm shadow-emerald-600/20"
              >
                <CheckCircle className="w-5 h-5" />
                Chốt đơn & Đặt hàng
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between bg-slate-50/50 gap-4">
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <FileText className="w-5 h-5 text-indigo-500" />
            Chi tiết sản phẩm
          </h2>
          {(isEditableByAdmin || isEditableByCustomer) && (
            <div className="flex gap-3">
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleImportExcel}
                accept=".xlsx, .xls, .csv"
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isMapping}
                className="px-3 py-2 rounded-lg flex items-center gap-2 text-sm font-medium transition-colors border bg-white hover:bg-slate-50 text-slate-700 border-slate-200 disabled:opacity-50"
              >
                {isMapping ? (
                  <div className="w-4 h-4 border-2 border-slate-300 border-t-indigo-500 rounded-full animate-spin" />
                ) : (
                  <Upload className="w-4 h-4" />
                )}
                Nhập Excel
              </button>
              {isAdmin && isEditableByAdmin && (
                <button
                  onClick={handleAddItem}
                  className="px-3 py-2 rounded-lg flex items-center gap-2 text-sm font-medium transition-colors border bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border-indigo-200"
                >
                  <Plus className="w-4 h-4" />
                  Thêm dòng
                </button>
              )}
            </div>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 text-xs uppercase tracking-wider font-semibold">
                <th className="px-6 py-4 w-16 text-center whitespace-nowrap">
                  STT
                </th>
                <th className="px-6 py-4 whitespace-nowrap">Mã sản phẩm</th>
                <th className="px-6 py-4 whitespace-nowrap">Tên sản phẩm</th>
                <th className="px-6 py-4 text-right w-32 whitespace-nowrap">
                  Số lượng
                </th>
                {editingQuotation.currency && editingQuotation.currency !== "VND" && (
                  <th className="px-6 py-4 text-right w-40 whitespace-nowrap">
                    Đơn giá ({editingQuotation.currency})
                  </th>
                )}
                <th className="px-6 py-4 text-right w-48 whitespace-nowrap">
                  Đơn giá (VND)
                </th>
                <th className="px-6 py-4 text-right w-48 whitespace-nowrap">
                  Thành tiền
                </th>
                {(isEditableByAdmin || isEditableByCustomer) && (
                  <th className="px-6 py-4 text-center w-24 whitespace-nowrap">
                    Thao tác
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paginatedItems.map((item, pIndex) => {
                const index = startIndex + pIndex;
                return (
                  <tr
                    key={item.id}
                    className="hover:bg-slate-50/50 transition-colors"
                  >
                    <td className="px-6 py-4 text-center text-slate-500 font-medium">
                      {index + 1}
                    </td>
                    <td className="px-6 py-4">
                      {(isAdmin && isEditableByAdmin) ||
                      isEditableByCustomer ? (
                        <div className="relative">
                          <input
                            type="text"
                            value={item.name}
                            onChange={(e) => {
                              handleItemChange(index, "name", e.target.value);
                              setActiveSuggestionIndex(index);
                            }}
                            onFocus={() => setActiveSuggestionIndex(index)}
                            className="w-full px-3 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm font-mono"
                            placeholder="Mã SP..."
                          />
                          {activeSuggestionIndex === index &&
                            item.name.trim() !== "" && (
                              <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg z-50 overflow-hidden">
                                {products
                                  .filter(
                                    (p) =>
                                      p.sku
                                        .toLowerCase()
                                        .includes(item.name.toLowerCase()) ||
                                      p.name
                                        .toLowerCase()
                                        .includes(item.name.toLowerCase()),
                                  )
                                  .slice(0, 5)
                                  .map((p) => (
                                    <button
                                      key={p.id}
                                      onClick={() => {
                                        const newItems = [
                                          ...editingQuotation.items,
                                        ];
                                        newItems[index] = {
                                          ...newItems[index],
                                          name: p.sku,
                                          productName: p.name,
                                          quotedPrice: p.basePrice,
                                        };
                                        setEditingQuotation({
                                          ...editingQuotation,
                                          items: newItems,
                                        });
                                        setActiveSuggestionIndex(null);
                                      }}
                                      className="w-full text-left px-4 py-2 hover:bg-slate-50 flex flex-col border-b border-slate-100 last:border-0"
                                    >
                                      <span className="text-sm font-bold text-slate-900">
                                        {p.sku}
                                      </span>
                                      <span className="text-xs text-slate-500 truncate">
                                        {p.name}
                                      </span>
                                    </button>
                                  ))}
                              </div>
                            )}
                        </div>
                      ) : (
                        <div className="text-slate-900 font-bold">
                          {item.name}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {(isAdmin && isEditableByAdmin) ||
                      isEditableByCustomer ? (
                        <div className="flex flex-col gap-2">
                          <input
                            type="text"
                            value={item.productName || ""}
                            onChange={(e) =>
                              handleItemChange(
                                index,
                                "productName",
                                e.target.value,
                              )
                            }
                            className="w-full px-3 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm"
                            placeholder="Tên SP..."
                          />
                          {isAdmin &&
                            isEditableByAdmin &&
                            onAddProduct &&
                            !products.some((p) => p.sku === item.name) &&
                            item.name.trim() !== "" && (
                              <button
                                onClick={() => {
                                  const newProduct: Product = {
                                    id: crypto.randomUUID(),
                                    sku: item.name,
                                    name: item.productName || item.name,
                                    basePrice: item.quotedPrice,
                                    unit: "",
                                    createdAt: new Date().toISOString(),
                                    updatedAt: new Date().toISOString(),
                                  };
                                  onAddProduct(newProduct);
                                  alert("Đã lưu vào danh mục!");
                                }}
                                className="text-blue-600 hover:text-blue-700 text-[10px] font-bold flex items-center gap-1 self-start"
                              >
                                <Save size={12} /> LƯU MÃ SẢN PHẨM
                              </button>
                            )}
                        </div>
                      ) : (
                        <div className="text-slate-600 text-sm">
                          {item.productName || "-"}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {isEditableByAdmin || isEditableByCustomer ? (
                        <input
                          type="text"
                          value={item.quantity === 0 ? "0" : item.quantity}
                          onChange={(e) => {
                            let val = e.target.value.replace(/[^0-9]/g, "");
                            val = val.replace(/^0+(?=\d)/, "");
                            handleItemChange(
                              index,
                              "quantity",
                              val === "" ? 0 : parseInt(val, 10),
                            );
                          }}
                          onFocus={(e) => {
                            if (e.target.value === "0") {
                              e.target.select();
                            }
                          }}
                          className="w-full px-3 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm text-right font-medium"
                        />
                      ) : (
                        <div className="text-right font-medium text-slate-900">
                          {formatNumber(item.quantity)}
                        </div>
                      )}
                    </td>
                    {editingQuotation.currency && editingQuotation.currency !== "VND" && (
                      <td className="px-6 py-4">
                        {isEditableByAdmin || isEditableByCustomer ? (
                          <input
                            type="text"
                            value={item.foreignQuotedPrice === 0 ? "0" : item.foreignQuotedPrice || "0"}
                            onChange={(e) => {
                              let val = e.target.value.replace(/[^0-9.]/g, "");
                              const parts = val.split(".");
                              if (parts.length > 2) {
                                val = parts[0] + "." + parts.slice(1).join("");
                              }
                              val = val.replace(/^0+(?=\d)/, "");
                              handleItemChange(
                                index,
                                "foreignQuotedPrice",
                                val === "" ? 0 : parseFloat(val),
                              );
                            }}
                            onFocus={(e) => {
                              if (e.target.value === "0") {
                                e.target.select();
                              }
                            }}
                            className="w-full px-3 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm text-right font-medium bg-indigo-50/30"
                          />
                        ) : (
                          <div className="text-right font-medium text-indigo-600">
                            {formatNumber(item.foreignQuotedPrice || 0)}
                          </div>
                        )}
                      </td>
                    )}
                    <td className="px-6 py-4">
                      {isAdmin && isEditableByAdmin ? (
                        <input
                          type="text"
                          value={item.quotedPrice === 0 ? "0" : item.quotedPrice}
                          onChange={(e) => {
                            let val = e.target.value.replace(/[^0-9]/g, "");
                            val = val.replace(/^0+(?=\d)/, "");
                            handleItemChange(
                              index,
                              "quotedPrice",
                              val === "" ? 0 : parseInt(val, 10),
                            );
                          }}
                          onFocus={(e) => {
                            if (e.target.value === "0") {
                              e.target.select();
                            }
                          }}
                          className="w-full px-3 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm text-right font-medium"
                        />
                      ) : (
                        <div className="text-right font-medium text-slate-900">
                          {formatForeignCurrency(item.quotedPrice, quotation.currency || "VND")}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <span className="font-bold text-indigo-600">
                        {formatForeignCurrency(item.quantity * item.quotedPrice, quotation.currency || "VND")}
                      </span>
                    </td>
                    {(isEditableByAdmin || isEditableByCustomer) && (
                      <td className="px-6 py-4 text-center">
                        <button
                          onClick={() => handleDeleteItemClick(index)}
                          className="text-slate-400 hover:text-rose-600 p-2 rounded-lg hover:bg-rose-50 transition-colors"
                          title="Xóa sản phẩm"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
              {editingQuotation.items.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    className="px-6 py-12 text-center text-slate-500"
                  >
                    Chưa có sản phẩm nào trong báo giá.
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot className="bg-slate-50 border-t border-slate-200">
              <tr>
                <td
                  colSpan={5}
                  className="px-6 py-4 text-right font-bold text-slate-700"
                >
                  Tổng cộng:
                </td>
                <td className="px-6 py-4 text-right">
                  <span className="text-xl font-bold text-indigo-600">
                    {formatForeignCurrency(totalAmount, quotation.currency || "VND")}
                  </span>
                </td>
                {(isEditableByAdmin || isEditableByCustomer) && <td></td>}
              </tr>
            </tfoot>
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
                {Math.min(
                  startIndex + ITEMS_PER_PAGE,
                  editingQuotation.items.length,
                )}
              </span>{" "}
              trong tổng số{" "}
              <span className="font-medium text-slate-700">
                {editingQuotation.items.length}
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

      <ConfirmModal
        isOpen={deletingItemIndex !== null}
        title="Xóa sản phẩm"
        message={`Bạn có chắc chắn muốn xóa sản phẩm "${deletingItemIndex !== null ? editingQuotation.items[deletingItemIndex]?.name : ""}" khỏi báo giá này?`}
        onConfirm={confirmDeleteItem}
        onCancel={cancelDeleteItem}
      />
    </div>
  );
}
