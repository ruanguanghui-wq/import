import React, { useState } from "react";
import { Sidebar } from "./components/Sidebar";
import { OrderList } from "./components/OrderList";
import { OrderDetail } from "./components/OrderDetail";
import { CreateOrder } from "./components/CreateOrder";
import { FileManager } from "./components/FileManager";
import { AdminDatabase } from "./components/AdminDatabase";
import { Analytics } from "./components/Analytics";
import { useOrders, useAuth } from "./store";
import { Order } from "./types";
import { Login } from "./components/Login";
import { isFirebaseConfigured } from "./firebase";
import { FirebaseSetup } from "./components/FirebaseSetup";

export default function AppWrapper() {
  if (!isFirebaseConfigured) {
    return <FirebaseSetup />;
  }
  return <App />;
}

function App() {
  const { user, token, loading: authLoading, login, logout } = useAuth();
  const { orders, loading: ordersLoading, addOrder, updateOrder, deleteOrder } = useOrders(user);
  const [currentView, setCurrentView] = useState<"list" | "create" | "detail" | "files" | "admin" | "analytics">(
    "list",
  );
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="w-8 h-8 border-4 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (!user || !token) {
    return <Login onLogin={login} />;
  }

  const handleViewOrder = (id: string) => {
    setSelectedOrderId(id);
    setCurrentView("detail");
  };

  const selectedOrder = orders.find((o) => o.id === selectedOrderId);

  return (
    <div className="flex h-screen bg-slate-50 font-sans text-slate-900 overflow-hidden">
      <Sidebar 
        currentView={currentView} 
        setCurrentView={setCurrentView} 
        userRole={user.role}
        onLogout={logout}
      />
      <main className="flex-1 overflow-auto bg-slate-50/50">
        {ordersLoading ? (
          <div className="h-full flex items-center justify-center">
            <div className="w-8 h-8 border-4 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {currentView === "list" && (
              <OrderList
                orders={orders}
                onViewOrder={handleViewOrder}
                onCreateOrder={() => setCurrentView("create")}
                onDeleteOrder={deleteOrder}
              />
            )}
            {currentView === "create" && (
              <CreateOrder
                onSave={async (order) => {
                  try {
                    await addOrder(order);
                    setCurrentView("list");
                  } catch (err) {
                    alert("Có lỗi khi tạo đơn hàng. Vui lòng thử lại.");
                  }
                }}
                onCancel={() => setCurrentView("list")}
                userRole={user.role}
              />
            )}
            {currentView === "detail" && selectedOrder && (
              <OrderDetail
                order={selectedOrder}
                onUpdate={updateOrder}
                onBack={() => setCurrentView("list")}
              />
            )}
            {currentView === "files" && (
              <FileManager
                orders={orders}
                onUpdateOrder={updateOrder}
                onDeleteOrder={deleteOrder}
                onCreateOrder={() => setCurrentView("create")}
              />
            )}
            {currentView === "admin" && user.role === 'admin' && (
              <AdminDatabase orders={orders} />
            )}
            {currentView === "analytics" && (
              <Analytics orders={orders} />
            )}
          </>
        )}
      </main>
    </div>
  );
}
