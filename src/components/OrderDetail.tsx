import React, { useState, useRef } from "react";
import { Order, OrderItem, OrderStatus } from "../types";
import { formatCurrency, formatNumber, parseExcelData } from "../utils";
import { mapExcelHeaders } from "../services/gemini";
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
  AlertCircle
} from "lucide-react";
import * as XLSX from "xlsx";
import { recalculateOrder } from "../orderUtils";
import { BarcodeScanner } from "./BarcodeScanner";

interface OrderDetailProps {
  order: Order;
  onUpdate: (order: Order) => Promise<void> | void;
  onBack: () => void;
}

export function OrderDetail({ order, onUpdate, onBack }: OrderDetailProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [editingItem, setEditingItem] = useState<OrderItem | null>(null);
  const [newReceivedQty, setNewReceivedQty] = useState<string>("");
  const [newActualPrice, setNewActualPrice] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [importResult, setImportResult] = useState<{ matched: number, unmatched: string[], overReceived: {name: string, excess: number}[] } | null>(null);
  const [isMapping, setIsMapping] = useState(false);
  const [showScanner, setShowScanner] = useState(false);

  const [filterStatus, setFilterStatus] = useState<"all" | "missing" | "completed" | "price_increased" | "over_received">("all");
  const [isContinuousScan, setIsContinuousScan] = useState(false);

  const totalOrdered = order.items.reduce(
    (sum, item) => sum + item.orderedQty,
    0,
  );
  const totalReceived = order.items.reduce(
    (sum, item) => sum + item.receivedQty,
    0,
  );
  const progress =
    totalOrdered > 0 ? Math.round((totalReceived / totalOrdered) * 100) : 0;

  const priceIncreasedItems = order.items.filter((item) => {
    const avgPrice = item.receivedQty > 0 
      ? (item.totalReceivedCost ?? (item.receivedQty * item.actualPrice)) / item.receivedQty 
      : item.actualPrice;
    return avgPrice > item.expectedPrice || item.actualPrice > item.expectedPrice;
  }).length;

  const highValueMissing = order.items.filter(item => {
    const missingQty = item.orderedQty - item.receivedQty;
    return missingQty > 0 && (item.expectedPrice * missingQty) > 500000; // Warning for missing value > 500k
  });

  const filteredItems = order.items.filter((item) => {
    const term = searchTerm.toLowerCase();
    const matchesSearch = String(item.name).toLowerCase().includes(term) || 
                          (item.productName && String(item.productName).toLowerCase().includes(term));
    if (!matchesSearch) return false;

    const missingQty = Math.max(0, item.orderedQty - item.receivedQty);
    const isCompleted = item.receivedQty >= item.orderedQty;
    const avgPrice = item.receivedQty > 0 
      ? (item.totalReceivedCost ?? (item.receivedQty * item.actualPrice)) / item.receivedQty 
      : item.actualPrice;
    const isPriceIncreased = avgPrice > item.expectedPrice || item.actualPrice > item.expectedPrice;
    const isOverReceived = item.receivedQty > item.orderedQty;

    if (filterStatus === "missing" && missingQty === 0) return false;
    if (filterStatus === "completed" && !isCompleted) return false;
    if (filterStatus === "price_increased" && !isPriceIncreased) return false;
    if (filterStatus === "over_received" && !isOverReceived) return false;

    return true;
  });

  const handleOpenEdit = (item: OrderItem) => {
    setEditingItem(item);
    setNewReceivedQty("0"); // Default to 0 new items
    setNewActualPrice(item.actualPrice.toString());
  };

  const handleSaveEdit = async () => {
    if (!editingItem) return;

    const addedQty = parseInt(newReceivedQty, 10) || 0;
    const updatedPrice = parseFloat(newActualPrice) || editingItem.actualPrice;

    const newTotalReceived = editingItem.receivedQty + addedQty;
    if (newTotalReceived > editingItem.orderedQty) {
      if (!window.confirm(`Sản phẩm "${editingItem.name}" sẽ có tổng số lượng về (${newTotalReceived}) vượt quá số lượng đặt (${editingItem.orderedQty}). Bạn có chắc chắn muốn lưu?`)) {
        return;
      }
    }

    const updatedItems = order.items.map((item) => {
      if (item.id === editingItem.id) {
        const manualQty = (item.manualReceivedQty !== undefined ? item.manualReceivedQty : item.receivedQty) + addedQty;
        const currentManualCost = item.manualTotalCost !== undefined ? item.manualTotalCost : (item.totalReceivedCost ?? (item.receivedQty * item.actualPrice));
        const manualCost = currentManualCost + (addedQty * updatedPrice);
        
        return {
          ...item,
          manualReceivedQty: manualQty,
          manualTotalCost: manualCost,
          actualPrice: updatedPrice // Manual update overrides latest price
        };
      }
      return item;
    });

    const finalOrder = recalculateOrder({ ...order, items: updatedItems });
    try {
      await onUpdate(finalOrder);
      setEditingItem(null);
    } catch (err) {
      alert("Có lỗi khi lưu thay đổi. Vui lòng thử lại.");
    }
  };

  const handleExportExcel = () => {
    const data = filteredItems.map(item => {
      const avgPrice = item.receivedQty > 0 
        ? (item.totalReceivedCost ?? (item.receivedQty * item.actualPrice)) / item.receivedQty 
        : item.actualPrice;
        
      return {
        "Tên sản phẩm": item.name,
        "Số lượng đặt": item.orderedQty,
        "Đã về": item.receivedQty,
        "Còn thiếu / Dư": item.receivedQty > item.orderedQty ? `Dư ${item.receivedQty - item.orderedQty}` : Math.max(0, item.orderedQty - item.receivedQty),
        "Giá đặt (VND)": item.expectedPrice,
        "Giá mới nhất (VND)": item.actualPrice,
        "Giá bình quân (VND)": Math.round(avgPrice),
        "Chênh lệch giá BQ": Math.round(avgPrice - item.expectedPrice),
        "Trạng thái": item.receivedQty > item.orderedQty ? "Vượt số lượng" : item.receivedQty === item.orderedQty ? "Đã đủ" : "Còn thiếu"
      };
    });

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Danh sách sản phẩm");
    
    XLSX.writeFile(wb, `${order.name}_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const handleExportDiscrepancy = () => {
    const discrepancyItems = order.items.filter(item => item.receivedQty !== item.orderedQty);
    
    if (discrepancyItems.length === 0) {
      alert("Đơn hàng đã về đủ, không có chênh lệch.");
      return;
    }

    const data = discrepancyItems.map(item => ({
      "Mã sản phẩm": item.name,
      "Tên sản phẩm": item.productName || "",
      "Số lượng đặt": item.orderedQty,
      "Số lượng thực nhận": item.receivedQty,
      "Chênh lệch": item.receivedQty - item.orderedQty,
      "Trạng thái": item.receivedQty > item.orderedQty ? "Dư hàng" : "Thiếu hàng",
      "Giá đặt": item.expectedPrice,
      "Giá thực tế": item.actualPrice,
      "Giá trị chênh lệch (VND)": (item.receivedQty - item.orderedQty) * item.expectedPrice,
      "Ghi chú": ""
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Báo cáo chênh lệch");
    
    XLSX.writeFile(wb, `BAO_CAO_CHENH_LECH_${order.name}.xlsx`);
  };

  const handleBarcodeScan = async (code: string) => {
    const lowerCode = code.toLowerCase();
    const item = order.items.find(i => 
      String(i.name).toLowerCase() === lowerCode || 
      (i.productName && String(i.productName).toLowerCase() === lowerCode)
    );

    if (item) {
      const updatedItems = order.items.map((i) => {
        if (i.id === item.id) {
          const manualQty = (i.manualReceivedQty !== undefined ? i.manualReceivedQty : i.receivedQty) + 1;
          const currentManualCost = i.manualTotalCost !== undefined ? i.manualTotalCost : (i.totalReceivedCost ?? (i.receivedQty * i.actualPrice));
          const manualCost = currentManualCost + (1 * i.actualPrice);
          
          return {
            ...i,
            manualReceivedQty: manualQty,
            manualTotalCost: manualCost,
            receivedQty: manualQty,
            totalReceivedCost: manualCost
          };
        }
        return i;
      });
      try {
        await onUpdate(recalculateOrder({ ...order, items: updatedItems }));
        
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
      await onUpdate({ ...order, status: newStatus });
    } catch (err) {
      alert("Có lỗi khi cập nhật trạng thái. Vui lòng thử lại.");
    }
  };

  const handleImportReceivedExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsMapping(true);
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const data = evt.target?.result;
        if (!data) return;
        
        const wb = XLSX.read(data, { type: 'array' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const jsonData = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];
        
        // Try heuristic first
        let parsedRecords = parseExcelData(jsonData);
        
        // If heuristic found very few records or failed, try AI mapping
        if (parsedRecords.length === 0 && jsonData.length > 0) {
          const aiResult = await mapExcelHeaders(jsonData);
          const { colMap, headerIndex } = aiResult;
          
          if (colMap.productCode !== -1 && colMap.quantity !== -1 && headerIndex !== -1) {
            const aiRecords = [];
            for (let i = headerIndex + 1; i < jsonData.length; i++) {
              const row = jsonData[i];
              if (!Array.isArray(row)) continue;
              
              const name = String(row[colMap.productCode] || '').trim();
              if (!name) continue;
              
              const productName = colMap.productName !== -1 ? String(row[colMap.productName] || '').trim() : undefined;
              const qty = parseInt(String(row[colMap.quantity] || '0').replace(/[^0-9.-]/g, ''), 10) || 0;
              const price = colMap.price !== -1 ? parseFloat(String(row[colMap.price] || '0').replace(/[^0-9.-]/g, '')) || 0 : 0;
              
              if (name && qty > 0) {
                aiRecords.push({ name, productName, qty, price });
              }
            }
            if (aiRecords.length > 0) {
              parsedRecords = aiRecords;
            }
          }
        }
        
        let matchedCount = 0;
        const unmatchedNames: string[] = [];
        const overReceivedItems: {name: string, excess: number}[] = [];
        
        const records: import("../types").ReceiptRecord[] = [];

        parsedRecords.forEach((record) => {
          const cleanName = String(record.name || '').toLowerCase().trim();
          const cleanProductName = String(record.productName || '').toLowerCase().trim();

          const item = order.items.find(i => {
            const iName = String(i.name || '').toLowerCase().trim();
            const iProductName = String(i.productName || '').toLowerCase().trim();
            
            return iName === cleanName || 
                   (cleanProductName && iProductName === cleanProductName) ||
                   (cleanProductName && iName === cleanProductName) ||
                   (iProductName && iProductName === cleanName);
          });

          if (item) {
            records.push({
              itemId: item.id,
              name: item.name,
              productName: record.productName,
              qty: record.qty,
              price: record.price
            });
            matchedCount++;
          } else {
            unmatchedNames.push(record.name);
          }
        });

        const newReceipt: import("../types").Receipt = {
          id: crypto.randomUUID(),
          fileName: file.name,
          importedAt: new Date().toISOString(),
          records
        };

        const updatedOrder = {
          ...order,
          receipts: [...(order.receipts || []), newReceipt]
        };

        const finalOrder = recalculateOrder(updatedOrder);

        // Check for over received
        finalOrder.items.forEach(item => {
          if (item.receivedQty > item.orderedQty) {
            const record = records.find(r => r.itemId === item.id);
            if (record) {
               overReceivedItems.push({ name: item.name, excess: item.receivedQty - item.orderedQty });
            }
          }
        });

        try {
          await onUpdate(finalOrder);
          setImportResult({ matched: matchedCount, unmatched: unmatchedNames, overReceived: overReceivedItems });
        } catch (err) {
          console.error("Error saving order:", err);
          alert("Có lỗi khi lưu dữ liệu lên máy chủ. Vui lòng thử lại.");
        }
      } catch (err) {
        console.error("Error processing file:", err);
        alert("Có lỗi khi xử lý file Excel.");
      } finally {
        setIsMapping(false);
      }
    };
    reader.readAsArrayBuffer(file);
    
    if (e.target) {
      e.target.value = '';
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto">
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
            <h3 className="text-lg font-bold text-slate-900">Đang xử lý dữ liệu AI...</h3>
            <p className="text-slate-500">Hệ thống đang tự động nhận diện và ghép các cột từ file Excel của bạn.</p>
          </div>
        </div>
      )}

      <div className="flex justify-between items-start mb-8">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-3xl font-bold text-slate-900 tracking-tight">
              {order.name}
            </h1>
            <select
              value={order.status || OrderStatus.PENDING}
              onChange={(e) => handleStatusChange(e.target.value as OrderStatus)}
              className={`text-xs font-bold px-3 py-1 rounded-full border-2 transition-all cursor-pointer outline-none ${
                order.status === OrderStatus.COMPLETED ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100' :
                order.status === OrderStatus.PARTIAL ? 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100' :
                order.status === OrderStatus.DISPUTED ? 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100' :
                'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
              }`}
            >
              <option value={OrderStatus.PENDING}>CHỜ HÀNG</option>
              <option value={OrderStatus.PARTIAL}>ĐANG VỀ</option>
              <option value={OrderStatus.COMPLETED}>HOÀN TẤT</option>
              <option value={OrderStatus.DISPUTED}>KHIẾU NẠI</option>
            </select>
          </div>
          <div className="flex items-center gap-4 mt-2 text-slate-500">
            <span>
              Khách hàng: <strong className="text-slate-700">{order.customerName || 'Khách lẻ'}</strong>
            </span>
            <span>•</span>
            <span>
              NCC: <strong className="text-slate-700">{order.supplier}</strong>
            </span>
            <span>•</span>
            <span>
              Ngày đặt:{" "}
              <strong className="text-slate-700">
                {new Date(order.date).toLocaleDateString("vi-VN")}
              </strong>
            </span>
            <span>•</span>
            <span className="flex items-center gap-1">
              Tiến độ: <strong className="text-blue-600">{progress}%</strong>
              <span className="text-slate-400 text-xs">({formatNumber(totalReceived)}/{formatNumber(totalOrdered)})</span>
            </span>
          </div>
        </div>
        <div className="flex gap-3">
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleImportReceivedExcel} 
            accept=".xlsx, .xls, .csv" 
            className="hidden" 
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="bg-blue-50 text-blue-600 hover:bg-blue-100 px-4 py-2 rounded-xl font-medium flex items-center gap-2 transition-all shadow-sm"
          >
            <Upload className="w-4 h-4" />
            Nhập file NCC
          </button>
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

      {highValueMissing.length > 0 && (
        <div className="mb-8 bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-4 animate-in fade-in slide-in-from-top-4 duration-500">
          <div className="p-2 bg-amber-100 rounded-xl text-amber-600">
            <AlertCircle className="w-6 h-6" />
          </div>
          <div className="flex-1">
            <h3 className="font-bold text-amber-900">Cảnh báo hàng giá trị cao bị thiếu</h3>
            <p className="text-sm text-amber-700 mt-1">
              Có {highValueMissing.length} sản phẩm giá trị cao đang bị thiếu hàng. Tổng giá trị thiếu hụt ước tính: 
              <strong className="ml-1">
                {formatCurrency(highValueMissing.reduce((sum, i) => sum + (i.expectedPrice * (i.orderedQty - i.receivedQty)), 0))}
              </strong>
            </p>
          </div>
          <button 
            onClick={() => setFilterStatus("missing")}
            className="px-4 py-2 bg-amber-600 text-white text-sm font-bold rounded-lg hover:bg-amber-700 transition-colors"
          >
            Xem ngay
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 hover:border-blue-200 transition-colors">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-slate-500 font-medium text-sm uppercase tracking-wider">Tổng đặt hàng</h3>
            <Package className="w-5 h-5 text-blue-500" />
          </div>
          <div className="text-3xl font-bold text-slate-900">
            {formatNumber(totalOrdered)}
          </div>
          <p className="text-xs text-slate-400 mt-2">Số lượng sản phẩm theo đơn đặt</p>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 hover:border-emerald-200 transition-colors">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-slate-500 font-medium text-sm uppercase tracking-wider">Tổng đã nhận</h3>
            <CheckCircle className="w-5 h-5 text-emerald-500" />
          </div>
          <div className="text-3xl font-bold text-slate-900">
            {formatNumber(totalReceived)}
          </div>
          <p className="text-xs text-slate-400 mt-2">Số lượng thực tế đã nhập kho</p>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 hover:border-indigo-200 transition-colors">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-slate-500 font-medium text-sm uppercase tracking-wider">Tiến độ hoàn thành</h3>
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
            <h3 className="text-slate-500 font-medium text-sm uppercase tracking-wider">Cảnh báo giá</h3>
            <AlertTriangle
              className={`w-5 h-5 ${priceIncreasedItems > 0 ? "text-rose-500" : "text-slate-300"}`}
            />
          </div>
          <div className="text-3xl font-bold text-slate-900">
            {priceIncreasedItems}
          </div>
          <p className="text-xs text-slate-400 mt-2">Sản phẩm bị tăng giá so với đặt hàng</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between bg-slate-50/50 gap-4">
          <h2 className="text-lg font-bold text-slate-800">
            Chi tiết sản phẩm
          </h2>
          <div className="flex flex-col sm:flex-row gap-3">
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
                  ? 'bg-emerald-100 text-emerald-700 border-emerald-200' 
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'
              }`}
              title="Chế độ quét liên tục: Tự động cộng 1 khi quét mã"
            >
              <Barcode className="w-4 h-4" />
              {isContinuousScan ? 'Đang quét liên tục' : 'Quét mã'}
            </button>
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Tìm mã hoặc tên sản phẩm..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={async (e) => {
                  if (e.key === 'Enter') {
                    if (filteredItems.length === 1) {
                      if (isContinuousScan) {
                        const item = filteredItems[0];
                        const updatedItems = order.items.map((i) => {
                          if (i.id === item.id) {
                            const manualQty = (i.manualReceivedQty !== undefined ? i.manualReceivedQty : i.receivedQty) + 1;
                            const currentManualCost = i.manualTotalCost !== undefined ? i.manualTotalCost : (i.totalReceivedCost ?? (i.receivedQty * i.actualPrice));
                            const manualCost = currentManualCost + (1 * i.actualPrice);
                            
                            return {
                              ...i,
                              manualReceivedQty: manualQty,
                              manualTotalCost: manualCost,
                              receivedQty: manualQty,
                              totalReceivedCost: manualCost
                            };
                          }
                          return i;
                        });
                        try {
                          await onUpdate(recalculateOrder({ ...order, items: updatedItems }));
                        } catch (err) {
                          alert("Có lỗi khi xóa sản phẩm. Vui lòng thử lại.");
                        }
                        setSearchTerm("");
                      } else {
                        handleOpenEdit(filteredItems[0]);
                        setSearchTerm("");
                      }
                    } else if (filteredItems.length === 0 && searchTerm.trim() !== "") {
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
                onChange={(e) => setFilterStatus(e.target.value as any)}
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
                <th className="px-6 py-4">Mã Sản Phẩm</th>
                <th className="px-6 py-4">Tên Sản Phẩm</th>
                <th className="px-6 py-4 text-right">SL Đặt</th>
                <th className="px-6 py-4 text-right">Đã Về</th>
                <th className="px-6 py-4 text-right">Còn Thiếu / Dư</th>
                <th className="px-6 py-4 text-right">Giá Đặt</th>
                <th className="px-6 py-4 text-right">Giá Mới Nhất</th>
                <th className="px-6 py-4 text-right">Giá Bình Quân</th>
                <th className="px-6 py-4 text-center">Cảnh báo</th>
                <th className="px-6 py-4 text-center">Hành động</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredItems.map((item) => {
                const missingQty = Math.max(
                  0,
                  item.orderedQty - item.receivedQty,
                );
                const avgPrice = item.receivedQty > 0 
                  ? (item.totalReceivedCost ?? (item.receivedQty * item.actualPrice)) / item.receivedQty 
                  : item.actualPrice;
                const priceDiff = avgPrice - item.expectedPrice;
                const isPriceIncreased = priceDiff > 0;
                const isPriceDecreased = priceDiff < 0;
                const isCompleted = item.receivedQty >= item.orderedQty;
                const isOverReceived = item.receivedQty > item.orderedQty;
                const hasWarning = missingQty > 0 || isPriceIncreased || isOverReceived;

                return (
                  <tr
                    key={item.id}
                    className={`transition-colors ${hasWarning ? 'bg-rose-50/20 hover:bg-rose-50/40' : 'hover:bg-slate-50/50'}`}
                  >
                    <td className="px-6 py-4">
                      <div className="font-medium text-slate-900">
                        {item.name}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-slate-600 text-sm">
                        {item.productName || '-'}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right text-slate-600 font-medium">
                      {formatNumber(item.orderedQty)}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <span
                        className={`font-bold ${isCompleted ? "text-emerald-600" : "text-blue-600"}`}
                      >
                        {formatNumber(item.receivedQty)}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
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
                    <td className="px-6 py-4 text-right text-slate-600">
                      {formatCurrency(item.expectedPrice)}
                    </td>
                    <td className="px-6 py-4 text-right text-slate-500">
                      {formatCurrency(item.actualPrice)}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <span
                        className={`font-bold ${isPriceIncreased ? "text-rose-600" : isPriceDecreased ? "text-emerald-600" : "text-slate-900"}`}
                      >
                        {formatCurrency(avgPrice)}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <div className="flex flex-col items-center gap-1.5">
                        {isPriceIncreased && (
                          <div className="flex items-center gap-1 text-rose-700 bg-rose-100 px-2 py-1 rounded text-xs font-bold border border-rose-200">
                            <TrendingUp className="w-3 h-3" /> Tăng {formatCurrency(priceDiff)}
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
                        {!isPriceIncreased && missingQty === 0 && !isOverReceived && (
                          <div className="flex items-center gap-1 text-emerald-700 bg-emerald-100 px-2 py-1 rounded text-xs font-bold border border-emerald-200">
                            <CheckCircle className="w-3 h-3" /> Ổn định
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <button
                        onClick={() => handleOpenEdit(item)}
                        className="text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border border-transparent hover:border-emerald-100"
                      >
                        Cập nhật
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
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
                    type="number"
                    value={newReceivedQty}
                    onChange={(e) => setNewReceivedQty(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
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
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Giá thực tế mới nhất (VND)
                </label>
                <input
                  type="number"
                  value={newActualPrice}
                  onChange={(e) => setNewActualPrice(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
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
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center">
              <h3 className="text-xl font-bold text-slate-900">
                Kết quả đối chiếu
              </h3>
              <button onClick={() => setImportResult(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="flex items-center gap-3 text-emerald-600 bg-emerald-50 p-4 rounded-xl">
                <CheckCircle className="w-6 h-6" />
                <div>
                  <p className="font-bold text-lg">{importResult.matched} sản phẩm</p>
                  <p className="text-sm">Đã được cập nhật số lượng thành công.</p>
                </div>
              </div>

              {importResult.overReceived.length > 0 && (
                <div className="mt-4">
                  <div className="flex items-center gap-2 text-amber-600 mb-2">
                    <AlertTriangle className="w-5 h-5" />
                    <span className="font-bold">Cảnh báo: {importResult.overReceived.length} sản phẩm giao vượt số lượng đặt:</span>
                  </div>
                  <div className="bg-amber-50 p-3 rounded-lg max-h-40 overflow-y-auto text-sm text-amber-700">
                    <ul className="list-disc pl-5 space-y-1">
                      {importResult.overReceived.map((item, idx) => (
                        <li key={idx}>{item.name} (Vượt: {item.excess})</li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}

              {importResult.unmatched.length > 0 && (
                <div className="mt-4">
                  <div className="flex items-center gap-2 text-rose-600 mb-2">
                    <AlertTriangle className="w-5 h-5" />
                    <span className="font-bold">Không tìm thấy {importResult.unmatched.length} sản phẩm:</span>
                  </div>
                  <div className="bg-rose-50 p-3 rounded-lg max-h-40 overflow-y-auto text-sm text-rose-700">
                    <ul className="list-disc pl-5 space-y-1">
                      {importResult.unmatched.map((name, idx) => (
                        <li key={idx}>{name}</li>
                      ))}
                    </ul>
                  </div>
                  <p className="text-xs text-slate-500 mt-2">
                    * Các sản phẩm này có trong file của NCC nhưng không khớp với tên sản phẩm trong đơn đặt hàng của bạn.
                  </p>
                </div>
              )}
            </div>
            <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end">
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
    </div>
  );
}
