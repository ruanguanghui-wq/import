export const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
  }).format(amount);
};

export const formatNumber = (num: number) => {
  return new Intl.NumberFormat('vi-VN').format(num);
};

export function parseExcelData(jsonData: any[]) {
  const keywords = {
    productCode: ['mã sản phẩm', 'mã hàng', 'part no', 'part number', 'mã sp', 'sku', 'item code', 'mã vạch', 'barcode', 'mã'],
    productName: ['tên sản phẩm', 'part name', 'tên mặt hàng', 'vietnamese name', 'tên sp', 'description', 'mô tả', 'product name', 'name', 'tên'],
    quantity: ['số lượng đặt', 'order quantity', 'ord qty', 'quantity', 'qty', 'số lượng', 'đặt hàng', 'sl', 'số lượng nhập', 'số lượng thực tế', 'số lượng giao', 'sl thực tế', 'sl giao', 'actual qty', 'received qty', 'thực nhận'],
    price: ['giá', 'price', 'đơn giá', 'unit price', 'giá dự kiến', 'giá nhập', 'cost', 'đơn giá']
  };

  let headerRowIndex = -1;
  let colMap = {
    productCode: -1,
    productName: -1,
    quantity: -1,
    price: -1
  };

  // Look for header row in the first 20 rows
  for (let i = 0; i < Math.min(jsonData.length, 20); i++) {
    const row = jsonData[i];
    if (!Array.isArray(row)) continue;

    let tempMap = { productCode: -1, productName: -1, quantity: -1, price: -1 };
    
    row.forEach((cell, index) => {
      if (!cell) return;
      const lowerCell = String(cell).toLowerCase().trim();
      
      if (tempMap.productCode === -1 && keywords.productCode.some(k => lowerCell === k || lowerCell.includes(k))) {
        tempMap.productCode = index;
      } else if (tempMap.productName === -1 && keywords.productName.some(k => lowerCell === k || lowerCell.includes(k))) {
        tempMap.productName = index;
      } else if (tempMap.quantity === -1 && keywords.quantity.some(k => lowerCell === k || lowerCell.includes(k))) {
        tempMap.quantity = index;
      } else if (tempMap.price === -1 && keywords.price.some(k => lowerCell === k || lowerCell.includes(k))) {
        tempMap.price = index;
      }
    });

    // If we found at least productCode and quantity, we assume this is the header row
    if (tempMap.productCode !== -1 && tempMap.quantity !== -1) {
      headerRowIndex = i;
      colMap = tempMap;
      break;
    }
  }

  // If no header found, return empty array to trigger AI mapping in components
  if (headerRowIndex === -1) {
    return [];
  }

  const records = [];
  for (let i = headerRowIndex + 1; i < jsonData.length; i++) {
    const row = jsonData[i];
    if (!Array.isArray(row)) continue;

    const name = colMap.productCode !== -1 ? String(row[colMap.productCode] || '').trim() : '';
    // Skip empty rows or rows that look like headers (if we didn't find a header row)
    if (!name || name.toLowerCase() === 'part number' || name.toLowerCase() === 'mã sản phẩm') continue;

    const productName = colMap.productName !== -1 ? String(row[colMap.productName] || '').trim() : undefined;
    
    let qty = 0;
    if (colMap.quantity !== -1 && row[colMap.quantity] !== undefined) {
      const qtyVal = String(row[colMap.quantity]).replace(/[^0-9.-]/g, '');
      qty = parseInt(qtyVal, 10) || 0;
    }

    let price = 0;
    if (colMap.price !== -1 && row[colMap.price] !== undefined) {
      const priceVal = String(row[colMap.price]).replace(/[^0-9.-]/g, '');
      price = parseFloat(priceVal) || 0;
    }

    if (name && qty > 0) {
      records.push({ name, productName, qty, price });
    }
  }

  return records;
}
