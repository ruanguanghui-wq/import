import React, { useState } from "react";
import { Sidebar, ViewType } from "./components/Sidebar";
import { OrderList } from "./components/OrderList";
import { OrderDetail } from "./components/OrderDetail";
import { CreateOrder } from "./components/CreateOrder";
import { FileManager } from "./components/FileManager";
import { AdminDatabase } from "./components/AdminDatabase";
import { Analytics } from "./components/Analytics";
import { SsoAccountManager } from "./components/SsoAccountManager";
import { QuotationList } from "./components/QuotationList";
import { QuotationDetail } from "./components/QuotationDetail";
import { ProductCatalog } from "./components/ProductCatalog";
import { useOrders, useAuth, useQuotations, useProducts } from "./store";
import { Order, Quotation, QuotationStatus, QuotationType, Product } from "./types";
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
  const {
    orders,
    loading: ordersLoading,
    addOrder,
    updateOrder,
    deleteOrder,
    bulkUpdateOrders,
  } = useOrders(user, token);
  const {
    quotations,
    loading: quotationsLoading,
    addQuotation,
    updateQuotation,
    deleteQuotation,
    bulkUpdateQuotations,
  } = useQuotations(user, token);
  const { 
    products, 
    addProduct: storeAddProduct, 
    updateProduct: storeUpdateProduct, 
    deleteProduct,
    bulkAddProducts: storeBulkAddProducts,
    bulkUpdateProducts: storeBulkUpdateProducts,
    bulkDeleteProducts: storeBulkDeleteProducts,
  } = useProducts(user, token);

  const syncProductsToAll = async (productsToSync: Product[]) => {
    if (productsToSync.length === 0) return;

    // Create a map for faster lookup
    const productMap = new Map(productsToSync.map(p => [p.sku, p.name]));

    // Sync to Orders
    const updatedOrders: Order[] = [];
    orders.forEach(order => {
      let hasChanges = false;
      const updatedItems = order.items.map(item => {
        const newName = productMap.get(item.name);
        if (newName && item.productName !== newName) {
          hasChanges = true;
          return { ...item, productName: newName };
        }
        return item;
      });

      if (hasChanges) {
        updatedOrders.push({ ...order, items: updatedItems });
      }
    });

    if (updatedOrders.length > 0) {
      // Split into batches of 500 (Firestore limit)
      for (let i = 0; i < updatedOrders.length; i += 500) {
        await bulkUpdateOrders(updatedOrders.slice(i, i + 500));
      }
    }

    // Sync to Quotations
    const updatedQuotations: Quotation[] = [];
    quotations.forEach(quotation => {
      let hasChanges = false;
      const updatedItems = quotation.items.map(item => {
        const newName = productMap.get(item.name);
        if (newName && item.productName !== newName) {
          hasChanges = true;
          return { ...item, productName: newName };
        }
        return item;
      });

      if (hasChanges) {
        updatedQuotations.push({ ...quotation, items: updatedItems });
      }
    });

    if (updatedQuotations.length > 0) {
      // Split into batches of 500 (Firestore limit)
      for (let i = 0; i < updatedQuotations.length; i += 500) {
        await bulkUpdateQuotations(updatedQuotations.slice(i, i + 500));
      }
    }
  };

  const handleAddProduct = async (product: Product) => {
    await storeAddProduct(product);
    await syncProductsToAll([product]);
  };

  const handleUpdateProduct = async (product: Product) => {
    await storeUpdateProduct(product);
    await syncProductsToAll([product]);
  };

  const handleBulkAddProducts = async (newProducts: Product[]) => {
    await storeBulkAddProducts(newProducts);
    await syncProductsToAll(newProducts);
  };

  const handleBulkUpdateProducts = async (updatedProducts: Product[]) => {
    await storeBulkUpdateProducts(updatedProducts);
    await syncProductsToAll(updatedProducts);
  };

  const [currentView, setCurrentView] = useState<ViewType>("list");
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [selectedQuotationId, setSelectedQuotationId] = useState<string | null>(
    null,
  );

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

  const handleViewQuotation = (id: string) => {
    setSelectedQuotationId(id);
    setCurrentView("quotation_detail");
  };

  const handleCreateQuotation = async (type: QuotationType) => {
    if (!user) return;
    const newQuotation = {
      id: crypto.randomUUID(),
      name: `Báo giá mới - ${new Date().toLocaleDateString("vi-VN")}`,
      date: new Date().toISOString(),
      type: type,
      customerId: user.role !== "admin" ? user.id : "",
      customerName: user.role !== "admin" ? user.username : "",
      customerEmail: user.role !== "admin" ? user.email : "",
      supplierName: "",
      items: [],
      status: QuotationStatus.DRAFT,
    };
    try {
      await addQuotation(newQuotation);
      setSelectedQuotationId(newQuotation.id);
      setCurrentView("quotation_detail");
    } catch (err) {
      alert("Có lỗi khi tạo báo giá.");
    }
  };

  const selectedOrder = orders.find((o) => o.id === selectedOrderId);
  const selectedQuotation = quotations.find(
    (q) => q.id === selectedQuotationId,
  );

  return (
    <div className="flex h-screen bg-slate-50 font-sans text-slate-900 overflow-hidden">
      <Sidebar
        currentView={currentView}
        setCurrentView={setCurrentView}
        userRole={user.role}
        onLogout={logout}
      />
      <main className="flex-1 overflow-auto bg-slate-50/50">
        {ordersLoading || quotationsLoading ? (
          <div className="h-full flex items-center justify-center">
            <div className="w-8 h-8 border-4 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {currentView === "quotations" && (
              <QuotationList
                quotations={quotations}
                onSelectQuotation={(q) => handleViewQuotation(q.id)}
                onCreateQuotation={handleCreateQuotation}
                onDeleteQuotation={deleteQuotation}
              />
            )}
            {currentView === "quotation_detail" && selectedQuotation && (
              <QuotationDetail
                quotation={selectedQuotation}
                onUpdate={updateQuotation}
                onBack={() => setCurrentView("quotations")}
                onConvertToOrder={async (order) => {
                  await addOrder(order);
                }}
                products={products}
                onAddProduct={handleAddProduct}
              />
            )}
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
                products={products}
              />
            )}
            {currentView === "detail" && selectedOrder && (
              <OrderDetail
                order={selectedOrder}
                onUpdate={updateOrder}
                onBack={() => setCurrentView("list")}
                products={products}
                onAddProduct={handleAddProduct}
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
            {currentView === "admin" && user.role === "admin" && (
              <AdminDatabase orders={orders} onUpdateOrder={updateOrder} />
            )}
            {currentView === "catalog" && user.role === "admin" && (
              <ProductCatalog
                products={products}
                onAddProduct={handleAddProduct}
                onUpdateProduct={handleUpdateProduct}
                onDeleteProduct={deleteProduct}
                onBulkAddProducts={handleBulkAddProducts}
                onBulkUpdateProducts={handleBulkUpdateProducts}
                onBulkDeleteProducts={storeBulkDeleteProducts}
              />
            )}
            {currentView === "sso" && user.role === "admin" && (
              <SsoAccountManager />
            )}
            {currentView === "analytics" && <Analytics orders={orders} />}
          </>
        )}
      </main>
    </div>
  );
}
