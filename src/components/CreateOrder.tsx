import React, { useState, useRef } from "react";
import { Order, OrderItem, OrderFile, OrderStatus, Product, OrderType } from "../types";
import { recalculateOrder } from "../orderUtils";
import {
  ArrowLeft,
  Save,
  Plus,
  Trash2,
  FileSpreadsheet,
  AlertCircle,
  Upload,
  Search,
  Barcode,
} from "lucide-react";
import {
  formatCurrency,
  parseExcelData,
  parseNumber,
  parseDate,
} from "../utils";
import * as XLSX from "xlsx";
import { mapExcelHeaders } from "../services/gemini";
import { useAuth, useUsers } from "../store";

interface CreateOrderProps {
  onSave: (order: Order) => Promise<void> | void;
  onCancel: () => void;
  userRole?: "admin" | "user";
  products?: Product[];
}

export function CreateOrder({
  onSave,
  onCancel,
  userRole,
  products = [],
}: CreateOrderProps) {
  const [name, setName] = useState("");
  const [type, setType] = useState<OrderType>(OrderType.SALES);
  const [supplier, setSupplier] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [userId, setUserId] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [currency, setCurrency] = useState("VND");
  const [exchangeRate, setExchangeRate] = useState<number | string>(1);
  const [items, setItems] = useState<OrderItem[]>([]);
  const [pasteData, setPasteData] = useState("");
  const [showPasteArea, setShowPasteArea] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const { user: currentUser, token } = useAuth();
  const { users } = useUsers(currentUser, token);

  React.useEffect(() => {
    if (userRole === "user" && currentUser && !customerName) {
      setCustomerName(currentUser.username);
      setCustomerEmail(currentUser.email);
      setUserId(currentUser.id);
    }
  }, [userRole, currentUser, customerName]);

  const productSuggestions = products
    .filter(
      (p) =>
        searchTerm.trim() !== "" &&
        (p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          p.sku.toLowerCase().includes(searchTerm.toLowerCase())),
    )
    .slice(0, 5);

  const handleSelectProduct = (product: Product) => {
    const newItem: OrderItem = {
      id: crypto.randomUUID(),
      name: product.sku,
      productName: product.name,
      orderedQty: 1,
      expectedPrice: product.basePrice,
      receivedQty: 0,
      actualPrice: product.basePrice,
      totalReceivedCost: 0,
    };
    setItems([...items, newItem]);
    setSearchTerm("");
    setShowSuggestions(false);
  };

  const filteredItems = items.filter((item) => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      String(item.name).toLowerCase().includes(term) ||
      (item.productName &&
        String(item.productName).toLowerCase().includes(term))
    );
  });

  const [isMapping, setIsMapping] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
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

        const newItems: OrderItem[] = parsedRecords.map((record) => {
          return {
            id: crypto.randomUUID(),
            name: record.name,
            productName: record.productName,
            orderedQty: record.qty,
            expectedPrice: record.price,
            receivedQty: 0,
            actualPrice: record.price,
            totalReceivedCost: 0,
          };
        });

        setItems((prev) => [...prev, ...newItems]);
        if (documentDate) {
          setDate(documentDate.split("T")[0]);
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
      handleFileUpload(mockEvent);
    } else {
      alert("Vui lòng kéo thả file Excel (.xlsx, .xls, .csv)");
    }
  };

  const handleAddItem = () => {
    setItems([
      ...items,
      {
        id: crypto.randomUUID(),
        name: "",
        orderedQty: 1,
        expectedPrice: 0,
        receivedQty: 0,
        actualPrice: 0,
        totalReceivedCost: 0,
      },
    ]);
  };

  const handleUpdateItem = (id: string, field: keyof OrderItem, value: any) => {
    setItems(
      items.map((item) => {
        if (item.id === id) {
          return { ...item, [field]: value };
        }
        return item;
      }),
    );
  };

  const handleRemoveItem = (id: string) => {
    setItems(items.filter((item) => item.id !== id));
  };

  const handleParsePaste = (dataToParse?: string) => {
    const data = dataToParse || pasteData;
    if (!data.trim()) return;

    const rows = data.split("\n");
    const newItems: OrderItem[] = rows
      .map((row) => {
        const cols = row.split("\t");
        if (cols.length >= 2) {
          const name = cols[0].trim();
          let productName = "";
          let qtyStr = "";
          let priceStr = "";

          if (cols.length >= 4) {
            productName = cols[1].trim();
            qtyStr = cols[2];
            priceStr = cols[3];
          } else if (cols.length === 3) {
            // Assume Code | Name | Qty if the last one is a number, or Code | Qty | Price
            const val2 = parseFloat(cols[2].replace(/,/g, ""));
            if (!isNaN(val2) && cols[2].trim() !== "") {
              // Could be Code | Qty | Price
              const val1 = parseFloat(cols[1].replace(/,/g, ""));
              if (!isNaN(val1) && cols[1].trim() !== "") {
                qtyStr = cols[1];
                priceStr = cols[2];
              } else {
                productName = cols[1].trim();
                qtyStr = cols[2];
              }
            } else {
              productName = cols[1].trim();
              qtyStr = cols[2];
            }
          } else {
            qtyStr = cols[1];
          }

          const qty = parseInt(qtyStr.replace(/,/g, ""), 10) || 0;
          const price = priceStr
            ? parseFloat(priceStr.replace(/,/g, "")) || 0
            : 0;

          if (name && qty > 0) {
            return {
              id: crypto.randomUUID(),
              name,
              productName,
              orderedQty: qty,
              expectedPrice: price,
              receivedQty: 0,
              actualPrice: price,
              totalReceivedCost: 0,
            };
          }
        }
        return null;
      })
      .filter(Boolean) as OrderItem[];

    setItems([...items, ...newItems]);
    setPasteData("");
    setShowPasteArea(false);
  };

  const handleSave = async () => {
    if (!name.trim()) {
      alert("Vui lòng nhập tên đơn hàng");
      return;
    }

    const validItems = items.filter((item) => item.orderedQty > 0);

    if (validItems.length === 0) {
      alert("Vui lòng thêm ít nhất 1 sản phẩm có số lượng lớn hơn 0");
      return;
    }

    const initialOrderFile: OrderFile = {
      id: crypto.randomUUID(),
      fileName: "File gốc",
      importedAt: new Date().toISOString(),
      records: validItems.map((item) => ({
        itemId: item.id,
        name: item.name,
        productName: item.productName,
        qty: item.orderedQty,
        price: item.expectedPrice,
      })),
    };

    const newOrder: Order = {
      id: crypto.randomUUID(),
      name,
      type,
      supplier,
      customerName: customerName.trim() || "Khách lẻ",
      customerEmail: customerEmail,
      userId: userId,
      date: new Date(date).toISOString(),
      items: validItems,
      orderFiles: [initialOrderFile],
      receipts: [],
      status: OrderStatus.PROCESSING,
      currency,
      exchangeRate: currency === "VND" ? 1 : (Number(exchangeRate) || 1),
    };

    try {
      await onSave(recalculateOrder(newOrder));
    } catch (err) {
      console.error("Error saving order:", err);
    }
  };

  return (
    <div 
      className="p-8 max-w-5xl mx-auto relative"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {isDragging && (
        <div className="absolute inset-0 z-50 bg-emerald-500/10 border-4 border-dashed border-emerald-500 rounded-3xl flex items-center justify-center backdrop-blur-sm transition-all animate-in fade-in duration-200">
          <div className="bg-white p-8 rounded-2xl shadow-2xl text-center">
            <Upload className="w-16 h-16 text-emerald-600 mx-auto mb-4 animate-bounce" />
            <h3 className="text-xl font-bold text-slate-900">Thả file vào đây để nhập Excel</h3>
            <p className="text-slate-500 mt-2">Hỗ trợ .xlsx, .xls, .csv</p>
          </div>
        </div>
      )}
      <button
        onClick={onCancel}
        className="flex items-center gap-2 text-slate-500 hover:text-slate-900 transition-colors mb-6 font-medium"
      >
        <ArrowLeft className="w-4 h-4" />
        Hủy & Quay lại
      </button>

      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">
            Tạo Đơn Hàng Mới
          </h1>
          <p className="text-slate-500 mt-1">
            Nhập thông tin đơn hàng và danh sách sản phẩm
          </p>
        </div>
        <button
          onClick={handleSave}
          className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-2.5 rounded-xl font-medium flex items-center gap-2 transition-all shadow-sm shadow-emerald-600/20"
        >
          <Save className="w-5 h-5" />
          Lưu Đơn Hàng
        </button>
      </div>

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

      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 mb-8">
        <h2 className="text-lg font-bold text-slate-800 mb-4">
          Thông tin chung
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Loại đơn hàng *
            </label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as OrderType)}
              className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
            >
              <option value={OrderType.SALES}>Đơn bán hàng (Khách hàng)</option>
              <option value={OrderType.PURCHASE}>Đơn mua hàng (NCC)</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Tên đơn hàng (Tên List) *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="VD: Đơn nhập hàng tháng 10"
              className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
            />
          </div>
          {userRole === "admin" && type === OrderType.SALES && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Khách hàng (Người up list)
              </label>
              <select
                value={userId}
                onChange={(e) => {
                  const selectedUser = users.find(
                    (u) => u.id === e.target.value,
                  );
                  setUserId(e.target.value);
                  setCustomerName(selectedUser ? selectedUser.username : "");
                  setCustomerEmail(selectedUser ? selectedUser.email : "");
                }}
                className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 bg-white"
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
            </div>
          )}
          {type === OrderType.PURCHASE && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Nhà cung cấp
              </label>
              <input
                type="text"
                value={supplier}
                onChange={(e) => setSupplier(e.target.value)}
                placeholder="VD: Taobao, 1688..."
                className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
              />
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Ngày đặt hàng
            </label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
            />
          </div>
          {type === OrderType.PURCHASE && (
            <>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Loại tiền
                </label>
                <select
                  value={currency}
                  onChange={(e) => {
                    const newCurrency = e.target.value;
                    setCurrency(newCurrency);
                    if (newCurrency === "VND") setExchangeRate(1);
                  }}
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
                    onChange={(e) => {
                      const val = e.target.value;
                      setExchangeRate(val);
                      if (val === "") return;
                      
                      const newRate = parseNumber(val);
                      if (newRate > 0) {
                        // Update all items' VND prices based on new rate
                        setItems(prevItems => prevItems.map(item => ({
                          ...item,
                          expectedPrice: Math.round((item.foreignExpectedPrice || 0) * newRate),
                          actualPrice: Math.round((item.foreignActualPrice || 0) * newRate)
                        })));
                      }
                    }}
                    onBlur={() => {
                      if (exchangeRate) {
                        const num = parseNumber(exchangeRate);
                        setExchangeRate(new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 4 }).format(num));
                      }
                    }}
                    className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  />
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between bg-slate-50/50 gap-4">
          <h2 className="text-lg font-bold text-slate-800">
            Danh sách sản phẩm ({items.length})
          </h2>
          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={() => searchInputRef.current?.focus()}
              className="px-3 py-2 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-lg flex items-center gap-2 text-sm font-medium transition-colors border border-emerald-200"
              title="Sử dụng súng bắn mã vạch: Tự động thêm hoặc cộng dồn số lượng"
            >
              <Barcode className="w-4 h-4" />
              Chế độ quét mã
            </button>
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Tìm mã hoặc tên sản phẩm..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setShowSuggestions(true);
                }}
                onFocus={() => setShowSuggestions(true)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    if (productSuggestions.length > 0) {
                      handleSelectProduct(productSuggestions[0]);
                    } else if (
                      filteredItems.length === 0 &&
                      searchTerm.trim() !== ""
                    ) {
                      // Automatically add new item if not found
                      const newItem: OrderItem = {
                        id: crypto.randomUUID(),
                        name: searchTerm.trim(),
                        productName: "",
                        orderedQty: 1,
                        expectedPrice: 0,
                        receivedQty: 0,
                        actualPrice: 0,
                        totalReceivedCost: 0,
                      };
                      setItems([...items, newItem]);
                      setSearchTerm("");
                      setShowSuggestions(false);
                    } else if (filteredItems.length === 1) {
                      // If exactly one item matches, increment quantity
                      const matchedItem = filteredItems[0];
                      const updatedItems = items.map((i) =>
                        i.id === matchedItem.id
                          ? { ...i, orderedQty: i.orderedQty + 1 }
                          : i,
                      );
                      setItems(updatedItems);
                      setSearchTerm("");
                      setShowSuggestions(false);
                    }
                  }
                }}
                className="w-full pl-9 pr-4 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
              />

              {showSuggestions && productSuggestions.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg z-50 overflow-hidden">
                  {productSuggestions.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => handleSelectProduct(p)}
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
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              accept=".xlsx, .xls, .csv"
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isMapping}
              className="px-3 py-2 text-blue-600 bg-blue-50 hover:bg-blue-100 text-sm font-medium rounded-lg flex items-center gap-2 transition-colors disabled:opacity-50"
            >
              {isMapping ? (
                <div className="w-4 h-4 border-2 border-slate-300 border-t-blue-600 rounded-full animate-spin" />
              ) : (
                <Upload className="w-4 h-4" />
              )}
              Import Excel
            </button>
            <button
              onClick={() => setShowPasteArea(!showPasteArea)}
              className="px-3 py-2 text-emerald-600 bg-emerald-50 hover:bg-emerald-100 text-sm font-medium rounded-lg flex items-center gap-2 transition-colors"
            >
              <FileSpreadsheet className="w-4 h-4" />
              Paste từ Excel
            </button>
            <button
              onClick={handleAddItem}
              className="px-3 py-2 text-slate-700 bg-slate-100 hover:bg-slate-200 text-sm font-medium rounded-lg flex items-center gap-2 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Thêm thủ công
            </button>
          </div>
        </div>

        {showPasteArea && (
          <div className="p-6 bg-slate-50 border-b border-slate-100">
            <div className="flex items-start gap-3 mb-3">
              <AlertCircle className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
              <div className="text-sm text-slate-600">
                <p className="font-medium text-slate-800 mb-1">
                  Hướng dẫn dán dữ liệu từ Excel/Google Sheets:
                </p>
                <p>
                  Copy các cột theo thứ tự: <strong>Mã sản phẩm</strong> |{" "}
                  <strong>Tên sản phẩm (tùy chọn)</strong> |{" "}
                  <strong>Số lượng</strong> |{" "}
                  <strong>Giá dự kiến (tùy chọn)</strong>
                </p>
              </div>
            </div>
            <textarea
              value={pasteData}
              onChange={(e) => setPasteData(e.target.value)}
              onPaste={(e) => {
                const text = e.clipboardData.getData("text");
                if (text) {
                  e.preventDefault();
                  handleParsePaste(text);
                }
              }}
              placeholder="Dán dữ liệu vào đây..."
              className="w-full h-32 p-4 text-sm font-mono border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 mb-3"
            />
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowPasteArea(false)}
                className="px-4 py-2 text-slate-600 font-medium hover:bg-slate-200 rounded-lg transition-colors"
              >
                Hủy
              </button>
              <button
                onClick={() => handleParsePaste()}
                className="px-4 py-2 bg-slate-800 text-white font-medium hover:bg-slate-900 rounded-lg transition-colors"
              >
                Xử lý dữ liệu
              </button>
            </div>
          </div>
        )}

        {items.length === 0 && !showPasteArea ? (
          <div className="p-12 text-center text-slate-500">
            Chưa có sản phẩm nào. Hãy thêm thủ công hoặc paste từ Excel.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 text-xs uppercase tracking-wider font-semibold">
                  <th className="px-6 py-4 w-1/4">Mã sản phẩm</th>
                  <th className="px-6 py-4 w-1/4">Tên sản phẩm</th>
                  <th className="px-6 py-4 w-1/6">Số lượng đặt</th>
                  {currency !== "VND" && (
                    <th className="px-6 py-4 w-1/6">Đơn giá ({currency})</th>
                  )}
                  <th className="px-6 py-4 w-1/6">Đơn giá (VND)</th>
                  <th className="px-6 py-4 w-16"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredItems.map((item, index) => (
                  <tr
                    key={item.id}
                    className="hover:bg-slate-50/50 transition-colors"
                  >
                    <td className="px-6 py-3">
                      <input
                        type="text"
                        value={item.name}
                        onChange={(e) =>
                          handleUpdateItem(item.id, "name", e.target.value)
                        }
                        placeholder="Nhập mã SP..."
                        className="w-full px-3 py-1.5 border border-transparent hover:border-slate-200 focus:border-emerald-500 rounded focus:outline-none focus:ring-1 focus:ring-emerald-500 bg-transparent transition-all"
                      />
                    </td>
                    <td className="px-6 py-3">
                      <input
                        type="text"
                        value={item.productName || ""}
                        onChange={(e) =>
                          handleUpdateItem(
                            item.id,
                            "productName",
                            e.target.value,
                          )
                        }
                        placeholder="Nhập tên SP..."
                        className="w-full px-3 py-1.5 border border-transparent hover:border-slate-200 focus:border-emerald-500 rounded focus:outline-none focus:ring-1 focus:ring-emerald-500 bg-transparent transition-all"
                      />
                    </td>
                    <td className="px-6 py-3">
                      <input
                        type="text"
                        value={item.orderedQty === 0 ? "0" : item.orderedQty}
                        onChange={(e) => {
                          let val = e.target.value.replace(/[^0-9]/g, "");
                          val = val.replace(/^0+(?=\d)/, "");
                          handleUpdateItem(
                            item.id,
                            "orderedQty",
                            val === "" ? 0 : parseInt(val, 10),
                          );
                        }}
                        onFocus={(e) => {
                          if (e.target.value === "0") {
                            e.target.select();
                          }
                        }}
                        className="w-full px-3 py-1.5 border border-transparent hover:border-slate-200 focus:border-emerald-500 rounded focus:outline-none focus:ring-1 focus:ring-emerald-500 bg-transparent transition-all text-right"
                      />
                    </td>
                    {currency !== "VND" && (
                      <td className="px-6 py-3">
                        <input
                          type="text"
                          value={item.foreignExpectedPrice === 0 ? "0" : item.foreignExpectedPrice || "0"}
                          onChange={(e) => {
                            let val = e.target.value.replace(/[^0-9.]/g, "");
                            const parts = val.split(".");
                            if (parts.length > 2) {
                              val = parts[0] + "." + parts.slice(1).join("");
                            }
                            val = val.replace(/^0+(?=\d)/, "");
                            const numVal = val === "" ? 0 : parseFloat(val);
                            const numRate = Number(exchangeRate) || 1;
                            const vndVal = Math.round(numVal * numRate);
                            setItems(prev => prev.map(i => i.id === item.id ? {
                              ...i,
                              foreignExpectedPrice: numVal,
                              foreignActualPrice: numVal,
                              expectedPrice: vndVal,
                              actualPrice: vndVal
                            } : i));
                          }}
                          onFocus={(e) => {
                            if (e.target.value === "0") {
                              e.target.select();
                            }
                          }}
                          className="w-full px-3 py-1.5 border border-transparent hover:border-slate-200 focus:border-emerald-500 rounded focus:outline-none focus:ring-1 focus:ring-emerald-500 bg-transparent transition-all text-right font-medium text-blue-600"
                        />
                      </td>
                    )}
                    <td className="px-6 py-3">
                      <input
                        type="text"
                        value={item.expectedPrice === 0 ? "0" : item.expectedPrice}
                        onChange={(e) => {
                          let val = e.target.value.replace(/[^0-9]/g, "");
                          val = val.replace(/^0+(?=\d)/, "");
                          const numVal = val === "" ? 0 : parseInt(val, 10);
                          handleUpdateItem(item.id, "expectedPrice", numVal);
                          handleUpdateItem(item.id, "actualPrice", numVal); // Sync actual price initially
                          const numRate = Number(exchangeRate) || 0;
                          if (currency !== "VND" && numRate > 0) {
                            handleUpdateItem(item.id, "foreignExpectedPrice", numVal / numRate);
                            handleUpdateItem(item.id, "foreignActualPrice", numVal / numRate);
                          }
                        }}
                        onFocus={(e) => {
                          if (e.target.value === "0") {
                            e.target.select();
                          }
                        }}
                        className="w-full px-3 py-1.5 border border-transparent hover:border-slate-200 focus:border-emerald-500 rounded focus:outline-none focus:ring-1 focus:ring-emerald-500 bg-transparent transition-all text-right"
                      />
                    </td>
                    <td className="px-6 py-3 text-center">
                      <button
                        onClick={() => handleRemoveItem(item.id)}
                        className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
