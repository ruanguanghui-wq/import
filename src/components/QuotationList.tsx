import React, { useState } from "react";
import { Quotation, QuotationStatus, QuotationType } from "../types";
import {
  Search,
  Plus,
  FileText,
  ChevronRight,
  Clock,
  CheckCircle,
  XCircle,
  Send,
  Eye,
  Trash2,
  ChevronLeft,
  Building2,
  Users,
} from "lucide-react";
import { useAuth } from "../store";
import { ConfirmModal } from "./ConfirmModal";
import { Pagination } from "./Pagination";

interface QuotationListProps {
  quotations: Quotation[];
  onSelectQuotation: (quotation: Quotation) => void;
  onCreateQuotation: (type: QuotationType) => void;
  onDeleteQuotation: (id: string) => Promise<void>;
}

const ITEMS_PER_PAGE = 50;

export function QuotationList({
  quotations,
  onSelectQuotation,
  onCreateQuotation,
  onDeleteQuotation,
}: QuotationListProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<QuotationType>(QuotationType.CUSTOMER);
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const quotationToDelete = quotations.find((q) => q.id === deletingId);

  const filteredQuotations = quotations.filter(
    (q) =>
      (q.type === activeTab || (!q.type && activeTab === QuotationType.CUSTOMER)) &&
      (q.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (q.customerName && q.customerName.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (q.supplierName && q.supplierName.toLowerCase().includes(searchTerm.toLowerCase()))),
  );

  const totalPages = Math.ceil(filteredQuotations.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const paginatedQuotations = filteredQuotations.slice(
    startIndex,
    startIndex + ITEMS_PER_PAGE,
  );

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
    setCurrentPage(1); // Reset to first page on search
  };

  const getStatusBadge = (status: QuotationStatus) => {
    switch (status) {
      case QuotationStatus.DRAFT:
        return (
          <span className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-700">
            <Clock className="w-3 h-3" /> Nháp
          </span>
        );
      case QuotationStatus.SENT:
        return (
          <span className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
            <Send className="w-3 h-3" /> Đã gửi
          </span>
        );
      case QuotationStatus.REVIEWING:
        return (
          <span className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
            <Eye className="w-3 h-3" /> Khách đang xem
          </span>
        );
      case QuotationStatus.APPROVED:
        return (
          <span className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">
            <CheckCircle className="w-3 h-3" /> Đã chốt (Thành đơn)
          </span>
        );
      case QuotationStatus.REJECTED:
        return (
          <span className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-rose-100 text-rose-700">
            <XCircle className="w-3 h-3" /> Đã hủy
          </span>
        );
      default:
        return null;
    }
  };

  const handleDeleteClick = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setDeletingId(id);
  };

  const handleConfirmDelete = async () => {
    if (!deletingId) return;
    try {
      await onDeleteQuotation(deletingId);
      setDeletingId(null);
    } catch (err) {
      console.error("Có lỗi khi xóa báo giá. Vui lòng thử lại.");
    }
  };

  const handleCancelDelete = () => {
    setDeletingId(null);
  };

  return (
    <div className="p-8 max-w-7xl mx-auto h-full flex flex-col">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <FileText className="w-6 h-6 text-indigo-500" />
            Quản lý Báo giá
          </h1>
          <p className="text-slate-500 mt-1">
            {isAdmin
              ? "Tạo và quản lý báo giá từ NCC và gửi cho khách hàng"
              : "Tạo yêu cầu báo giá gửi cho Admin và theo dõi phản hồi"}
          </p>
        </div>
        <button
          onClick={() => onCreateQuotation(activeTab)}
          className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl font-medium flex items-center gap-2 transition-all shadow-sm shadow-indigo-600/20"
        >
          <Plus className="w-4 h-4" />
          {isAdmin ? "Tạo báo giá mới" : "Tạo yêu cầu báo giá"}
        </button>
      </div>

      {isAdmin && (
        <div className="flex gap-4 mb-6 border-b border-slate-200">
          <button
            onClick={() => setActiveTab(QuotationType.CUSTOMER)}
            className={`pb-3 px-2 font-medium text-sm flex items-center gap-2 transition-colors relative ${
              activeTab === QuotationType.CUSTOMER
                ? "text-indigo-600"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            <Users className="w-4 h-4" />
            Báo giá Khách hàng
            {activeTab === QuotationType.CUSTOMER && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-600 rounded-t-full" />
            )}
          </button>
          <button
            onClick={() => setActiveTab(QuotationType.SUPPLIER)}
            className={`pb-3 px-2 font-medium text-sm flex items-center gap-2 transition-colors relative ${
              activeTab === QuotationType.SUPPLIER
                ? "text-indigo-600"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            <Building2 className="w-4 h-4" />
            Báo giá NCC
            {activeTab === QuotationType.SUPPLIER && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-600 rounded-t-full" />
            )}
          </button>
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 flex-1 flex flex-col overflow-hidden">
        <div className="p-4 border-b border-slate-100 bg-slate-50/50">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Tìm kiếm báo giá..."
              value={searchTerm}
              onChange={handleSearchChange}
              className="w-full pl-9 pr-4 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
            />
          </div>
        </div>

        <div className="overflow-auto flex-1">
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 bg-slate-50 z-10">
              <tr className="border-b border-slate-200 text-slate-500 text-xs uppercase tracking-wider font-semibold">
                <th className="px-6 py-4 whitespace-nowrap w-16">STT</th>
                <th className="px-6 py-4 whitespace-nowrap">Tên báo giá</th>
                {isAdmin && (
                  <th className="px-6 py-4 whitespace-nowrap">
                    {activeTab === QuotationType.CUSTOMER ? "Khách hàng" : "Nhà cung cấp"}
                  </th>
                )}
                <th className="px-6 py-4 whitespace-nowrap">Ngày tạo</th>
                <th className="px-6 py-4 whitespace-nowrap">Số sản phẩm</th>
                <th className="px-6 py-4 whitespace-nowrap text-right">Tổng tiền (VND)</th>
                <th className="px-6 py-4 whitespace-nowrap">Trạng thái</th>
                <th className="px-6 py-4 text-right whitespace-nowrap">
                  Thao tác
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paginatedQuotations.map((quotation, index) => (
                <tr
                  key={quotation.id}
                  onClick={() => onSelectQuotation(quotation)}
                  className="hover:bg-slate-50/50 transition-colors cursor-pointer group"
                >
                  <td className="px-6 py-4 text-sm text-slate-500 font-medium">
                    {startIndex + index + 1}
                  </td>
                  <td className="px-6 py-4">
                    <div className="font-medium text-slate-900">
                      {quotation.name}
                    </div>
                  </td>
                  {isAdmin && (
                    <td className="px-6 py-4 text-slate-600">
                      {activeTab === QuotationType.CUSTOMER 
                        ? (quotation.customerName || <span className="text-slate-400 italic">Chưa chọn khách hàng</span>) 
                        : (quotation.supplierName || <span className="text-slate-400 italic">Chưa xác định</span>)}
                    </td>
                  )}
                  <td className="px-6 py-4 text-slate-500 text-sm">
                    {new Date(quotation.date).toLocaleDateString("vi-VN")}
                  </td>
                  <td className="px-6 py-4 text-slate-600 font-medium">
                    {quotation.items.length}
                  </td>
                  <td className="px-6 py-4 text-right font-bold text-indigo-600">
                    {new Intl.NumberFormat("vi-VN", {
                      style: "currency",
                      currency: "VND",
                    }).format(
                      quotation.items.reduce(
                        (sum, item) => sum + item.quantity * item.quotedPrice,
                        0,
                      ),
                    )}
                  </td>
                  <td className="px-6 py-4">
                    {getStatusBadge(quotation.status)}
                  </td>
                  <td
                    className="px-6 py-4 text-right"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex items-center justify-end gap-2">
                      {(isAdmin || quotation.customerId === user?.id) && (
                        <button
                          onClick={(e) => handleDeleteClick(e, quotation.id)}
                          className="text-slate-400 hover:text-rose-600 transition-colors p-2 hover:bg-rose-50 rounded-lg"
                          title="Xóa báo giá"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      )}
                      <button
                        onClick={() => onSelectQuotation(quotation)}
                        className="text-slate-400 group-hover:text-indigo-600 transition-colors p-2 hover:bg-indigo-50 rounded-lg"
                      >
                        <ChevronRight className="w-5 h-5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {paginatedQuotations.length === 0 && (
                <tr>
                  <td
                    colSpan={isAdmin ? 6 : 5}
                    className="px-6 py-12 text-center text-slate-500"
                  >
                    Chưa có báo giá nào.
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
                {Math.min(
                  startIndex + ITEMS_PER_PAGE,
                  filteredQuotations.length,
                )}
              </span>{" "}
              trong tổng số{" "}
              <span className="font-medium text-slate-700">
                {filteredQuotations.length}
              </span>{" "}
              báo giá
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
        isOpen={deletingId !== null}
        title="Xóa báo giá"
        message={`Bạn có chắc chắn muốn xóa báo giá "${quotationToDelete?.name}"? Hành động này không thể hoàn tác.`}
        onConfirm={handleConfirmDelete}
        onCancel={handleCancelDelete}
      />
    </div>
  );
}
