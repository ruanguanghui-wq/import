import React, { useMemo } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line
} from 'recharts';
import { Order, OrderStatus } from '../types';
import { TrendingUp, AlertTriangle, CheckCircle, Clock, Package } from 'lucide-react';

interface AnalyticsProps {
  orders: Order[];
}

const COLORS = ['#10b981', '#f59e0b', '#ef4444', '#3b82f6'];

export const Analytics: React.FC<AnalyticsProps> = ({ orders }) => {
  const stats = useMemo(() => {
    const totalOrders = orders.length;
    const statusCounts = {
      [OrderStatus.PENDING]: 0,
      [OrderStatus.PARTIAL]: 0,
      [OrderStatus.COMPLETED]: 0,
      [OrderStatus.DISPUTED]: 0,
    };

    const supplierPerformance: Record<string, { total: number, fulfilled: number, items: number, received: number }> = {};

    orders.forEach(order => {
      statusCounts[order.status || OrderStatus.PENDING]++;
      
      if (!supplierPerformance[order.supplier]) {
        supplierPerformance[order.supplier] = { total: 0, fulfilled: 0, items: 0, received: 0 };
      }
      
      supplierPerformance[order.supplier].total++;
      if (order.status === OrderStatus.COMPLETED) {
        supplierPerformance[order.supplier].fulfilled++;
      }

      order.items.forEach(item => {
        supplierPerformance[order.supplier].items += item.orderedQty;
        supplierPerformance[order.supplier].received += (item.receivedQty || 0) + (item.manualReceivedQty || 0);
      });
    });

    const supplierData = Object.entries(supplierPerformance).map(([name, data]) => ({
      name,
      fillRate: Math.round((data.received / data.items) * 100) || 0,
      orders: data.total,
      completionRate: Math.round((data.fulfilled / data.total) * 100) || 0
    })).sort((a, b) => b.fillRate - a.fillRate);

    const statusData = [
      { name: 'Hoàn tất', value: statusCounts[OrderStatus.COMPLETED], color: '#10b981' },
      { name: 'Một phần', value: statusCounts[OrderStatus.PARTIAL], color: '#f59e0b' },
      { name: 'Chờ hàng', value: statusCounts[OrderStatus.PENDING], color: '#3b82f6' },
      { name: 'Khiếu nại', value: statusCounts[OrderStatus.DISPUTED], color: '#ef4444' },
    ].filter(d => d.value > 0);

    return { totalOrders, statusCounts, supplierData, statusData };
  }, [orders]);

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Phân tích hiệu suất</h1>
          <p className="text-slate-500 mt-1">Tổng quan về tình hình nhập hàng và nhà cung cấp</p>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard 
          title="Tổng đơn hàng" 
          value={stats.totalOrders} 
          icon={<Package className="text-emerald-600" />}
          color="bg-emerald-50"
        />
        <StatCard 
          title="Đang chờ/Một phần" 
          value={stats.statusCounts[OrderStatus.PENDING] + stats.statusCounts[OrderStatus.PARTIAL]} 
          icon={<Clock className="text-blue-600" />}
          color="bg-blue-50"
        />
        <StatCard 
          title="Hoàn tất" 
          value={stats.statusCounts[OrderStatus.COMPLETED]} 
          icon={<CheckCircle className="text-emerald-600" />}
          color="bg-emerald-50"
        />
        <StatCard 
          title="Khiếu nại" 
          value={stats.statusCounts[OrderStatus.DISPUTED]} 
          icon={<AlertTriangle className="text-red-600" />}
          color="bg-red-50"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Status Distribution */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <h3 className="text-lg font-semibold mb-6">Trạng thái đơn hàng</h3>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={stats.statusData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {stats.statusData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Supplier Fill Rate */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <h3 className="text-lg font-semibold mb-6">Tỷ lệ lấp đầy theo Nhà cung cấp (%)</h3>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.supplierData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" domain={[0, 100]} />
                <YAxis dataKey="name" type="category" width={100} />
                <Tooltip />
                <Bar dataKey="fillRate" name="Tỷ lệ lấp đầy (%)" fill="#10b981" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Supplier Performance Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-6 border-b border-slate-100">
          <h3 className="text-lg font-semibold">Chi tiết hiệu suất Nhà cung cấp</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider">
              <tr>
                <th className="px-6 py-4 font-semibold">Nhà cung cấp</th>
                <th className="px-6 py-4 font-semibold">Số đơn hàng</th>
                <th className="px-6 py-4 font-semibold">Tỷ lệ hoàn tất đơn</th>
                <th className="px-6 py-4 font-semibold">Tỷ lệ lấp đầy hàng</th>
                <th className="px-6 py-4 font-semibold">Đánh giá</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {stats.supplierData.map((s, idx) => (
                <tr key={idx} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4 font-medium text-slate-900">{s.name}</td>
                  <td className="px-6 py-4 text-slate-600">{s.orders}</td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden max-w-[100px]">
                        <div className="h-full bg-blue-500" style={{ width: `${s.completionRate}%` }} />
                      </div>
                      <span className="text-sm font-medium">{s.completionRate}%</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden max-w-[100px]">
                        <div className="h-full bg-emerald-500" style={{ width: `${s.fillRate}%` }} />
                      </div>
                      <span className="text-sm font-medium">{s.fillRate}%</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    {s.fillRate >= 95 ? (
                      <span className="px-2 py-1 bg-emerald-100 text-emerald-700 rounded-lg text-xs font-bold">XUẤT SẮC</span>
                    ) : s.fillRate >= 80 ? (
                      <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded-lg text-xs font-bold">TỐT</span>
                    ) : (
                      <span className="px-2 py-1 bg-amber-100 text-amber-700 rounded-lg text-xs font-bold">CẦN CẢI THIỆN</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

const StatCard = ({ title, value, icon, color }: { title: string, value: number | string, icon: React.ReactNode, color: string }) => (
  <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex items-center gap-4">
    <div className={`p-3 rounded-xl ${color}`}>
      {icon}
    </div>
    <div>
      <p className="text-sm text-slate-500 font-medium">{title}</p>
      <p className="text-2xl font-bold text-slate-900">{value}</p>
    </div>
  </div>
);
