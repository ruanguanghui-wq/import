import React, { useState, useRef } from "react";
import { Order, Receipt, ReceiptRecord, OrderStatus, OrderType } from "../types";
import {
  Folder,
  FileSpreadsheet,
  Upload,
  Trash2,
  ChevronRight,
  Calendar,
  Plus,
  ChevronLeft,
  Search,
  Building2,
  Users,
} from "lucide-react";

const ITEMS_PER_PAGE = 50;
import * as XLSX from "xlsx";
import { recalculateOrder } from "../orderUtils";
import { parseExcelData, parseNumber, parseDate } from "../utils";
import { ConfirmModal } from "./ConfirmModal";
import { useAuth } from "../store";
import { mapExcelHeaders } from "../services/gemini";

interface FileManagerProps {
  orders: Order[];
  onUpdateOrder: (order: Order) => Promise<void> | void;
  onDeleteOrder: (id: string) => Promise<void> | void;
  onCreateOrder: () => void;
}

export function FileManager({
  orders,
  onUpdateOrder,
  onDeleteOrder,
  onCreateOrder,
}: FileManagerProps) {
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [activeTab, setActiveTab] = useState<OrderType>(OrderType.SALES);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [updatingFileId, setUpdatingFileId] = useState<string | null>(null);
  const [uploadType, setUploadType] = useState<"order" | "receipt" | null>(
    null,
  );
  const [orderToDelete, setOrderToDelete] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [fileToDelete, setFileToDelete] = useState<{
    type: "order" | "receipt";
    fileId: string;
    fileName: string;
  } | null>(null);
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const canDeleteOrder = (order: Order) => {
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

  const selectedOrder = orders.find((o) => o.id === selectedOrderId);
  const isOrderClosed =
    selectedOrder?.status === OrderStatus.COMPLETED ||
    selectedOrder?.status === OrderStatus.CANCELLED ||
    selectedOrder?.status === OrderStatus.PARTIAL;

  const filteredOrders = orders.filter((order) =>
    (order.type === activeTab || (!order.type && activeTab === OrderType.SALES)) &&
    order.name.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  const totalPages = Math.ceil(filteredOrders.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const paginatedOrders = filteredOrders.slice(
    startIndex,
    startIndex + ITEMS_PER_PAGE,
  );

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
    setCurrentPage(1);
  };

  const confirmDeleteFile = async () => {
    if (!selectedOrder || !fileToDelete) return;

    const { type, fileId } = fileToDelete;
    let updatedOrder = { ...selectedOrder };

    if (type === "order") {
      const remainingFiles =
        selectedOrder.orderFiles?.filter((f) => f.id !== fileId) || [];
      updatedOrder.orderFiles = remainingFiles;
    } else {
      const remainingReceipts =
        selectedOrder.receipts?.filter((r) => r.id !== fileId) || [];
      updatedOrder.receipts = remainingReceipts;
    }

    try {
      await onUpdateOrder(recalculateOrder(updatedOrder));
      setFileToDelete(null);
    } catch (err) {
      alert("Có lỗi khi xóa file. Vui lòng thử lại.");
    }
  };

  const handleUpdateFileClick = (type: "order" | "receipt", fileId: string) => {
    setUploadType(type);
    setUpdatingFileId(fileId);
    fileInputRef.current?.click();
  };

  const handleUploadNewClick = (type: "order" | "receipt") => {
    setUploadType(type);
    setUpdatingFileId(null);
    fileInputRef.current?.click();
  };

  const [isMapping, setIsMapping] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedOrder || !uploadType) return;

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

        if (parsedRecords.length === 0) {
          alert("Lỗi: Không tìm thấy dữ liệu hợp lệ trong file Excel. Vui lòng kiểm tra lại định dạng file, tiêu đề cột hoặc thử lại (có thể do lỗi kết nối AI).");
          return;
        }

        const records: any[] = parsedRecords.map((record) => {
          if (uploadType === "receipt") {
            const cleanName = String(record.name || "")
              .toLowerCase()
              .trim();
            const cleanProductName = String(record.productName || "")
              .toLowerCase()
              .trim();

            const item = selectedOrder.items.find((i) => {
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

            return {
              itemId: item?.id || crypto.randomUUID(),
              name: record.name,
              productName: record.productName,
              qty: record.qty,
              price: record.price,
            };
          } else {
            return {
              itemId: crypto.randomUUID(),
              name: record.name,
              productName: record.productName,
              qty: record.qty,
              price: record.price,
            };
          }
        });

        let updatedOrder = { ...selectedOrder };
        if (documentDate) {
          updatedOrder.date = documentDate;
        }

        if (uploadType === "order") {
          let updatedFiles = selectedOrder.orderFiles || [];
          if (updatingFileId) {
            updatedFiles = updatedFiles.map((f) =>
              f.id === updatingFileId
                ? {
                    ...f,
                    fileName: file.name,
                    importedAt: new Date().toISOString(),
                    records,
                  }
                : f,
            );
          } else {
            updatedFiles = [
              ...updatedFiles,
              {
                id: crypto.randomUUID(),
                fileName: file.name,
                importedAt: new Date().toISOString(),
                records,
              },
            ];
          }
          updatedOrder.orderFiles = updatedFiles;
        } else {
          let updatedReceipts = selectedOrder.receipts || [];
          if (updatingFileId) {
            updatedReceipts = updatedReceipts.map((r) =>
              r.id === updatingFileId
                ? {
                    ...r,
                    fileName: file.name,
                    importedAt: new Date().toISOString(),
                    records,
                  }
                : r,
            );
          } else {
            updatedReceipts = [
              ...updatedReceipts,
              {
                id: crypto.randomUUID(),
                fileName: file.name,
                importedAt: new Date().toISOString(),
                records,
              },
            ];
          }
          updatedOrder.receipts = updatedReceipts;
        }

        await onUpdateOrder(recalculateOrder(updatedOrder));
        setUpdatingFileId(null);
        setUploadType(null);

        if (records.length === 0) {
          alert(
            "Cảnh báo: Không tìm thấy dữ liệu sản phẩm nào trong file. Vui lòng kiểm tra lại định dạng file.",
          );
        } else {
          const matchedCount = records.filter(
            (r) => r.itemId && !r.itemId.includes("-"),
          ).length; // Simple check if it matched an existing item
          if (uploadType === "receipt" && matchedCount === 0) {
            alert(
              `Đã tải lên file thành công, nhưng không tìm thấy sản phẩm nào khớp với đơn hàng gốc trong ${records.length} dòng dữ liệu.`,
            );
          } else {
            alert(
              updatingFileId
                ? "Đã cập nhật file thành công!"
                : "Đã tải lên file mới thành công!",
            );
          }
        }
      } catch (err) {
        console.error("Error processing file:", err);
        alert(
          "Có lỗi khi xử lý file Excel hoặc lưu dữ liệu. Vui lòng kiểm tra lại định dạng file (.xlsx, .xls, .csv) hoặc liên hệ hỗ trợ.",
        );
      } finally {
        setIsMapping(false);
      }
    };
    reader.readAsArrayBuffer(file);

    if (e.target) {
      e.target.value = "";
    }
  };

  const handleDragOver = (e: React.DragEvent, type: "order" | "receipt") => {
    e.preventDefault();
    if (isOrderClosed) return;
    setUploadType(type);
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (isOrderClosed || !uploadType) return;
    const file = e.dataTransfer.files?.[0];
    if (file && (file.name.endsWith(".xlsx") || file.name.endsWith(".xls") || file.name.endsWith(".csv"))) {
      const mockEvent = {
        target: { files: [file] }
      } as unknown as React.ChangeEvent<HTMLInputElement>;
      handleFileUpload(mockEvent);
    } else {
      alert("Vui lòng kéo thả file Excel (.xlsx, .xls, .csv)");
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto flex gap-8 h-[calc(100vh-4rem)]">
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
      {/* Left: Folders (Orders) */}
      <div className="w-1/3 bg-white rounded-2xl shadow-sm border border-slate-200 flex flex-col overflow-hidden">
        <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <Folder className="w-5 h-5 text-emerald-500" />
              Thư mục Đơn hàng
            </h2>
            <button
              onClick={onCreateOrder}
              className="p-1.5 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 rounded-lg transition-colors"
              title="Tạo thư mục đơn hàng mới"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
          <div className="relative">
            <input
              type="text"
              placeholder="Tìm kiếm đơn hàng..."
              value={searchTerm}
              onChange={handleSearchChange}
              className="w-full pl-9 pr-4 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
            />
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {paginatedOrders.map((order) => (
            <div
              key={order.id}
              onClick={() => setSelectedOrderId(order.id)}
              className={`w-full text-left px-4 py-3 rounded-xl flex items-center justify-between transition-colors cursor-pointer group ${
                selectedOrderId === order.id
                  ? "bg-emerald-50 text-emerald-700 font-medium"
                  : "hover:bg-slate-50 text-slate-700"
              }`}
            >
              <div className="flex items-center gap-3 truncate">
                <Folder
                  className={`w-5 h-5 shrink-0 ${selectedOrderId === order.id ? "text-emerald-500" : "text-slate-400"}`}
                />
                <span className="truncate">{order.name}</span>
              </div>
              <div className="flex items-center gap-2">
                {canDeleteOrder(order) && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setOrderToDelete({ id: order.id, name: order.name });
                    }}
                    className={`p-1.5 rounded-lg transition-colors relative z-10 ${
                      selectedOrderId === order.id
                        ? "text-emerald-600 hover:bg-emerald-100"
                        : "text-slate-300 hover:text-rose-600 hover:bg-rose-50"
                    }`}
                    title="Xóa danh mục"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
                <ChevronRight
                  className={`w-4 h-4 shrink-0 ${selectedOrderId === order.id ? "text-emerald-500" : "text-slate-300"}`}
                />
              </div>
            </div>
          ))}
          {paginatedOrders.length === 0 && (
            <div className="p-4 text-center text-slate-500 text-sm">
              {searchTerm
                ? "Không tìm thấy đơn hàng nào"
                : "Chưa có đơn hàng nào"}
            </div>
          )}
        </div>

        {/* Pagination Controls */}
        {totalPages > 1 && (
          <div className="p-3 border-t border-slate-100 bg-slate-50/30 flex items-center justify-between gap-2">
            <button
              onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
              className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="text-xs font-medium text-slate-600">
              Trang {currentPage} / {totalPages}
            </div>
            <button
              onClick={() =>
                setCurrentPage((prev) => Math.min(totalPages, prev + 1))
              }
              disabled={currentPage === totalPages}
              className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* Right: Files in selected Order */}
      <div className="flex-1 bg-white rounded-2xl shadow-sm border border-slate-200 flex flex-col overflow-hidden">
        {selectedOrder ? (
          <>
            <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
              <h2 className="text-lg font-bold text-slate-800">
                Files của: {selectedOrder.name}
              </h2>
            </div>
            <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-8">
              {/* Folder: Đặt hàng */}
              <div>
                <div 
                  className="flex items-center justify-between mb-4 p-4 border-2 border-dashed border-transparent hover:border-blue-500/50 rounded-xl transition-all relative"
                  onDragOver={(e) => handleDragOver(e, "order")}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                >
                  {isDragging && uploadType === "order" && (
                    <div className="absolute inset-0 z-50 bg-blue-500/10 border-2 border-dashed border-blue-500 rounded-xl flex items-center justify-center backdrop-blur-sm transition-all animate-in fade-in duration-200">
                      <div className="flex items-center gap-2 text-blue-600 font-bold">
                        <Upload className="w-5 h-5 animate-bounce" />
                        Thả file đặt hàng
                      </div>
                    </div>
                  )}
                  <h3 className="text-md font-bold text-slate-700 flex items-center gap-2">
                    <Folder className="w-5 h-5 text-blue-500" />
                    Folder: Đặt hàng
                  </h3>
                  {!isOrderClosed && (
                    <button
                      onClick={() => handleUploadNewClick("order")}
                      disabled={isMapping}
                      className="px-3 py-1.5 text-sm font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg flex items-center gap-1.5 transition-colors disabled:opacity-50"
                    >
                      {isMapping && uploadType === "order" ? (
                        <div className="w-4 h-4 border-2 border-slate-300 border-t-blue-600 rounded-full animate-spin" />
                      ) : (
                        <Upload className="w-4 h-4" />
                      )}
                      Thêm File Đặt Hàng
                    </button>
                  )}
                </div>
                {!selectedOrder.orderFiles ||
                selectedOrder.orderFiles.length === 0 ? (
                  <div className="p-6 border-2 border-dashed border-slate-200 rounded-xl text-center text-slate-500">
                    <p>Chưa có file đặt hàng nào.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-3">
                    {selectedOrder.orderFiles.map((file) => (
                      <div
                        key={file.id}
                        className="flex items-center justify-between p-4 rounded-xl border border-slate-200 hover:border-blue-200 hover:shadow-md transition-all group"
                      >
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center text-blue-600 shrink-0">
                            <FileSpreadsheet className="w-5 h-5" />
                          </div>
                          <div>
                            <h4 className="font-medium text-slate-900">
                              {file.fileName}
                            </h4>
                            <div className="flex items-center gap-3 text-xs text-slate-500 mt-1">
                              <span className="flex items-center gap-1">
                                <Calendar className="w-3 h-3" />
                                {new Date(file.importedAt).toLocaleString(
                                  "vi-VN",
                                )}
                              </span>
                              <span>•</span>
                              <span>{file.records.length} sản phẩm</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          {!isOrderClosed && (
                            <>
                              <button
                                onClick={() =>
                                  handleUpdateFileClick("order", file.id)
                                }
                                disabled={isMapping}
                                className="px-3 py-1.5 text-sm font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg flex items-center gap-1.5 transition-colors disabled:opacity-50"
                              >
                                {isMapping && updatingFileId === file.id ? (
                                  <div className="w-4 h-4 border-2 border-slate-300 border-t-blue-600 rounded-full animate-spin" />
                                ) : (
                                  <Upload className="w-4 h-4" />
                                )}
                                Upload lại
                              </button>
                              <button
                                onClick={() => {
                                  const f = selectedOrder.orderFiles?.find(
                                    (f) => f.id === file.id,
                                  );
                                  setFileToDelete({
                                    type: "order",
                                    fileId: file.id,
                                    fileName: f?.fileName || "file",
                                  });
                                }}
                                className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg transition-colors"
                                title="Xóa file"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Folder: Hàng về */}
              <div>
                <div 
                  className="flex items-center justify-between mb-4 p-4 border-2 border-dashed border-transparent hover:border-emerald-500/50 rounded-xl transition-all relative"
                  onDragOver={(e) => handleDragOver(e, "receipt")}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                >
                  {isDragging && uploadType === "receipt" && (
                    <div className="absolute inset-0 z-50 bg-emerald-500/10 border-2 border-dashed border-emerald-500 rounded-xl flex items-center justify-center backdrop-blur-sm transition-all animate-in fade-in duration-200">
                      <div className="flex items-center gap-2 text-emerald-600 font-bold">
                        <Upload className="w-5 h-5 animate-bounce" />
                        Thả file hàng về
                      </div>
                    </div>
                  )}
                  <h3 className="text-md font-bold text-slate-700 flex items-center gap-2">
                    <Folder className="w-5 h-5 text-emerald-500" />
                    Folder: Hàng về
                  </h3>
                  {!isOrderClosed && (
                    <button
                      onClick={() => handleUploadNewClick("receipt")}
                      disabled={isMapping}
                      className="px-3 py-1.5 text-sm font-medium text-emerald-600 bg-emerald-50 hover:bg-emerald-100 rounded-lg flex items-center gap-1.5 transition-colors disabled:opacity-50"
                    >
                      {isMapping && uploadType === "receipt" ? (
                        <div className="w-4 h-4 border-2 border-slate-300 border-t-emerald-600 rounded-full animate-spin" />
                      ) : (
                        <Upload className="w-4 h-4" />
                      )}
                      Thêm File Hàng Về
                    </button>
                  )}
                </div>
                {!selectedOrder.receipts ||
                selectedOrder.receipts.length === 0 ? (
                  <div className="p-6 border-2 border-dashed border-slate-200 rounded-xl text-center text-slate-500">
                    <p>Chưa có file nhập hàng nào.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-3">
                    {selectedOrder.receipts.map((receipt) => (
                      <div
                        key={receipt.id}
                        className="flex items-center justify-between p-4 rounded-xl border border-slate-200 hover:border-emerald-200 hover:shadow-md transition-all group"
                      >
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center text-emerald-600 shrink-0">
                            <FileSpreadsheet className="w-5 h-5" />
                          </div>
                          <div>
                            <h4 className="font-medium text-slate-900">
                              {receipt.fileName}
                            </h4>
                            <div className="flex items-center gap-3 text-xs text-slate-500 mt-1">
                              <span className="flex items-center gap-1">
                                <Calendar className="w-3 h-3" />
                                {new Date(receipt.importedAt).toLocaleString(
                                  "vi-VN",
                                )}
                              </span>
                              <span>•</span>
                              <span>{receipt.records.length} sản phẩm</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          {!isOrderClosed && (
                            <>
                              <button
                                onClick={() =>
                                  handleUpdateFileClick("receipt", receipt.id)
                                }
                                disabled={isMapping}
                                className="px-3 py-1.5 text-sm font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg flex items-center gap-1.5 transition-colors disabled:opacity-50"
                              >
                                {isMapping && updatingFileId === receipt.id ? (
                                  <div className="w-4 h-4 border-2 border-slate-300 border-t-blue-600 rounded-full animate-spin" />
                                ) : (
                                  <Upload className="w-4 h-4" />
                                )}
                                Upload lại
                              </button>
                              <button
                                onClick={() => {
                                  const r = selectedOrder.receipts?.find(
                                    (r) => r.id === receipt.id,
                                  );
                                  setFileToDelete({
                                    type: "receipt",
                                    fileId: receipt.id,
                                    fileName: r?.fileName || "file",
                                  });
                                }}
                                className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg transition-colors"
                                title="Xóa file"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              accept=".xlsx, .xls, .csv"
              className="hidden"
              disabled={isOrderClosed}
            />
          </>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-slate-400">
            <Folder className="w-16 h-16 mb-4 text-slate-200" />
            <p>Chọn một đơn hàng bên trái để xem các file đã nhập</p>
          </div>
        )}
      </div>

      <ConfirmModal
        isOpen={orderToDelete !== null}
        title="Xóa danh mục đơn hàng"
        message={`Bạn có chắc chắn muốn xóa toàn bộ danh mục đơn hàng "${orderToDelete?.name}"? Hành động này sẽ xóa tất cả file và dữ liệu liên quan.`}
        onConfirm={async () => {
          if (orderToDelete) {
            try {
              await onDeleteOrder(orderToDelete.id);
              if (selectedOrderId === orderToDelete.id) {
                setSelectedOrderId(null);
              }
              setOrderToDelete(null);
            } catch (err) {
              alert("Có lỗi khi xóa danh mục đơn hàng. Vui lòng thử lại.");
            }
          }
        }}
        onCancel={() => setOrderToDelete(null)}
      />

      <ConfirmModal
        isOpen={fileToDelete !== null}
        title="Xóa file dữ liệu"
        message={`Bạn có chắc chắn muốn xóa file "${fileToDelete?.fileName}"? Dữ liệu từ file này sẽ bị hoàn tác khỏi đơn hàng.`}
        onConfirm={confirmDeleteFile}
        onCancel={() => setFileToDelete(null)}
      />
    </div>
  );
}
