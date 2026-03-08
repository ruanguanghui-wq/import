import React from 'react';
import { LayoutDashboard, FileText, Settings, PackagePlus, Folder, Database, LogOut, BarChart3 } from 'lucide-react';

interface SidebarProps {
  currentView: 'list' | 'create' | 'detail' | 'files' | 'admin' | 'analytics';
  setCurrentView: (view: 'list' | 'create' | 'detail' | 'files' | 'admin' | 'analytics') => void;
  userRole: 'admin' | 'user';
  onLogout: () => void;
}

export function Sidebar({ currentView, setCurrentView, userRole, onLogout }: SidebarProps) {
  return (
    <aside className="w-64 bg-slate-900 text-slate-300 flex flex-col">
      <div className="p-6 border-b border-slate-800">
        <h1 className="text-xl font-bold text-white flex items-center gap-2">
          <PackagePlus className="w-6 h-6 text-emerald-400" />
          Nhập Hàng Pro
        </h1>
      </div>
      <nav className="flex-1 p-4 space-y-2">
        <button
          onClick={() => setCurrentView('list')}
          className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-colors ${
            currentView === 'list' || currentView === 'detail'
              ? 'bg-emerald-500/10 text-emerald-400'
              : 'hover:bg-slate-800 hover:text-white'
          }`}
        >
          <LayoutDashboard className="w-5 h-5" />
          <span className="font-medium">Quản lý Đơn hàng</span>
        </button>
        <button
          onClick={() => setCurrentView('create')}
          className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-colors ${
            currentView === 'create'
              ? 'bg-emerald-500/10 text-emerald-400'
              : 'hover:bg-slate-800 hover:text-white'
          }`}
        >
          <FileText className="w-5 h-5" />
          <span className="font-medium">Tạo Đơn mới</span>
        </button>
        <button
          onClick={() => setCurrentView('files')}
          className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-colors ${
            currentView === 'files'
              ? 'bg-emerald-500/10 text-emerald-400'
              : 'hover:bg-slate-800 hover:text-white'
          }`}
        >
          <Folder className="w-5 h-5" />
          <span className="font-medium">Quản lý File</span>
        </button>
        <button
          onClick={() => setCurrentView('analytics')}
          className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-colors ${
            currentView === 'analytics'
              ? 'bg-emerald-500/10 text-emerald-400'
              : 'hover:bg-slate-800 hover:text-white'
          }`}
        >
          <BarChart3 className="w-5 h-5" />
          <span className="font-medium">Phân tích hiệu suất</span>
        </button>
        {userRole === 'admin' && (
          <div className="pt-4 mt-4 border-t border-slate-800">
            <button
              onClick={() => setCurrentView('admin')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-colors ${
                currentView === 'admin'
                  ? 'bg-rose-500/10 text-rose-400'
                  : 'hover:bg-slate-800 hover:text-rose-400/70'
              }`}
            >
              <Database className="w-5 h-5" />
              <span className="font-medium">Admin Database</span>
            </button>
          </div>
        )}
      </nav>
      <div className="p-4 border-t border-slate-800 space-y-2">
        <button className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-slate-800 hover:text-white transition-colors">
          <Settings className="w-5 h-5" />
          <span className="font-medium">Cài đặt</span>
        </button>
        <button 
          onClick={onLogout}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-slate-800 hover:text-rose-400 transition-colors text-slate-400"
        >
          <LogOut className="w-5 h-5" />
          <span className="font-medium">Đăng xuất</span>
        </button>
      </div>
    </aside>
  );
}
