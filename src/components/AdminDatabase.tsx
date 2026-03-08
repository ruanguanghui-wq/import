import React, { useState, useMemo } from 'react';
import { Order } from '../types';
import { formatCurrency, formatNumber } from '../utils';
import { Search, Download, Database, Lock } from 'lucide-react';
import * as XLSX from 'xlsx';

interface AdminDatabaseProps {
  orders: Order[];
}

export function AdminDatabase({ orders }: AdminDatabaseProps) {
  const [searchTerm, setSearchTerm] = useState('');

  const allItems = useMemo(() => {
    const flatItems = orders.flatMap(order => 
      order.items.map(item => ({
        ...item,
        orderName: order.name,
        customerName: order.customerName || 'Khách lẻ',
        orderDate: order.date,
        supplier: order.supplier
      }))
    );

    const groupedItems = new Map<string, typeof flatItems[0]>();

    flatItems.forEach(item => {
      const key = String(item.name).toLowerCase();
      if (groupedItems.has(key)) {
        const existing = groupedItems.get(key)!;
        
        const customers = new Set(existing.customerName.split(', '));
        customers.add(item.customerName);
        
        const orderNames = new Set(existing.orderName.split(', '));
        orderNames.add(item.orderName);

        const suppliers = new Set(existing.supplier ? existing.supplier.split(', ') : []);
        if (item.supplier) suppliers.add(item.supplier);

        groupedItems.set(key, {
          ...existing,
          orderedQty: existing.orderedQty + item.orderedQty,
          receivedQty: existing.receivedQty + item.receivedQty,
          totalReceivedCost: (existing.totalReceivedCost || 0) + (item.totalReceivedCost || 0),
          customerName: Array.from(customers).join(', '),
          orderName: Array.from(orderNames).join(', '),
          supplier: Array.from(suppliers).join(', '),
          productName: existing.productName || item.productName,
        });
      } else {
        groupedItems.set(key, { ...item });
      }
    });

    return Array.from(groupedItems.values());
  }, [orders]);

  const filteredItems = allItems.filter(item => {
    const term = searchTerm.toLowerCase();
    return (
      String(item.name).toLowerCase().includes(term) ||
      (item.productName && String(item.productName).toLowerCase().includes(term)) ||
      String(item.customerName).toLowerCase().includes(term) ||
      String(item.orderName).toLowerCase().includes(term)
    );
  });

  const handleExportExcel = () => {
    const exportData = filteredItems.map((item, index) => ({
      'STT': index + 1,
      'Khách hàng': item.customerName,
      'Tên danh sách (Đơn hàng)': item.orderName,
      'Nhà cung cấp': item.supplier,
      'Ngày tạo': new Date(item.orderDate).toLocaleDateString('vi-VN'),
      'Mã sản phẩm': item.name,
      'Tên sản phẩm': item.productName || '',
      'Số lượng đặt': item.orderedQty,
      'Số lượng đã về': item.receivedQty,
      'Còn thiếu': Math.max(0, item.orderedQty - item.receivedQty),
      'Giá dự kiến': item.expectedPrice,
      'Giá thực tế (TB)': item.receivedQty > 0 ? (item.totalReceivedCost ?? (item.receivedQty * item.actualPrice)) / item.receivedQty : item.actualPrice,
      'Thành tiền dự kiến': item.orderedQty * item.expectedPrice,
      'Thành tiền thực tế': item.totalReceivedCost ?? (item.receivedQty * item.actualPrice)
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Database");
    XLSX.writeFile(wb, `Admin_Database_${new Date().toISOString().split('T')[0]}.xlsx`);
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
        <button
          onClick={handleExportExcel}
          className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl font-medium flex items-center gap-2 transition-all shadow-sm shadow-emerald-600/20"
        >
          <Download className="w-4 h-4" />
          Xuất Excel Tổng
        </button>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 flex-1 flex flex-col overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between bg-slate-50/50 gap-4">
          <div className="relative w-full sm:w-96">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Tìm theo khách hàng, mã SP, tên list..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 transition-all"
            />
          </div>
          <div className="text-sm text-slate-500 font-medium">
            Tổng số dòng dữ liệu: {filteredItems.length}
          </div>
        </div>

        <div className="overflow-auto flex-1">
          <table className="w-full text-left border-collapse min-w-[1200px]">
            <thead className="sticky top-0 bg-slate-50 z-10">
              <tr className="border-b border-slate-200 text-slate-500 text-xs uppercase tracking-wider font-semibold">
                <th className="px-6 py-4">Khách hàng</th>
                <th className="px-6 py-4">Tên List (Đơn hàng)</th>
                <th className="px-6 py-4">Mã sản phẩm</th>
                <th className="px-6 py-4">Tên sản phẩm</th>
                <th className="px-6 py-4 text-right">SL Đặt</th>
                <th className="px-6 py-4 text-right">Đã Về</th>
                <th className="px-6 py-4 text-right">Còn Thiếu</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredItems.map((item, index) => (
                <tr key={`${item.id}-${index}`} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex flex-wrap gap-1">
                      {item.customerName.split(', ').map((customer, idx) => (
                        <span key={idx} className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800">
                          {customer}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-wrap gap-1">
                      {item.orderName.split(', ').map((orderName, idx) => (
                        <span key={idx} className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-700">
                          {orderName}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-6 py-4 font-mono text-sm text-slate-600">{item.name}</td>
                  <td className="px-6 py-4 text-slate-600">{item.productName || '-'}</td>
                  <td className="px-6 py-4 text-right font-medium text-slate-700">{formatNumber(item.orderedQty)}</td>
                  <td className="px-6 py-4 text-right font-medium text-emerald-600">{formatNumber(item.receivedQty)}</td>
                  <td className="px-6 py-4 text-right font-medium text-rose-600">
                    {formatNumber(Math.max(0, item.orderedQty - item.receivedQty))}
                  </td>
                </tr>
              ))}
              {filteredItems.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-slate-500">
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
