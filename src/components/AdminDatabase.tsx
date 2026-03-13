import React, { useState, useMemo } from "react";
import { Order } from "../types";
import { formatCurrency, formatNumber } from "../utils";
import {
  Search,
  Download,
  Database,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Filter,
  X,
  Trash2,
  CheckSquare,
  Square,
} from "lucide-react";
import * as XLSX from "xlsx";
import { recalculateOrder } from "../orderUtils";

type SortField =
  | "customerName"
  | "orderName"
  | "orderDate"
  | "name"
  | "productName"
  | "orderedQty"
  | "receivedQty"
  | "missingQty"
  | "expectedPrice"
  | "actualPrice"
  | "expectedTotal"
  | "actualTotal";
type SortDirection = "asc" | "desc";

interface AdminDatabaseProps {
  orders: Order[];
  onUpdateOrder: (order: Order) => Promise<void>;
}

export function AdminDatabase({ orders, onUpdateOrder }: AdminDatabaseProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [sortField, setSortField] = useState<SortField>("orderDate");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  const [selectedNames, setSelectedNames] = useState<Set<string>>(new Set());
  const [showFilters, setShowFilters] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [minQty, setMinQty] = useState("");
  const [maxQty, setMaxQty] = useState("");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "all" | "missing" | "completed" | "over_received"
  >("all");

  const allItems = useMemo(() => {
    const flatItems = orders.flatMap((order) =>
      order.items.map((item) => ({
        ...item,
        orderName: order.name,
        customerName: order.customerName || "Khách lẻ",
        orderDate: order.date,
        supplier: order.supplier,
      })),
    );

    const groupedItems = new Map<string, (typeof flatItems)[0]>();

    flatItems.forEach((item) => {
      const key = String(item.name).toLowerCase();
      if (groupedItems.has(key)) {
        const existing = groupedItems.get(key)!;

        const customers = new Set(existing.customerName.split(", "));
        customers.add(item.customerName);

        const orderNames = new Set(existing.orderName.split(", "));
        orderNames.add(item.orderName);

        const suppliers = new Set(
          existing.supplier ? existing.supplier.split(", ") : [],
        );
        if (item.supplier) suppliers.add(item.supplier);

        groupedItems.set(key, {
          ...existing,
          orderedQty: existing.orderedQty + item.orderedQty,
          receivedQty: existing.receivedQty + item.receivedQty,
          totalReceivedCost:
            (existing.totalReceivedCost || 0) + (item.totalReceivedCost || 0),
          customerName: Array.from(customers).join(", "),
          orderName: Array.from(orderNames).join(", "),
          supplier: Array.from(suppliers).join(", "),
          productName: existing.productName || item.productName,
        });
      } else {
        groupedItems.set(key, { ...item });
      }
    });

    return Array.from(groupedItems.values());
  }, [orders]);

  const sortedAndFilteredItems = useMemo(() => {
    let result = allItems.filter((item) => {
      const term = searchTerm.toLowerCase();
      const matchesSearch =
        String(item.name).toLowerCase().includes(term) ||
        (item.productName &&
          String(item.productName).toLowerCase().includes(term)) ||
        String(item.customerName).toLowerCase().includes(term) ||
        String(item.orderName).toLowerCase().includes(term) ||
        String(item.supplier).toLowerCase().includes(term);

      if (!matchesSearch) return false;

      if (dateFrom && new Date(item.orderDate) < new Date(dateFrom))
        return false;
      if (dateTo && new Date(item.orderDate) > new Date(dateTo + "T23:59:59"))
        return false;

      if (minQty && item.orderedQty < parseInt(minQty)) return false;
      if (maxQty && item.orderedQty > parseInt(maxQty)) return false;

      const avgPrice =
        item.receivedQty > 0
          ? (item.totalReceivedCost ?? item.receivedQty * item.actualPrice) /
            item.receivedQty
          : item.actualPrice;
      if (minPrice && avgPrice < parseFloat(minPrice)) return false;
      if (maxPrice && avgPrice > parseFloat(maxPrice)) return false;

      const missingQty = Math.max(0, item.orderedQty - item.receivedQty);
      const isCompleted = item.receivedQty >= item.orderedQty;
      const isOverReceived = item.receivedQty > item.orderedQty;

      if (statusFilter === "missing" && missingQty === 0) return false;
      if (statusFilter === "completed" && !isCompleted) return false;
      if (statusFilter === "over_received" && !isOverReceived) return false;

      return true;
    });

    result.sort((a, b) => {
      let aValue: any = a[sortField as keyof typeof a];
      let bValue: any = b[sortField as keyof typeof b];

      if (sortField === "missingQty") {
        aValue = Math.max(0, a.orderedQty - a.receivedQty);
        bValue = Math.max(0, b.orderedQty - b.receivedQty);
      } else if (sortField === "actualPrice") {
        aValue =
          a.receivedQty > 0
            ? (a.totalReceivedCost ?? a.receivedQty * a.actualPrice) /
              a.receivedQty
            : a.actualPrice;
        bValue =
          b.receivedQty > 0
            ? (b.totalReceivedCost ?? b.receivedQty * b.actualPrice) /
              b.receivedQty
            : b.actualPrice;
      } else if (sortField === "expectedTotal") {
        aValue = a.orderedQty * a.expectedPrice;
        bValue = b.orderedQty * b.expectedPrice;
      } else if (sortField === "actualTotal") {
        aValue = a.totalReceivedCost ?? a.receivedQty * a.actualPrice;
        bValue = b.totalReceivedCost ?? b.receivedQty * b.actualPrice;
      }

      if (aValue < bValue) return sortDirection === "asc" ? -1 : 1;
      if (aValue > bValue) return sortDirection === "asc" ? 1 : -1;
      return 0;
    });

    return result;
  }, [
    allItems,
    searchTerm,
    sortField,
    sortDirection,
    dateFrom,
    dateTo,
    minQty,
    maxQty,
    minPrice,
    maxPrice,
    statusFilter,
  ]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  const toggleSelectAll = () => {
    if (selectedNames.size === sortedAndFilteredItems.length) {
      setSelectedNames(new Set());
    } else {
      setSelectedNames(new Set(sortedAndFilteredItems.map((item) => item.name)));
    }
  };

  const toggleSelectItem = (name: string) => {
    const newSelected = new Set(selectedNames);
    if (newSelected.has(name)) {
      newSelected.delete(name);
    } else {
      newSelected.add(name);
    }
    setSelectedNames(newSelected);
  };

  const handleBulkDelete = async () => {
    if (selectedNames.size === 0) return;
    if (
      !window.confirm(
        `Bạn có chắc chắn muốn xóa ${selectedNames.size} sản phẩm này khỏi tất cả đơn hàng?`,
      )
    )
      return;

    try {
      const ordersToUpdate = orders.filter((order) =>
        order.items.some((item) => selectedNames.has(item.name)),
      );

      for (const order of ordersToUpdate) {
        const updatedItems = order.items.filter(
          (item) => !selectedNames.has(item.name),
        );
        const updatedOrder = recalculateOrder({
          ...order,
          items: updatedItems,
        });
        await onUpdateOrder(updatedOrder);
      }

      setSelectedNames(new Set());
      alert("Đã xóa các mục đã chọn thành công.");
    } catch (error) {
      console.error("Error bulk deleting:", error);
      alert("Có lỗi xảy ra khi xóa hàng loạt.");
    }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field)
      return <ArrowUpDown className="w-4 h-4 text-slate-300" />;
    return sortDirection === "asc" ? (
      <ArrowUp className="w-4 h-4 text-rose-500" />
    ) : (
      <ArrowDown className="w-4 h-4 text-rose-500" />
    );
  };

  const handleExportExcel = () => {
    const itemsToExport =
      selectedNames.size > 0
        ? sortedAndFilteredItems.filter((item) => selectedNames.has(item.name))
        : sortedAndFilteredItems;

    const exportData = itemsToExport.map((item, index) => ({
      STT: index + 1,
      "Khách hàng": item.customerName,
      "Tên danh sách (Đơn hàng)": item.orderName,
      "Nhà cung cấp": item.supplier,
      "Ngày tạo": new Date(item.orderDate).toLocaleDateString("vi-VN"),
      "Mã sản phẩm": item.name,
      "Tên sản phẩm": item.productName || "",
      "Số lượng đặt": item.orderedQty,
      "Số lượng đã về": item.receivedQty,
      "Còn thiếu": Math.max(0, item.orderedQty - item.receivedQty),
      "Giá dự kiến": item.expectedPrice,
      "Giá thực tế (TB)":
        item.receivedQty > 0
          ? (item.totalReceivedCost ?? item.receivedQty * item.actualPrice) /
            item.receivedQty
          : item.actualPrice,
      "Thành tiền dự kiến": item.orderedQty * item.expectedPrice,
      "Thành tiền thực tế":
        item.totalReceivedCost ?? item.receivedQty * item.actualPrice,
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Database");
    XLSX.writeFile(
      wb,
      `Admin_Database_${new Date().toISOString().split("T")[0]}.xlsx`,
    );
  };

  return (
    <div className="p-8 max-w-7xl mx-auto h-full flex flex-col">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Database className="w-6 h-6 text-rose-500" />
            Database Tổng Hợp
          </h1>
          <p className="text-slate-500 mt-1">
            Quản lý toàn bộ dữ liệu nhập hàng từ tất cả khách hàng
          </p>
        </div>
        <div className="flex items-center gap-3">
          {selectedNames.size > 0 && (
            <button
              onClick={handleBulkDelete}
              className="bg-rose-600 hover:bg-rose-700 text-white px-4 py-2 rounded-xl font-medium flex items-center gap-2 transition-all shadow-sm shadow-rose-600/20"
            >
              <Trash2 className="w-4 h-4" />
              Xóa ({selectedNames.size})
            </button>
          )}
          <button
            onClick={handleExportExcel}
            className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl font-medium flex items-center gap-2 transition-all shadow-sm shadow-emerald-600/20"
          >
            <Download className="w-4 h-4" />
            {selectedNames.size > 0
              ? `Xuất Excel (${selectedNames.size})`
              : "Xuất Excel Tổng"}
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 flex-1 flex flex-col overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex flex-col gap-4 bg-slate-50/50">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3 w-full sm:w-auto">
              <div className="relative flex-1 sm:w-96">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Tìm theo khách hàng, mã SP, tên list..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 transition-all"
                />
              </div>
              <button
                onClick={() => setShowFilters(!showFilters)}
                className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border transition-colors ${
                  showFilters ||
                  dateFrom ||
                  dateTo ||
                  minQty ||
                  maxQty ||
                  minPrice ||
                  maxPrice ||
                  statusFilter !== "all"
                    ? "bg-rose-50 text-rose-700 border-rose-200"
                    : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                }`}
              >
                <Filter className="w-4 h-4" />
                Bộ lọc
              </button>
            </div>
            <div className="text-sm text-slate-500 font-medium">
              Tổng số dòng dữ liệu: {sortedAndFilteredItems.length}
            </div>
          </div>

          {showFilters && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 p-4 bg-white rounded-xl border border-slate-200 mt-2">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">
                  Thời gian tạo
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500"
                  />
                  <span className="text-slate-400">-</span>
                  <input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">
                  Số lượng đặt
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    placeholder="Từ"
                    value={minQty}
                    onChange={(e) => setMinQty(e.target.value)}
                    className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500"
                  />
                  <span className="text-slate-400">-</span>
                  <input
                    type="number"
                    placeholder="Đến"
                    value={maxQty}
                    onChange={(e) => setMaxQty(e.target.value)}
                    className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">
                  Giá thực tế (VND)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    placeholder="Từ"
                    value={minPrice}
                    onChange={(e) => setMinPrice(e.target.value)}
                    className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500"
                  />
                  <span className="text-slate-400">-</span>
                  <input
                    type="number"
                    placeholder="Đến"
                    value={maxPrice}
                    onChange={(e) => setMaxPrice(e.target.value)}
                    className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">
                  Trạng thái giao hàng
                </label>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as any)}
                  className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 bg-white"
                >
                  <option value="all">Tất cả</option>
                  <option value="missing">Còn thiếu</option>
                  <option value="completed">Đã đủ</option>
                  <option value="over_received">Dư hàng</option>
                </select>
              </div>
              <div className="col-span-1 sm:col-span-2 lg:col-span-4 flex justify-end">
                <button
                  onClick={() => {
                    setDateFrom("");
                    setDateTo("");
                    setMinQty("");
                    setMaxQty("");
                    setMinPrice("");
                    setMaxPrice("");
                    setStatusFilter("all");
                  }}
                  className="text-sm text-slate-500 hover:text-slate-700 flex items-center gap-1"
                >
                  <X className="w-4 h-4" /> Xóa bộ lọc
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="overflow-auto flex-1">
          <table className="w-full text-left border-collapse min-w-[1400px]">
            <thead className="sticky top-0 bg-slate-50 z-10 shadow-sm">
              <tr className="border-b border-slate-200 text-slate-500 text-xs uppercase tracking-wider font-semibold">
                <th className="px-6 py-4 w-10">
                  <button
                    onClick={toggleSelectAll}
                    className="text-slate-400 hover:text-rose-500 transition-colors"
                  >
                    {selectedNames.size === sortedAndFilteredItems.length &&
                    sortedAndFilteredItems.length > 0 ? (
                      <CheckSquare className="w-5 h-5 text-rose-500" />
                    ) : (
                      <Square className="w-5 h-5" />
                    )}
                  </button>
                </th>
                <th
                  className="px-6 py-4 cursor-pointer hover:bg-slate-100 transition-colors"
                  onClick={() => handleSort("customerName")}
                >
                  <div className="flex items-center gap-1">
                    Khách hàng <SortIcon field="customerName" />
                  </div>
                </th>
                <th
                  className="px-6 py-4 cursor-pointer hover:bg-slate-100 transition-colors"
                  onClick={() => handleSort("orderName")}
                >
                  <div className="flex items-center gap-1">
                    Tên List (Đơn hàng) <SortIcon field="orderName" />
                  </div>
                </th>
                <th
                  className="px-6 py-4 cursor-pointer hover:bg-slate-100 transition-colors"
                  onClick={() => handleSort("orderDate")}
                >
                  <div className="flex items-center gap-1">
                    Ngày tạo <SortIcon field="orderDate" />
                  </div>
                </th>
                <th
                  className="px-6 py-4 cursor-pointer hover:bg-slate-100 transition-colors"
                  onClick={() => handleSort("name")}
                >
                  <div className="flex items-center gap-1">
                    Mã sản phẩm <SortIcon field="name" />
                  </div>
                </th>
                <th
                  className="px-6 py-4 cursor-pointer hover:bg-slate-100 transition-colors"
                  onClick={() => handleSort("productName")}
                >
                  <div className="flex items-center gap-1">
                    Tên sản phẩm <SortIcon field="productName" />
                  </div>
                </th>
                <th
                  className="px-6 py-4 text-right cursor-pointer hover:bg-slate-100 transition-colors"
                  onClick={() => handleSort("orderedQty")}
                >
                  <div className="flex items-center justify-end gap-1">
                    Số lượng đặt <SortIcon field="orderedQty" />
                  </div>
                </th>
                <th
                  className="px-6 py-4 text-right cursor-pointer hover:bg-slate-100 transition-colors"
                  onClick={() => handleSort("receivedQty")}
                >
                  <div className="flex items-center justify-end gap-1">
                    Số lượng đã về <SortIcon field="receivedQty" />
                  </div>
                </th>
                <th
                  className="px-6 py-4 text-right cursor-pointer hover:bg-slate-100 transition-colors"
                  onClick={() => handleSort("missingQty")}
                >
                  <div className="flex items-center justify-end gap-1">
                    Còn thiếu <SortIcon field="missingQty" />
                  </div>
                </th>
                <th
                  className="px-6 py-4 text-right cursor-pointer hover:bg-slate-100 transition-colors"
                  onClick={() => handleSort("expectedPrice")}
                >
                  <div className="flex items-center justify-end gap-1">
                    Giá dự kiến <SortIcon field="expectedPrice" />
                  </div>
                </th>
                <th
                  className="px-6 py-4 text-right cursor-pointer hover:bg-slate-100 transition-colors"
                  onClick={() => handleSort("actualPrice")}
                >
                  <div className="flex items-center justify-end gap-1">
                    Giá thực tế <SortIcon field="actualPrice" />
                  </div>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sortedAndFilteredItems.map((item, index) => {
                const avgPrice =
                  item.receivedQty > 0
                    ? (item.totalReceivedCost ??
                        item.receivedQty * item.actualPrice) / item.receivedQty
                    : item.actualPrice;
                const isSelected = selectedNames.has(item.name);
                return (
                  <tr
                    key={`${item.id}-${index}`}
                    className={`hover:bg-slate-50/50 transition-colors ${isSelected ? "bg-rose-50/30" : ""}`}
                  >
                    <td className="px-6 py-4">
                      <button
                        onClick={() => toggleSelectItem(item.name)}
                        className="text-slate-400 hover:text-rose-500 transition-colors"
                      >
                        {isSelected ? (
                          <CheckSquare className="w-5 h-5 text-rose-500" />
                        ) : (
                          <Square className="w-5 h-5" />
                        )}
                      </button>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-wrap gap-1">
                        {item.customerName.split(", ").map((customer, idx) => (
                          <span
                            key={idx}
                            className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800"
                          >
                            {customer}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-wrap gap-1">
                        {item.orderName.split(", ").map((orderName, idx) => (
                          <span
                            key={idx}
                            className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-700"
                          >
                            {orderName}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-500">
                      {new Date(item.orderDate).toLocaleDateString("vi-VN")}
                    </td>
                    <td className="px-6 py-4 font-mono text-sm text-slate-600">
                      {item.name}
                    </td>
                    <td className="px-6 py-4 text-slate-600">
                      {item.productName || "-"}
                    </td>
                    <td className="px-6 py-4 text-right font-medium text-slate-700">
                      {formatNumber(item.orderedQty)}
                    </td>
                    <td className="px-6 py-4 text-right font-medium text-emerald-600">
                      {formatNumber(item.receivedQty)}
                    </td>
                    <td className="px-6 py-4 text-right font-medium text-rose-600">
                      {formatNumber(
                        Math.max(0, item.orderedQty - item.receivedQty),
                      )}
                    </td>
                    <td className="px-6 py-4 text-right text-slate-600">
                      {formatCurrency(item.expectedPrice)}
                    </td>
                    <td className="px-6 py-4 text-right text-slate-600">
                      {formatCurrency(avgPrice)}
                    </td>
                  </tr>
                );
              })}
              {sortedAndFilteredItems.length === 0 && (
                <tr>
                  <td
                    colSpan={10}
                    className="px-6 py-12 text-center text-slate-500"
                  >
                    Không tìm thấy dữ liệu phù hợp
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
