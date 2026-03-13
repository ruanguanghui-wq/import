import { Order, OrderItem, PaymentStatus } from "./types";

export function recalculateOrder(order: Order): Order {
  const orderFiles = order.orderFiles || [];
  const receipts = order.receipts || [];
  const currency = order.currency || "VND";
  const exchangeRate = order.exchangeRate || 1;

  const existingItemsMap = new Map(
    order.items?.map((i) => [String(i.name).toLowerCase(), i]) || [],
  );
  const itemsMap = new Map<string, OrderItem>();

  if (orderFiles.length > 0) {
    const sortedOrderFiles = [...orderFiles].sort(
      (a, b) =>
        new Date(a.importedAt).getTime() - new Date(b.importedAt).getTime(),
    );

    for (const file of sortedOrderFiles) {
      for (const record of file.records) {
        const key = String(record.name || "").toLowerCase();
        const existing = itemsMap.get(key);
        if (existing) {
          existing.orderedQty += record.qty;
          if (record.price > 0) {
            const vndPrice = currency !== "VND" ? Math.round(record.price * exchangeRate) : record.price;
            existing.expectedPrice = vndPrice;
            existing.foreignExpectedPrice = currency !== "VND" ? record.price : undefined;
          }
        } else {
          const prevItem = existingItemsMap.get(key);
          const vndPrice = currency !== "VND" ? Math.round(record.price * exchangeRate) : record.price;
          itemsMap.set(key, {
            id: prevItem?.id || record.itemId || crypto.randomUUID(),
            name: record.name,
            productName: record.productName || prevItem?.productName,
            orderedQty: record.qty,
            expectedPrice: vndPrice,
            receivedQty: 0,
            actualPrice: 0,
            manualReceivedQty: prevItem?.manualReceivedQty,
            manualTotalCost: prevItem?.manualTotalCost,
            foreignExpectedPrice: currency !== "VND" ? record.price : undefined,
          });
        }
      }
    }
  } else {
    for (const item of order.items) {
      itemsMap.set(String(item.name).toLowerCase(), {
        ...item,
        receivedQty: 0,
        totalReceivedCost: 0,
        actualPrice: 0,
      });
    }
  }

  const sortedReceipts = [...receipts].sort(
    (a, b) =>
      new Date(a.importedAt).getTime() - new Date(b.importedAt).getTime(),
  );

  for (const receipt of sortedReceipts) {
    for (const record of receipt.records) {
      const key = String(record.name || "").toLowerCase();
      let item = Array.from(itemsMap.values()).find(
        (i) => i.id === record.itemId,
      );
      if (!item && key) {
        // Try matching by name/code more leniently
        item = itemsMap.get(key);
        if (!item) {
          // Try matching by product name if available
          const cleanProductName = String(record.productName || "")
            .toLowerCase()
            .trim();
          if (cleanProductName) {
            item = Array.from(itemsMap.values()).find(
              (i) =>
                String(i.productName || "")
                  .toLowerCase()
                  .trim() === cleanProductName ||
                String(i.name || "")
                  .toLowerCase()
                  .trim() === cleanProductName,
            );
          }
        }
      }

      if (item) {
        item.receivedQty += record.qty;
        const vndPrice = currency !== "VND" ? Math.round(record.price * exchangeRate) : record.price;
        item.totalReceivedCost =
          (item.totalReceivedCost || 0) + record.qty * vndPrice;
        if (record.price > 0) {
          item.actualPrice = vndPrice;
          item.foreignActualPrice = currency !== "VND" ? record.price : undefined;
        }
      } else if (key) {
        const prevItem = existingItemsMap.get(key);
        const vndPrice = currency !== "VND" ? Math.round(record.price * exchangeRate) : record.price;
        const newItem: OrderItem = {
          id: record.itemId || crypto.randomUUID(),
          name: record.name || "Unknown Item",
          productName: record.productName || prevItem?.productName,
          orderedQty: 0,
          expectedPrice: 0,
          receivedQty: record.qty,
          actualPrice: vndPrice,
          totalReceivedCost: record.qty * vndPrice,
          manualReceivedQty: prevItem?.manualReceivedQty,
          manualTotalCost: prevItem?.manualTotalCost,
          foreignActualPrice: currency !== "VND" ? record.price : undefined,
        };
        itemsMap.set(key, newItem);
      }
    }
  }

  const finalItems = Array.from(itemsMap.values()).map((item) => {
    const manualQty =
      item.manualReceivedQty !== undefined
        ? item.manualReceivedQty
        : item.receivedQty;
    const manualCost =
      item.manualTotalCost !== undefined
        ? item.manualTotalCost
        : (item.totalReceivedCost ?? item.receivedQty * item.actualPrice);

    return {
      ...item,
      receivedQty: manualQty,
      totalReceivedCost: manualCost,
      actualPrice: item.actualPrice,
    };
  });

  const totalExpectedCost = finalItems.reduce((sum, item) => sum + (item.orderedQty * item.expectedPrice), 0);
  const totalReceivedCost = finalItems.reduce((sum, item) => sum + (item.totalReceivedCost || 0), 0);
  
  const hasReceived = finalItems.some(i => i.receivedQty > 0);
  const targetAmount = hasReceived ? totalReceivedCost : totalExpectedCost;

  const paidAmount = (order.payments || []).reduce((sum, p) => sum + p.amount, 0);

  let paymentStatus = PaymentStatus.UNPAID;
  if (paidAmount > 0) {
    if (paidAmount >= targetAmount && targetAmount > 0) {
      paymentStatus = PaymentStatus.PAID;
    } else {
      paymentStatus = PaymentStatus.PARTIAL;
    }
  } else if (paidAmount >= targetAmount && targetAmount === 0 && (order.payments || []).length > 0) {
    paymentStatus = PaymentStatus.PAID;
  }

  return {
    ...order,
    items: finalItems,
    paidAmount,
    paymentStatus,
  };
}
