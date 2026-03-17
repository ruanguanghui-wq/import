import React, { useState, useRef, useMemo } from "react";
import { Product } from "../types";
import {
  Package,
  Plus,
  Search,
  Trash2,
  Edit2,
  Save,
  X,
  Tag,
  DollarSign,
  FileText,
  Upload,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { formatCurrency } from "../utils";
import { Pagination } from "./Pagination";
import { ConfirmModal } from "./ConfirmModal";
import { useAuth } from "../store";
import * as XLSX from "xlsx";
import { mapExcelHeaders } from "../services/gemini";

import { AdminDatabase } from "./AdminDatabase";
import { Order, Quotation } from "../types";

interface ProductCatalogProps {
  products: Product[];
  orders: Order[];
  quotations: Quotation[];
  onAddProduct: (product: Product) => Promise<void>;
  onUpdateProduct: (product: Product) => Promise<void>;
  onDeleteProduct: (id: string) => Promise<void>;
  onBulkAddProducts: (products: Product[], skipSync?: boolean) => Promise<void>;
  onBulkUpdateProducts: (products: Product[]) => Promise<void>;
  onBulkDeleteProducts: (ids: string[]) => Promise<void>;
  onMergeProducts: (source: Product, target: Product) => Promise<void>;
  onUpdateOrder: (order: Order) => Promise<void>;
  onBulkUpdateOrders: (orders: Order[]) => Promise<void>;
  onSyncAllProducts: (products: Product[]) => Promise<void>;
}

const ITEMS_PER_PAGE = 50;

export function ProductCatalog({
  products,
  orders,
  quotations,
  onAddProduct,
  onUpdateProduct,
  onDeleteProduct,
  onBulkAddProducts,
  onBulkUpdateProducts,
  onBulkDeleteProducts,
  onMergeProducts,
  onUpdateOrder,
  onBulkUpdateOrders,
  onSyncAllProducts,
}: ProductCatalogProps) {
  const [activeTab, setActiveTab] = useState<'standard' | 'custom'>('standard');
  const [mergingProduct, setMergingProduct] = useState<Product | null>(null);
  const [mergeTargetId, setMergeTargetId] = useState<string>("");
  const [isMerging, setIsMerging] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [isImporting, setIsImporting] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importMethod, setImportMethod] = useState<"add" | "update" | "upsert">("add");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBulkCategory, setShowBulkCategory] = useState(false);
  const [bulkCategory, setBulkCategory] = useState("");
  const [confirmDeleteIds, setConfirmDeleteIds] = useState<string[] | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (message: string) => {
    setToastMessage(message);
    setTimeout(() => setToastMessage(null), 3000);
  };
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [columnOrder, setColumnOrder] = useState<string[]>([
    "selection",
    "stt",
    "name",
    "sku",
    "unit",
    "category",
    "price",
    "actions",
  ]);
  const [draggedColumn, setDraggedColumn] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const modalFileInputRef = useRef<HTMLInputElement>(null);

  const existingCategories = Array.from(
    new Set(products.map((p) => p.category).filter(Boolean)),
  ).sort();

  const [formData, setFormData] = useState<Partial<Product>>({
    sku: "",
    name: "",
    basePrice: 0,
    unit: "",
    category: "",
    description: "",
  });

  const unsyncedCount = useMemo(() => {
    const productMap = new Map<string, Product>();
    products.forEach(p => {
      productMap.set(p.sku.toLowerCase().trim(), p);
      productMap.set(p.name.toLowerCase().trim(), p);
    });

    const uniqueItems = new Set<string>();
    orders.forEach(order => {
      order.items.forEach(item => {
        const itemName = (item.name || "").trim();
        const itemProductName = (item.productName || "").trim();
        
        const searchKey1 = itemName.toLowerCase();
        const searchKey2 = itemProductName.toLowerCase();
        
        let matchedProduct = productMap.get(searchKey1) || productMap.get(searchKey2);
        
        if (!matchedProduct) {
          const key = searchKey1 || searchKey2;
          if (key) uniqueItems.add(key);
        }
      });
    });

    quotations.forEach(quotation => {
      quotation.items.forEach(item => {
        const itemName = (item.name || "").trim();
        const itemProductName = (item.productName || "").trim();
        
        const searchKey1 = itemName.toLowerCase();
        const searchKey2 = itemProductName.toLowerCase();
        
        let matchedProduct = productMap.get(searchKey1) || productMap.get(searchKey2);
        
        if (!matchedProduct) {
          const key = searchKey1 || searchKey2;
          if (key) uniqueItems.add(key);
        }
      });
    });

    return uniqueItems.size;
  }, [orders, quotations, products]);

  const filteredProducts = products.filter(
    (p) =>
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.sku.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (p.category &&
        p.category.toLowerCase().includes(searchTerm.toLowerCase())),
  );

  const totalPages = Math.ceil(filteredProducts.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const paginatedProducts = filteredProducts.slice(
    startIndex,
    startIndex + ITEMS_PER_PAGE,
  );

  const standardProductsCount = products.length;

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
    setCurrentPage(1);
  };

  const handleSave = () => {
    if (!formData.sku || !formData.name) {
      showToast("Vui lòng nhập Mã sản phẩm và Tên sản phẩm");
      return;
    }

    if (editingId) {
      const existing = products.find((p) => p.id === editingId);
      if (existing) {
        onUpdateProduct({
          ...existing,
          ...(formData as Product),
          updatedAt: new Date().toISOString(),
        });
      }
      setEditingId(null);
    } else {
      const newProduct: Product = {
        id: crypto.randomUUID(),
        sku: formData.sku!,
        name: formData.name!,
        basePrice: formData.basePrice || 0,
        unit: formData.unit || "",
        category: formData.category || "",
        description: formData.description || "",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      onAddProduct(newProduct);
      setIsAdding(false);
    }

    setFormData({
      sku: "",
      name: "",
      basePrice: 0,
      unit: "",
      category: "",
      description: "",
    });
  };

  const handleBulkUpdateCategory = () => {
    if (!bulkCategory.trim() || selectedIds.size === 0) return;

    const productsToUpdate: Product[] = [];
    selectedIds.forEach((id) => {
      const product = products.find((p) => p.id === id);
      if (product) {
        productsToUpdate.push({
          ...product,
          category: bulkCategory.trim(),
          updatedAt: new Date().toISOString(),
        });
      }
    });

    onBulkUpdateProducts(productsToUpdate);
    setSelectedIds(new Set());
    setBulkCategory("");
    setShowBulkCategory(false);
    showToast(`Đã cập nhật danh mục cho ${productsToUpdate.length} sản phẩm.`);
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    setConfirmDeleteIds(Array.from(selectedIds));
  };

  const executeDelete = async () => {
    if (!confirmDeleteIds) return;
    try {
      if (confirmDeleteIds.length > 1) {
        await onBulkDeleteProducts(confirmDeleteIds);
        setSelectedIds(new Set());
        showToast("Đã xóa các sản phẩm thành công.");
      } else {
        await onDeleteProduct(confirmDeleteIds[0]);
      }
    } catch (err) {
      showToast("Có lỗi khi xóa sản phẩm.");
    } finally {
      setConfirmDeleteIds(null);
    }
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === paginatedProducts.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(paginatedProducts.map((p) => p.id)));
    }
  };

  const toggleSelectProduct = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const handleColumnDragStart = (e: React.DragEvent, column: string) => {
    setDraggedColumn(column);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleColumnDragOver = (e: React.DragEvent, column: string) => {
    e.preventDefault();
    if (!draggedColumn || draggedColumn === column) return;

    const newOrder = [...columnOrder];
    const draggedIndex = newOrder.indexOf(draggedColumn);
    const targetIndex = newOrder.indexOf(column);

    newOrder.splice(draggedIndex, 1);
    newOrder.splice(targetIndex, 0, draggedColumn);
    setColumnOrder(newOrder);
  };

  const renderHeader = (col: string) => {
    const headerClass =
      "px-6 py-4 whitespace-nowrap cursor-move hover:bg-slate-100 transition-colors group relative";
    const dragIndicator = (
      <div className="absolute left-1 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
        <div className="grid grid-cols-2 gap-0.5">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="w-0.5 h-0.5 bg-slate-400 rounded-full" />
          ))}
        </div>
      </div>
    );

    switch (col) {
      case "selection":
        return (
          <th
            key={col}
            className="px-6 py-4 w-10"
            draggable={isAdmin}
            onDragStart={(e) => isAdmin && handleColumnDragStart(e, col)}
            onDragOver={(e) => isAdmin && handleColumnDragOver(e, col)}
          >
            {isAdmin && (
              <input
                type="checkbox"
                checked={
                  selectedIds.size === paginatedProducts.length &&
                  paginatedProducts.length > 0
                }
                onChange={toggleSelectAll}
                className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
              />
            )}
          </th>
        );
      case "stt":
        return (
          <th
            key={col}
            className={headerClass}
            draggable
            onDragStart={(e) => handleColumnDragStart(e, col)}
            onDragOver={(e) => handleColumnDragOver(e, col)}
          >
            {dragIndicator}
            STT
          </th>
        );
      case "name":
        return (
          <th
            key={col}
            className={headerClass}
            draggable
            onDragStart={(e) => handleColumnDragStart(e, col)}
            onDragOver={(e) => handleColumnDragOver(e, col)}
          >
            {dragIndicator}
            Tên sản phẩm
          </th>
        );
      case "sku":
        return (
          <th
            key={col}
            className={headerClass}
            draggable
            onDragStart={(e) => handleColumnDragStart(e, col)}
            onDragOver={(e) => handleColumnDragOver(e, col)}
          >
            {dragIndicator}
            Mã sản phẩm
          </th>
        );
      case "unit":
        return (
          <th
            key={col}
            className={headerClass}
            draggable
            onDragStart={(e) => handleColumnDragStart(e, col)}
            onDragOver={(e) => handleColumnDragOver(e, col)}
          >
            {dragIndicator}
            Đơn vị tính
          </th>
        );
      case "category":
        return (
          <th
            key={col}
            className={headerClass}
            draggable
            onDragStart={(e) => handleColumnDragStart(e, col)}
            onDragOver={(e) => handleColumnDragOver(e, col)}
          >
            {dragIndicator}
            Danh mục
          </th>
        );
      case "price":
        return (
          <th
            key={col}
            className={headerClass}
            draggable
            onDragStart={(e) => handleColumnDragStart(e, col)}
            onDragOver={(e) => handleColumnDragOver(e, col)}
          >
            {dragIndicator}
            Giá gốc
          </th>
        );
      case "actions":
        return (
          <th
            key={col}
            className="px-6 py-4 text-right whitespace-nowrap cursor-move hover:bg-slate-100 transition-colors group relative"
            draggable
            onDragStart={(e) => handleColumnDragStart(e, col)}
            onDragOver={(e) => handleColumnDragOver(e, col)}
          >
            {dragIndicator}
            Thao tác
          </th>
        );
      default:
        return null;
    }
  };

  const renderCell = (col: string, product: Product, index: number) => {
    switch (col) {
      case "selection":
        return (
          <td key={col} className="px-6 py-4">
            {isAdmin && (
              <input
                type="checkbox"
                checked={selectedIds.has(product.id)}
                onChange={() => toggleSelectProduct(product.id)}
                className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
              />
            )}
          </td>
        );
      case "stt":
        return (
          <td key={col} className="px-6 py-4 text-sm text-slate-500 font-medium">
            {startIndex + index + 1}
          </td>
        );
      case "name":
        return (
          <td key={col} className="px-6 py-4">
            <div className="font-medium text-slate-900">{product.name}</div>
            {product.description && (
              <div className="text-xs text-slate-500">
                {product.description}
              </div>
            )}
          </td>
        );
      case "sku":
        return (
          <td key={col} className="px-6 py-4">
            <span className="px-2.5 py-1 bg-slate-50 text-slate-900 border border-slate-200 rounded-md text-sm font-bold">
              {product.sku}
            </span>
          </td>
        );
      case "unit":
        return (
          <td key={col} className="px-6 py-4">
            <span className="text-sm text-slate-600">
              {product.unit || "—"}
            </span>
          </td>
        );
      case "category":
        return (
          <td key={col} className="px-6 py-4">
            <span className="text-sm text-slate-600">
              {product.category || "—"}
            </span>
          </td>
        );
      case "price":
        return (
          <td key={col} className="px-6 py-4">
            <div className="font-medium text-emerald-600">
              {formatCurrency(product.basePrice)}
            </div>
          </td>
        );
      case "actions":
        return isAdmin ? (
          <td key={col} className="px-6 py-4 text-right">
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setMergingProduct(product)}
                className="px-3 py-1.5 bg-indigo-100 text-indigo-700 hover:bg-indigo-200 rounded-lg text-sm font-medium transition-colors whitespace-nowrap"
                title="Gộp vào Hàng Chuẩn khác"
              >
                Gộp mã
              </button>
              <button
                onClick={() => startEdit(product)}
                className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                title="Sửa"
              >
                <Edit2 className="w-4 h-4" />
              </button>
              <button
                onClick={() => setConfirmDeleteIds([product.id])}
                className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                title="Xóa"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </td>
        ) : (
          <td key={col} className="px-6 py-4" />
        );
      default:
        return null;
    }
  };

  const startEdit = (product: Product) => {
    setEditingId(product.id);
    setFormData(product);
    setIsAdding(false);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setIsAdding(false);
    setFormData({
      sku: "",
      name: "",
      basePrice: 0,
      unit: "",
      category: "",
      description: "",
    });
  };

  const handleImportExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: "binary" });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const jsonData = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];

        if (jsonData.length < 2) {
          showToast("File không có dữ liệu hoặc sai định dạng.");
          return;
        }

        const mapping = await mapExcelHeaders(jsonData, [
          "sku",
          "name",
          "unit",
          "basePrice",
          "category",
          "description",
        ]);
        const { colMap, headerIndex } = mapping;

        if (headerIndex === -1 || colMap.sku === -1 || colMap.name === -1) {
          showToast(
            "Lỗi: Không thể nhận diện được các cột bắt buộc (Mã sản phẩm, Tên sản phẩm) từ file Excel. Vui lòng kiểm tra lại tiêu đề cột hoặc thử lại (có thể do lỗi kết nối AI).",
          );
          return;
        }

        const productsToAdd: Product[] = [];
        const productsToUpdate: Product[] = [];
        let skippedCount = 0;

        for (let i = headerIndex + 1; i < jsonData.length; i++) {
          const row = jsonData[i];
          if (!row || row.length === 0) continue;

          const sku = String(row[colMap.sku] || "").trim();
          const name = String(row[colMap.name] || "").trim();

          if (!sku || !name) continue;

          const basePrice =
            colMap.basePrice !== -1
              ? parseFloat(
                  String(row[colMap.basePrice] || "0").replace(
                    /[^0-9.-]+/g,
                    "",
                  ),
                ) || 0
              : 0;
          const unit =
            colMap.unit !== -1
              ? String(row[colMap.unit] || "").trim()
              : "";
          const category =
            colMap.category !== -1
              ? String(row[colMap.category] || "").trim()
              : "";
          const description =
            colMap.description !== -1
              ? String(row[colMap.description] || "").trim()
              : "";

          const existingProduct = products.find((p) => p.sku === sku);

          if (existingProduct) {
            if (importMethod === "add") {
              skippedCount++;
              continue;
            }
            // Update or Upsert (Ghi đè)
            productsToUpdate.push({
              ...existingProduct,
              name,
              basePrice,
              unit,
              category,
              description,
              updatedAt: new Date().toISOString(),
            });
          } else {
            if (importMethod === "update") {
              skippedCount++;
              continue;
            }
            // Add or Upsert (Ghi đè)
            productsToAdd.push({
              id: crypto.randomUUID(),
              sku,
              name,
              basePrice,
              unit,
              category,
              description,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            });
          }
        }

        if (productsToAdd.length > 0) {
          onBulkAddProducts(productsToAdd);
        }
        if (productsToUpdate.length > 0) {
          onBulkUpdateProducts(productsToUpdate);
        }

        showToast(
          `Kết quả nhập liệu:\n- Thêm mới: ${productsToAdd.length}\n- Cập nhật: ${productsToUpdate.length}\n- Bỏ qua: ${skippedCount}`,
        );
        setShowImportModal(false);
      } catch (error) {
        console.error("Error importing products:", error);
        showToast("Có lỗi xảy ra khi xử lý file. Vui lòng kiểm tra lại định dạng file (.xlsx, .xls, .csv) hoặc liên hệ hỗ trợ.");
      } finally {
        setIsImporting(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
        if (modalFileInputRef.current) modalFileInputRef.current.value = "";
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
      showToast("Vui lòng kéo thả file Excel (.xlsx, .xls, .csv)");
    }
  };

  return (
    <div 
      className="p-8 max-w-7xl mx-auto relative"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Import Modal */}
      {/* Modals */}
      {mergingProduct && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <h3 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                Gộp mã sản phẩm
              </h3>
              <button
                onClick={() => {
                  setMergingProduct(null);
                  setMergeTargetId("");
                }}
                className="p-2 hover:bg-slate-200 rounded-full transition-colors"
                disabled={isMerging}
              >
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="space-y-2">
                <p className="text-sm font-medium text-slate-700">Sản phẩm hiện tại (Hàng tạm):</p>
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-900 font-medium">
                  {mergingProduct.name} ({mergingProduct.sku})
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Gộp vào Sản phẩm chuẩn:</label>
                <select
                  value={mergeTargetId}
                  onChange={(e) => setMergeTargetId(e.target.value)}
                  className="w-full p-3 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
                  disabled={isMerging}
                >
                  <option value="">-- Chọn sản phẩm chuẩn --</option>
                  {products.filter(p => p.id !== mergingProduct.id).map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.sku})
                    </option>
                  ))}
                </select>
              </div>
              <p className="text-xs text-rose-600 bg-rose-50 p-3 rounded-lg border border-rose-100">
                <strong>Lưu ý:</strong> Hành động này sẽ cập nhật tất cả Đơn hàng và Báo giá đang dùng tên "{mergingProduct.name}" thành tên của sản phẩm chuẩn được chọn, sau đó xóa mã "{mergingProduct.sku}" khỏi danh mục. Không thể hoàn tác!
              </p>
            </div>
            <div className="p-6 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
              <button
                onClick={() => {
                  setMergingProduct(null);
                  setMergeTargetId("");
                }}
                className="px-4 py-2 text-slate-600 font-medium hover:bg-slate-200 rounded-xl transition-colors"
                disabled={isMerging}
              >
                Hủy
              </button>
              <button
                onClick={async () => {
                  if (!mergeTargetId) {
                    showToast("Vui lòng chọn sản phẩm chuẩn để gộp.");
                    return;
                  }
                  const targetProduct = products.find(p => p.id === mergeTargetId);
                  if (!targetProduct) return;
                  
                  setIsMerging(true);
                  try {
                    await onMergeProducts(mergingProduct, targetProduct);
                    setMergingProduct(null);
                    setMergeTargetId("");
                    showToast("Gộp sản phẩm thành công!");
                  } catch (error) {
                    console.error("Error merging products:", error);
                    showToast("Có lỗi xảy ra khi gộp sản phẩm.");
                  } finally {
                    setIsMerging(false);
                  }
                }}
                disabled={!mergeTargetId || isMerging}
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2 rounded-xl font-medium transition-colors shadow-sm shadow-indigo-600/20 disabled:opacity-50 flex items-center gap-2"
              >
                {isMerging ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Đang gộp...
                  </>
                ) : (
                  "Xác nhận Gộp"
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={confirmDeleteIds !== null}
        title="Xác nhận xóa"
        message={
          confirmDeleteIds?.length === 1
            ? "Bạn có chắc chắn muốn xóa sản phẩm này khỏi danh mục?"
            : `Bạn có chắc chắn muốn xóa ${confirmDeleteIds?.length} sản phẩm đã chọn?`
        }
        onConfirm={executeDelete}
        onCancel={() => setConfirmDeleteIds(null)}
      />

      {showImportModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50 shrink-0">
              <h3 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                <Upload className="w-6 h-6 text-emerald-600" />
                Nhập sản phẩm từ Excel
              </h3>
              <button
                onClick={() => setShowImportModal(false)}
                className="p-2 hover:bg-slate-200 rounded-full transition-colors"
              >
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>

            <div className="p-8 space-y-8 overflow-y-auto">
              {/* File Upload Area */}
              <div
                onClick={() => modalFileInputRef.current?.click()}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDragging(false);
                  const file = e.dataTransfer.files?.[0];
                  if (file) {
                    const mockEvent = {
                      target: { files: [file] },
                    } as unknown as React.ChangeEvent<HTMLInputElement>;
                    handleImportExcel(mockEvent);
                  }
                }}
                className={`border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-all ${
                  isDragging
                    ? "border-emerald-500 bg-emerald-50"
                    : "border-slate-200 hover:border-emerald-400 hover:bg-slate-50"
                }`}
              >
                <input
                  type="file"
                  ref={modalFileInputRef}
                  onChange={handleImportExcel}
                  accept=".xlsx, .xls, .csv"
                  className="hidden"
                />
                <Upload className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                <p className="text-slate-600 font-medium">
                  Kéo/ thả tệp vào đây hoặc bấm vào đây
                </p>
                <p className="text-slate-400 text-sm mt-1">
                  Dung lượng tối đa 20MB. Hỗ trợ .xlsx, .xls, .csv
                </p>
              </div>

              {/* Import Options */}
              <div className="space-y-4">
                <h4 className="text-sm font-bold text-slate-700 uppercase tracking-wider">
                  Phương thức nhập
                </h4>
                <div className="grid grid-cols-1 gap-3">
                  <label
                    className={`flex items-center gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all ${
                      importMethod === "add"
                        ? "border-emerald-500 bg-emerald-50"
                        : "border-slate-100 hover:border-slate-200"
                    }`}
                  >
                    <input
                      type="radio"
                      name="importMethod"
                      checked={importMethod === "add"}
                      onChange={() => setImportMethod("add")}
                      className="w-5 h-5 text-emerald-600 focus:ring-emerald-500"
                    />
                    <div>
                      <p className="font-bold text-slate-900">Thêm mới</p>
                      <p className="text-xs text-slate-500">
                        Chỉ thêm các sản phẩm chưa có trong hệ thống (dựa trên Mã
                        sản phẩm).
                      </p>
                    </div>
                  </label>

                  <label
                    className={`flex items-center gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all ${
                      importMethod === "update"
                        ? "border-emerald-500 bg-emerald-50"
                        : "border-slate-100 hover:border-slate-200"
                    }`}
                  >
                    <input
                      type="radio"
                      name="importMethod"
                      checked={importMethod === "update"}
                      onChange={() => setImportMethod("update")}
                      className="w-5 h-5 text-emerald-600 focus:ring-emerald-500"
                    />
                    <div>
                      <p className="font-bold text-slate-900">Cập nhật</p>
                      <p className="text-xs text-slate-500">
                        Chỉ cập nhật thông tin cho các sản phẩm đã tồn tại.
                      </p>
                    </div>
                  </label>

                  <label
                    className={`flex items-center gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all ${
                      importMethod === "upsert"
                        ? "border-emerald-500 bg-emerald-50"
                        : "border-slate-100 hover:border-slate-200"
                    }`}
                  >
                    <input
                      type="radio"
                      name="importMethod"
                      checked={importMethod === "upsert"}
                      onChange={() => setImportMethod("upsert")}
                      className="w-5 h-5 text-emerald-600 focus:ring-emerald-500"
                    />
                    <div>
                      <p className="font-bold text-slate-900">Ghi đè</p>
                      <p className="text-xs text-slate-500">
                        Cập nhật sản phẩm cũ và thêm mới sản phẩm chưa có.
                      </p>
                    </div>
                  </label>
                </div>
              </div>

              <div className="flex items-center gap-2 p-4 bg-blue-50 rounded-xl border border-blue-100">
                <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center shrink-0">
                  <div className="w-4 h-4 text-white">🤖</div>
                </div>
                <p className="text-sm text-blue-700">
                  Hệ thống sẽ tự động ghép cột thông minh bằng AI. Bạn không cần
                  phải chỉnh sửa file Excel theo mẫu.
                </p>
              </div>
            </div>

            <div className="p-6 bg-slate-50 border-t border-slate-100 flex justify-end gap-3 shrink-0">
              <button
                onClick={() => setShowImportModal(false)}
                className="px-6 py-2.5 text-slate-600 font-medium hover:bg-slate-200 rounded-xl transition-colors"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
      {isDragging && (
        <div className="absolute inset-0 z-50 bg-emerald-500/10 border-4 border-dashed border-emerald-500 rounded-3xl flex items-center justify-center backdrop-blur-sm transition-all animate-in fade-in duration-200">
          <div className="bg-white p-8 rounded-2xl shadow-2xl text-center">
            <Upload className="w-16 h-16 text-emerald-600 mx-auto mb-4 animate-bounce" />
            <h3 className="text-xl font-bold text-slate-900">Thả file vào đây để nhập Excel</h3>
            <p className="text-slate-500 mt-2">Hỗ trợ .xlsx, .xls, .csv</p>
          </div>
        </div>
      )}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight flex items-center gap-3">
            <Package className="w-8 h-8 text-emerald-600" />
            Danh mục Sản phẩm
          </h1>
          <p className="text-slate-500 mt-1">
            {isAdmin 
              ? "Quản lý danh sách Mã sản phẩm và giá gốc hệ thống" 
              : "Xem danh sách sản phẩm và giá từ nhà cung cấp"}
          </p>
        </div>
        {isAdmin && (
          <div className="flex gap-3">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleImportExcel}
              accept=".xlsx, .xls, .csv"
              className="hidden"
            />
            <button
              onClick={() => setShowImportModal(true)}
              disabled={isImporting}
              className="bg-white border border-slate-200 text-slate-700 px-5 py-2.5 rounded-xl font-medium flex items-center gap-2 hover:bg-slate-50 transition-all shadow-sm disabled:opacity-50"
            >
              {isImporting ? (
                <div className="w-5 h-5 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />
              ) : (
                <Upload className="w-5 h-5 text-slate-500" />
              )}
              Nhập Excel
            </button>
            <button
              onClick={() => {
                setIsAdding(true);
                setEditingId(null);
              }}
              className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-xl font-medium flex items-center gap-2 transition-all shadow-sm shadow-emerald-600/20"
            >
              <Plus className="w-5 h-5" />
              Thêm Sản phẩm
            </button>
          </div>
        )}
      </div>

      <div className="flex gap-6 border-b border-slate-200 mb-6">
        <button
          onClick={() => {
            setActiveTab('standard');
            setCurrentPage(1);
          }}
          className={`pb-3 text-sm font-bold uppercase tracking-wider transition-colors relative ${
            activeTab === 'standard'
              ? 'text-emerald-600'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          Hàng Chuẩn ({standardProductsCount})
          {activeTab === 'standard' && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-emerald-600 rounded-t-full" />
          )}
        </button>
        <button
          onClick={() => {
            setActiveTab('custom');
            setCurrentPage(1);
          }}
          className={`pb-3 text-sm font-bold uppercase tracking-wider transition-colors relative ${
            activeTab === 'custom'
              ? 'text-emerald-600'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          Hàng Tạm ({unsyncedCount})
          {activeTab === 'custom' && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-emerald-600 rounded-t-full" />
          )}
        </button>
      </div>

      {activeTab === 'standard' ? (
        <>
          {(isAdding || editingId) && (
        <div className="bg-white p-6 rounded-2xl shadow-md border border-emerald-100 mb-8 animate-in fade-in slide-in-from-top-4 duration-300">
          <h2 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
            {editingId ? (
              <Edit2 className="w-5 h-5 text-emerald-600" />
            ) : (
              <Plus className="w-5 h-5 text-emerald-600" />
            )}
            {editingId ? "Chỉnh sửa sản phẩm" : "Thêm sản phẩm mới"}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                Mã sản phẩm
              </label>
              <div className="relative">
                <Tag className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  value={formData.sku}
                  onChange={(e) =>
                    setFormData({ ...formData, sku: e.target.value })
                  }
                  className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none"
                  placeholder="VD: IP14-PRO-128"
                />
              </div>
            </div>
            <div className="space-y-1 md:col-span-2">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                Tên sản phẩm
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
                className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none"
                placeholder="VD: iPhone 14 Pro 128GB"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                Đơn vị tính
              </label>
              <input
                type="text"
                value={formData.unit || ""}
                onChange={(e) =>
                  setFormData({ ...formData, unit: e.target.value })
                }
                className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none"
                placeholder="VD: Cái, Hộp..."
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                Giá gốc (VNĐ)
              </label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="number"
                  value={formData.basePrice}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      basePrice: parseFloat(e.target.value) || 0,
                    })
                  }
                  className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none"
                />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                Danh mục
              </label>
              <div className="relative">
                <input
                  type="text"
                  list="existing-categories"
                  value={formData.category}
                  onChange={(e) =>
                    setFormData({ ...formData, category: e.target.value })
                  }
                  className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none"
                  placeholder="VD: Điện thoại"
                />
                <datalist id="existing-categories">
                  {existingCategories.map((cat) => (
                    <option key={cat} value={cat} />
                  ))}
                </datalist>
              </div>
            </div>
            <div className="space-y-1 md:col-span-2">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                Mô tả
              </label>
              <input
                type="text"
                value={formData.description}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
                className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none"
                placeholder="Ghi chú thêm..."
              />
            </div>
          </div>
          <div className="flex justify-end gap-3 mt-6">
            <button
              onClick={cancelEdit}
              className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors flex items-center gap-2"
            >
              <X className="w-4 h-4" />
              Hủy
            </button>
            <button
              onClick={handleSave}
              className="px-6 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors flex items-center gap-2 font-medium"
            >
              <Save className="w-4 h-4" />
              Lưu sản phẩm
            </button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              type="text"
              placeholder="Tìm theo tên, mã sản phẩm hoặc danh mục..."
              value={searchTerm}
              onChange={handleSearchChange}
              className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
            />
          </div>

          {isAdmin && selectedIds.size > 0 && (
            <div className="flex items-center gap-2 animate-in fade-in slide-in-from-right-4 duration-200">
              <button
                onClick={handleBulkDelete}
                className="bg-white border border-rose-200 text-rose-700 px-4 py-1.5 rounded-lg text-sm font-medium hover:bg-rose-50 transition-colors flex items-center gap-2"
              >
                <Trash2 className="w-4 h-4" />
                Xóa đã chọn ({selectedIds.size})
              </button>
              
              {showBulkCategory ? (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    list="existing-categories"
                    placeholder="Nhập danh mục mới..."
                    value={bulkCategory}
                    onChange={(e) => setBulkCategory(e.target.value)}
                    className="px-3 py-1.5 text-sm border border-emerald-200 rounded-lg focus:ring-2 focus:ring-emerald-500/20 outline-none w-48"
                  />
                  <button
                    onClick={handleBulkUpdateCategory}
                    className="bg-emerald-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-emerald-700 transition-colors"
                  >
                    Xác nhận
                  </button>
                  <button
                    onClick={() => setShowBulkCategory(false)}
                    className="text-slate-500 hover:text-slate-700 p-1.5"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowBulkCategory(true)}
                  className="bg-white border border-emerald-200 text-emerald-700 px-4 py-1.5 rounded-lg text-sm font-medium hover:bg-emerald-50 transition-colors flex items-center gap-2"
                >
                  <Tag className="w-4 h-4" />
                  Cập nhật danh mục ({selectedIds.size})
                </button>
              )}
            </div>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 text-xs uppercase tracking-wider font-semibold">
                {columnOrder.map((col) => renderHeader(col))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paginatedProducts.map((product, index) => (
                <tr
                  key={product.id}
                  className={`hover:bg-slate-50/80 transition-colors ${selectedIds.has(product.id) ? "bg-emerald-50/30" : ""}`}
                >
                  {columnOrder.map((col) => renderCell(col, product, index))}
                </tr>
              ))}
              {paginatedProducts.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="px-6 py-12 text-center text-slate-500"
                  >
                    <div className="flex flex-col items-center">
                      <FileText className="w-12 h-12 text-slate-200 mb-2" />
                      <p>Không tìm thấy sản phẩm nào</p>
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
                {Math.min(startIndex + ITEMS_PER_PAGE, filteredProducts.length)}
              </span>{" "}
              trong tổng số{" "}
              <span className="font-medium text-slate-700">
                {filteredProducts.length}
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
        </>
      ) : (
        <AdminDatabase
          orders={orders}
          quotations={quotations}
          products={products}
          onUpdateOrder={onUpdateOrder}
          onBulkUpdateOrders={onBulkUpdateOrders}
          onBulkAddProducts={onBulkAddProducts}
          onSyncAllProducts={onSyncAllProducts}
          isEmbedded={true}
        />
      )}

      {toastMessage && (
        <div className="fixed bottom-4 right-4 bg-slate-800 text-white px-6 py-3 rounded-lg shadow-lg z-50 animate-fade-in">
          {toastMessage}
        </div>
      )}
    </div>
  );
}
