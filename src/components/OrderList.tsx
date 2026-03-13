import React, { useState } from "react";
import { Order, OrderStatus, OrderType, PaymentStatus } from "../types";
import { formatCurrency, formatNumber, formatPaymentStatus } from "../utils";
import { ConfirmModal } from "./ConfirmModal";
import { Pagination } from "./Pagination";
import { useAuth } from "../store";
import {
  Plus,
  Search,
  ChevronRight,
  ChevronLeft,
  AlertCircle,
  CheckCircle2,
  Clock,
  FileText,
  Trash2,
  AlertTriangle,
  Building2,
  Users,
} from "lucide-react";

interface OrderListProps {
  orders: Order[];
  onViewOrder: (id: string) => void;
  onCreateOrder: () => void;
  onDeleteOrder: (id: string) => Promise<void> | void;
}

export function OrderList({
  orders: propOrders,
  onViewOrder,
  onCreateOrder,
  onDeleteOrder,
}: OrderListProps) {
  // Filter out invalid items (orderedQty <= 0 and receivedQty <= 0) from old files
  const orders = propOrders.map((order) => ({
    ...order,
    items: order.items.filter(
      (item) => item.orderedQty > 0 || item.receivedQty > 0
    ),
  }));

  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(50);
  const [activeTab, setActiveTab] = useState<OrderType>(OrderType.SALES);
  const [orderToDelete, setOrderToDelete] = useState<{
    id: string;
    name: string;
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

  const filteredOrders = orders.filter((order) => {
    const term = searchQuery.toLowerCase();
    return (
      (order.type === activeTab || (!order.type && activeTab === OrderType.SALES)) &&
      (String(order.name).toLowerCase().includes(term) ||
      (order.supplier && String(order.supplier).toLowerCase().includes(term)) ||
      (order.customerName &&
        String(order.customerName).toLowerCase().includes(term)))
    );
  });

  const totalPages = Math.ceil(filteredOrders.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedOrders = filteredOrders.slice(
    startIndex,
    startIndex + itemsPerPage,
  );

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
    setCurrentPage(1);
  };

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">
            Quản lý Đơn hàng
          </h1>
          <p className="text-slate-500 mt-1">
            Theo dõi tiến độ nhập hàng và giao hàng
          </p>
        </div>
        <button
          onClick={onCreateOrder}
          className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-xl font-medium flex items-center gap-2 transition-all shadow-sm shadow-emerald-600/20"
        >
          <Plus className="w-5 h-5" />
          Tạo Đơn Mới
        </button>
      </div>


      {isAdmin && (
        <div className="flex gap-4 mb-6 border-b border-slate-200">
          <button
            onClick={() => setActiveTab(OrderType.SALES)}
            className={`pb-3 px-2 font-medium text-sm flex items-center gap-2 transition-colors relative ${
              activeTab === OrderType.SALES
                ? "text-emerald-600"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            <Users className="w-4 h-4" />
            Đơn bán hàng (Khách hàng)
            {activeTab === OrderType.SALES && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-emerald-600 rounded-t-full" />
            )}
          </button>
          <button
            onClick={() => setActiveTab(OrderType.PURCHASE)}
            className={`pb-3 px-2 font-medium text-sm flex items-center gap-2 transition-colors relative ${
              activeTab === OrderType.PURCHASE
                ? "text-emerald-600"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            <Building2 className="w-4 h-4" />
            Đơn mua hàng (NCC)
            {activeTab === OrderType.PURCHASE && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-emerald-600 rounded-t-full" />
            )}
          </button>
        </div>
      )}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center gap-4 bg-slate-50/50">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              type="text"
              placeholder="Tìm kiếm đơn hàng, nhà cung cấp..."
              value={searchQuery}
              onChange={handleSearchChange}
              className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
            />
          </div>
        </div>

        {filteredOrders.length === 0 ? (
          <div className="p-12 text-center flex flex-col items-center justify-center">
            <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4">
              <FileText className="w-8 h-8 text-slate-400" />
            </div>
            <h3 className="text-lg font-medium text-slate-900">
              {searchQuery
                ? "Không tìm thấy đơn hàng nào"
                : "Chưa có đơn hàng nào"}
            </h3>
            <p className="text-slate-500 mt-1 mb-6">
              {searchQuery
                ? "Thử thay đổi từ khóa tìm kiếm."
                : "Bắt đầu bằng cách tạo một đơn hàng mới từ danh sách của bạn."}
            </p>
            {!searchQuery && (
              <button
                onClick={onCreateOrder}
                className="text-emerald-600 font-medium hover:text-emerald-700 flex items-center gap-1"
              >
                Tạo đơn đầu tiên <ChevronRight className="w-4 h-4" />
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 text-xs uppercase tracking-wider font-semibold">
                  <th className="px-6 py-4 whitespace-nowrap">Tên đơn hàng</th>
                  <th className="px-6 py-4 whitespace-nowrap">{activeTab === OrderType.SALES ? "Khách hàng" : "Nhà cung cấp"}</th>
                  <th className="px-6 py-4 whitespace-nowrap">Trạng thái</th>
                  <th className="px-6 py-4 whitespace-nowrap">Thanh toán</th>
                  <th className="px-6 py-4 whitespace-nowrap">Ngày đặt</th>
                  <th className="px-6 py-4 text-right whitespace-nowrap">
                    Tổng sản phẩm
                  </th>
                  <th className="px-6 py-4 whitespace-nowrap">Tiến độ</th>
                  <th className="px-6 py-4 whitespace-nowrap">Cảnh báo</th>
                  <th className="px-6 py-4 text-right whitespace-nowrap">
                    Thao tác
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paginatedOrders.map((order) => {
                  const totalOrdered = order.items.reduce(
                    (sum, item) => sum + item.orderedQty,
                    0,
                  );
                  const totalReceived = order.items.reduce(
                    (sum, item) => sum + item.receivedQty,
                    0,
                  );
                  const progress =
                    totalOrdered > 0
                      ? Math.round((totalReceived / totalOrdered) * 100)
                      : 0;

                  const hasPriceIncrease = order.items.some((item) => {
                    const avgPrice =
                      item.receivedQty > 0
                        ? (item.totalReceivedCost ??
                            item.receivedQty * item.actualPrice) /
                          item.receivedQty
                        : item.actualPrice;
                    return (
                      avgPrice > item.expectedPrice ||
                      item.actualPrice > item.expectedPrice
                    );
                  });
                  const isCompleted = progress >= 100;
                  const hasMissingItems = progress > 0 && progress < 100;
                  const hasWarning = hasPriceIncrease || hasMissingItems;

                  return (
                    <tr
                      key={order.id}
                      onClick={() => onViewOrder(order.id)}
                      className={`transition-colors cursor-pointer group ${
                        hasWarning
                          ? "bg-rose-50/20 hover:bg-rose-50/50"
                          : "hover:bg-slate-50/80"
                      }`}
                    >
                      <td className="px-6 py-4">
                        <div className="font-medium text-slate-900">
                          {order.name}
                        </div>
                        <div className="text-sm text-slate-500 mt-0.5">
                          {order.supplier}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800">
                          {activeTab === OrderType.SALES ? (order.customerName || "Khách lẻ") : (order.supplier || "Chưa xác định")}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        {order.status === OrderStatus.COMPLETED ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700 border border-emerald-200">
                            <CheckCircle2 size={10} /> HOÀN TẤT
                          </span>
                        ) : order.status === OrderStatus.PARTIAL ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-700 border border-blue-200">
                            <Clock size={10} /> ĐANG VỀ (MỘT PHẦN)
                          </span>
                        ) : order.status === OrderStatus.PROCESSING ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-700 border border-indigo-200">
                            <Clock size={10} /> ĐANG XỬ LÝ
                          </span>
                        ) : order.status === OrderStatus.CANCELLED ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-200 text-slate-700 border border-slate-300">
                            <AlertTriangle size={10} /> ĐÃ HỦY
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                            <Clock size={10} /> CHỜ HÀNG
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col gap-1">
                          {order.paymentStatus === PaymentStatus.PAID ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700 border border-emerald-200 w-fit">
                              ĐÃ THANH TOÁN
                            </span>
                          ) : order.paymentStatus === PaymentStatus.PARTIAL ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700 border border-amber-200 w-fit">
                              MỘT PHẦN
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-700 border border-rose-200 w-fit">
                              CHƯA THANH TOÁN
                            </span>
                          )}
                          <div className="text-xs text-slate-500 font-medium">
                            {formatCurrency(order.paidAmount || 0)}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-slate-600">
                        {new Date(order.date).toLocaleDateString("vi-VN")}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="text-slate-900 font-medium">
                          {formatNumber(totalOrdered)}
                        </div>
                        <div className="text-xs text-slate-500 mt-0.5">
                          {order.items.length} mã SP
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden w-24">
                            <div
                              className={`h-full rounded-full ${isCompleted ? "bg-emerald-500" : "bg-blue-500"}`}
                              style={{ width: `${Math.min(progress, 100)}%` }}
                            />
                          </div>
                          <span
                            className={`text-sm font-medium ${isCompleted ? "text-emerald-600" : "text-slate-600"}`}
                          >
                            {progress}%
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col gap-1.5 items-start">
                          {hasPriceIncrease && (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-rose-50 text-rose-700 text-xs font-medium border border-rose-100">
                              <AlertCircle className="w-3.5 h-3.5" />
                              Có tăng giá
                            </span>
                          )}
                          {hasMissingItems && (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-orange-50 text-orange-700 text-xs font-medium border border-orange-100">
                              <AlertCircle className="w-3.5 h-3.5" />
                              Thiếu hàng
                            </span>
                          )}
                          {!hasPriceIncrease &&
                            !hasMissingItems &&
                            isCompleted && (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-50 text-emerald-700 text-xs font-medium border border-emerald-100">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                Ổn định
                              </span>
                            )}
                          {!hasPriceIncrease &&
                            !hasMissingItems &&
                            !isCompleted && (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-100 text-slate-600 text-xs font-medium border border-slate-200">
                                <Clock className="w-3.5 h-3.5" />
                                Đang chờ
                              </span>
                            )}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {canDeleteOrder(order) && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setOrderToDelete({
                                  id: order.id,
                                  name: order.name,
                                });
                              }}
                              className="text-slate-400 hover:text-rose-600 transition-colors p-2 hover:bg-rose-50 rounded-lg relative z-10"
                              title="Xóa đơn hàng"
                            >
                              <Trash2 className="w-5 h-5" />
                            </button>
                          )}
                          <button
                            type="button"
                            className="text-slate-400 group-hover:text-emerald-600 transition-colors p-2 hover:bg-emerald-50 rounded-lg relative z-10"
                          >
                            <ChevronRight className="w-5 h-5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Controls */}
        {filteredOrders.length > 0 && (
          <div className="p-4 border-t border-slate-100 bg-slate-50/30 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="text-sm text-slate-500">
                Hiển thị{" "}
                <span className="font-medium text-slate-700">
                  {startIndex + 1}
                </span>{" "}
                -{" "}
                <span className="font-medium text-slate-700">
                  {Math.min(startIndex + itemsPerPage, filteredOrders.length)}
                </span>{" "}
                trong tổng số{" "}
                <span className="font-medium text-slate-700">
                  {filteredOrders.length}
                </span>{" "}
                đơn hàng
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-slate-500">Số dòng:</span>
                <select
                  value={itemsPerPage}
                  onChange={(e) => {
                    setItemsPerPage(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                  className="text-sm border border-slate-200 rounded-lg px-2 py-1 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                >
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </div>
            </div>
            {totalPages > 1 && (
              <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                onPageChange={setCurrentPage}
              />
            )}
          </div>
        )}
      </div>

      <ConfirmModal
        isOpen={orderToDelete !== null}
        title="Xóa đơn hàng"
        message={`Bạn có chắc chắn muốn xóa đơn hàng "${orderToDelete?.name}"? Hành động này không thể hoàn tác.`}
        onConfirm={async () => {
          if (orderToDelete) {
            try {
              await onDeleteOrder(orderToDelete.id);
              setOrderToDelete(null);
            } catch (err) {
              alert("Có lỗi khi xóa đơn hàng. Vui lòng thử lại.");
            }
          }
        }}
        onCancel={() => setOrderToDelete(null)}
      />
    </div>
  );
}
