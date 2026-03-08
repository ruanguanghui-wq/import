import { Order, OrderItem } from './types';

export function recalculateOrder(order: Order): Order {
  const orderFiles = order.orderFiles || [];
  const receipts = order.receipts || [];
  
  const existingItemsMap = new Map(order.items?.map(i => [String(i.name).toLowerCase(), i]) || []);
  const itemsMap = new Map<string, OrderItem>();

  if (orderFiles.length > 0) {
    const sortedOrderFiles = [...orderFiles].sort((a, b) => new Date(a.importedAt).getTime() - new Date(b.importedAt).getTime());
    
    for (const file of sortedOrderFiles) {
      for (const record of file.records) {
        const key = String(record.name || '').toLowerCase();
        const existing = itemsMap.get(key);
        if (existing) {
          existing.orderedQty += record.qty;
          if (record.price > 0) {
            existing.expectedPrice = record.price;
          }
        } else {
          const prevItem = existingItemsMap.get(key);
          itemsMap.set(key, {
            id: prevItem?.id || record.itemId || crypto.randomUUID(),
            name: record.name,
            productName: record.productName || prevItem?.productName,
            orderedQty: record.qty,
            expectedPrice: record.price,
            receivedQty: 0,
            actualPrice: 0,
            manualReceivedQty: prevItem?.manualReceivedQty,
            manualTotalCost: prevItem?.manualTotalCost
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
        actualPrice: 0
      });
    }
  }

  const sortedReceipts = [...receipts].sort((a, b) => new Date(a.importedAt).getTime() - new Date(b.importedAt).getTime());

  for (const receipt of sortedReceipts) {
    for (const record of receipt.records) {
      const key = String(record.name || '').toLowerCase();
      let item = Array.from(itemsMap.values()).find(i => i.id === record.itemId);
      if (!item && key) {
         // Try matching by name/code more leniently
         item = itemsMap.get(key);
         if (!item) {
            // Try matching by product name if available
            const cleanProductName = String(record.productName || '').toLowerCase().trim();
            if (cleanProductName) {
               item = Array.from(itemsMap.values()).find(i => 
                 String(i.productName || '').toLowerCase().trim() === cleanProductName ||
                 String(i.name || '').toLowerCase().trim() === cleanProductName
               );
            }
         }
      }
      
      if (item) {
        item.receivedQty += record.qty;
        item.totalReceivedCost = (item.totalReceivedCost || 0) + (record.qty * record.price);
        if (record.price > 0) {
          item.actualPrice = record.price;
        }
      } else if (key) {
        const prevItem = existingItemsMap.get(key);
        const newItem: OrderItem = {
          id: record.itemId || crypto.randomUUID(),
          name: record.name || 'Unknown Item',
          productName: record.productName || prevItem?.productName,
          orderedQty: 0,
          expectedPrice: 0,
          receivedQty: record.qty,
          actualPrice: record.price,
          totalReceivedCost: record.qty * record.price,
          manualReceivedQty: prevItem?.manualReceivedQty,
          manualTotalCost: prevItem?.manualTotalCost
        };
        itemsMap.set(key, newItem);
      }
    }
  }

  const finalItems = Array.from(itemsMap.values()).map(item => {
    const manualQty = item.manualReceivedQty !== undefined ? item.manualReceivedQty : item.receivedQty;
    const manualCost = item.manualTotalCost !== undefined ? item.manualTotalCost : (item.totalReceivedCost ?? (item.receivedQty * item.actualPrice));
    
    return {
      ...item,
      receivedQty: manualQty,
      totalReceivedCost: manualCost,
      actualPrice: item.actualPrice
    };
  });

  return {
    ...order,
    items: finalItems
  };
}
