import React, { useState } from "react";
import {
  Plus,
  Search,
  Trash2,
  Edit2,
  Shield,
  User,
  X,
  Check,
  AlertTriangle,
  Trash,
} from "lucide-react";

const ITEMS_PER_PAGE = 50;
import { ConfirmModal } from "./ConfirmModal";
import { Pagination } from "./Pagination";
import { useAuth, useUsers } from "../store";

export function SsoAccountManager() {
  const { user, token } = useAuth();
  const { users, loading, addUser, updateUser, deleteUser } = useUsers(user, token);
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<any | null>(null);
  const [formEmail, setFormEmail] = useState("");
  const [formRole, setFormRole] = useState<"admin" | "user">("user");
  const [formUsername, setFormUsername] = useState("");
  const [formError, setFormError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Delete confirmation state
  const [deleteUserId, setDeleteUserId] = useState<string | null>(null);
  const [deleteUserEmail, setDeleteUserEmail] = useState<string | null>(null);

  const handleOpenModal = (u?: any) => {
    setFormError("");
    if (u) {
      setEditingUser(u);
      setFormEmail(u.email);
      setFormRole(u.role);
      setFormUsername(u.username || "");
    } else {
      setEditingUser(null);
      setFormEmail("");
      setFormRole("user");
      setFormUsername("");
    }
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingUser(null);
    setFormEmail("");
    setFormRole("user");
    setFormUsername("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const emailToSave = formEmail.trim().toLowerCase();

    if (!emailToSave || !emailToSave.includes("@")) {
      setFormError("Vui lòng nhập email hợp lệ");
      return;
    }

    setIsSubmitting(true);
    setFormError("");

    try {
      if (editingUser) {
        await updateUser(editingUser.id, {
          email: emailToSave,
          role: formRole,
          username: formUsername,
        });
      } else {
        await addUser({
          email: emailToSave,
          role: formRole,
          username: formUsername,
        });
      }

      handleCloseModal();
    } catch (error: any) {
      console.error("Error saving account:", error);
      setFormError("Có lỗi xảy ra: " + error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteUserId) return;

    try {
      await deleteUser(deleteUserId);
      setDeleteUserId(null);
      setDeleteUserEmail(null);
    } catch (error) {
      console.error("Error deleting account:", error);
      alert("Có lỗi xảy ra khi xoá tài khoản.");
    }
  };

  const filteredAccounts = users.filter((u) =>
    u.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.username?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalPages = Math.ceil(filteredAccounts.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const paginatedAccounts = filteredAccounts.slice(
    startIndex,
    startIndex + ITEMS_PER_PAGE,
  );

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
    setCurrentPage(1);
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">
            Quản lý tài khoản hệ thống
          </h1>
          <p className="text-slate-500 mt-1">
            Danh sách người dùng và phân quyền truy cập
          </p>
        </div>
        <button
          onClick={() => handleOpenModal()}
          className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition-colors font-medium shadow-sm"
        >
          <Plus className="w-5 h-5" />
          Thêm tài khoản
        </button>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-4 border-b border-slate-200 bg-slate-50/50">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              type="text"
              placeholder="Tìm kiếm email hoặc tên..."
              value={searchTerm}
              onChange={handleSearchChange}
              className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all bg-white"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 text-xs uppercase tracking-wider font-semibold">
                <th className="px-6 py-4 whitespace-nowrap">Người dùng</th>
                <th className="px-6 py-4 whitespace-nowrap">Email</th>
                <th className="px-6 py-4 whitespace-nowrap">Vai trò</th>
                <th className="px-6 py-4 text-right whitespace-nowrap">
                  Thao tác
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paginatedAccounts.length === 0 ? (
                <tr>
                  <td
                    colSpan={4}
                    className="px-6 py-8 text-center text-slate-500"
                  >
                    Không tìm thấy tài khoản nào
                  </td>
                </tr>
              ) : (
                paginatedAccounts.map((u) => (
                  <tr
                    key={u.id}
                    className="hover:bg-slate-50/50 transition-colors"
                  >
                    <td className="px-6 py-4">
                      <div className="font-medium text-slate-800">
                        {u.username}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-slate-600">
                      {u.email}
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                          u.role === "admin"
                            ? "bg-rose-100 text-rose-700"
                            : "bg-blue-100 text-blue-700"
                        }`}
                      >
                        {u.role === "admin" ? (
                          <Shield className="w-3.5 h-3.5" />
                        ) : (
                          <User className="w-3.5 h-3.5" />
                        )}
                        {u.role === "admin"
                          ? "Quản trị viên"
                          : "Người dùng"}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleOpenModal(u)}
                          className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                          title="Sửa"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => {
                            setDeleteUserId(u.id);
                            setDeleteUserEmail(u.email);
                          }}
                          disabled={u.email === "ruanguanghui@gmail.com"}
                          className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-400"
                          title={
                            u.email === "ruanguanghui@gmail.com"
                              ? "Không thể xoá admin gốc"
                              : "Xoá"
                          }
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
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
                {Math.min(startIndex + ITEMS_PER_PAGE, filteredAccounts.length)}
              </span>{" "}
              trong tổng số{" "}
              <span className="font-medium text-slate-700">
                {filteredAccounts.length}
              </span>{" "}
              tài khoản
            </div>
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={setCurrentPage}
            />
          </div>
        )}
      </div>

      {/* Modal Thêm/Sửa */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between p-6 border-b border-slate-100">
              <h3 className="text-lg font-bold text-slate-800">
                {editingUser ? "Sửa tài khoản" : "Thêm tài khoản mới"}
              </h3>
              <button
                onClick={handleCloseModal}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {formError && (
                <div className="p-3 bg-rose-50 text-rose-600 rounded-xl text-sm font-medium border border-rose-100">
                  {formError}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Tên hiển thị
                </label>
                <input
                  type="text"
                  value={formUsername}
                  onChange={(e) => setFormUsername(e.target.value)}
                  placeholder="ví dụ: Nguyễn Văn A"
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Địa chỉ Email
                </label>
                <input
                  type="email"
                  value={formEmail}
                  onChange={(e) => setFormEmail(e.target.value)}
                  placeholder="ví dụ: user@gmail.com"
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                  required
                  disabled={editingUser?.email === "ruanguanghui@gmail.com"}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Vai trò
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setFormRole("user")}
                    disabled={editingUser?.email === "ruanguanghui@gmail.com"}
                    className={`flex items-center justify-center gap-2 py-2.5 rounded-xl border transition-all ${
                      formRole === "user"
                        ? "border-blue-500 bg-blue-50 text-blue-700 font-medium"
                        : "border-slate-200 text-slate-600 hover:bg-slate-50"
                    } ${editingUser?.email === "ruanguanghui@gmail.com" ? "opacity-50 cursor-not-allowed" : ""}`}
                  >
                    <User className="w-4 h-4" />
                    Người dùng
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormRole("admin")}
                    className={`flex items-center justify-center gap-2 py-2.5 rounded-xl border transition-all ${
                      formRole === "admin"
                        ? "border-rose-500 bg-rose-50 text-rose-700 font-medium"
                        : "border-slate-200 text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    <Shield className="w-4 h-4" />
                    Quản trị viên
                  </button>
                </div>
              </div>

              <div className="pt-4 flex gap-3">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="flex-1 py-2.5 px-4 bg-white border border-slate-200 text-slate-700 font-medium rounded-xl hover:bg-slate-50 transition-colors"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 py-2.5 px-4 bg-emerald-600 text-white font-medium rounded-xl hover:bg-emerald-700 transition-colors disabled:opacity-70 flex items-center justify-center gap-2"
                >
                  {isSubmitting ? (
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <>
                      <Check className="w-5 h-5" />
                      Lưu lại
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Xoá */}
      <ConfirmModal
        isOpen={!!deleteUserId}
        onCancel={() => {
          setDeleteUserId(null);
          setDeleteUserEmail(null);
        }}
        onConfirm={handleDelete}
        title="Xoá tài khoản"
        message={`Bạn có chắc chắn muốn xoá tài khoản "${deleteUserEmail}" không? Người dùng này sẽ không thể truy cập vào hệ thống nữa.`}
      />
    </div>
  );
}
