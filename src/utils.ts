import { PaymentStatus, PaymentMethod } from "./types";

export const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
  }).format(amount);
};

export const formatNumber = (num: number) => {
  return new Intl.NumberFormat("vi-VN").format(num);
};

export const formatForeignCurrency = (amount: number, currency: string) => {
  if (currency === "VND") return formatCurrency(amount);
  return `${new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)} ${currency}`;
};

export const parseNumber = (val: any): number => {
  if (val === null || val === undefined || val === "") return 0;
  if (typeof val === "number") return val;

  const str = String(val).trim();
  if (!str) return 0;

  // Handle Vietnamese/European format: 1.234,56
  // If there's a comma and it's after a dot, or if there are multiple dots
  const hasComma = str.includes(",");
  const hasDot = str.includes(".");

  if (hasComma && hasDot) {
    // Check which one is the decimal separator
    const lastComma = str.lastIndexOf(",");
    const lastDot = str.lastIndexOf(".");

    if (lastComma > lastDot) {
      // 1.234,56 format
      return parseFloat(str.replace(/\./g, "").replace(",", "."));
    } else {
      // 1,234.56 format
      return parseFloat(str.replace(/,/g, ""));
    }
  } else if (hasComma) {
    // Could be 1234,56 or 1,234
    // Heuristic: if comma is followed by 3 digits and it's the only comma, it might be a thousand separator
    // But in VN, comma is usually decimal.
    // Let's check if it looks like a thousand separator (e.g. 1,000)
    const parts = str.split(",");
    if (
      parts.length === 2 &&
      parts[1].length === 3 &&
      parseInt(parts[0]) < 1000
    ) {
      // Likely 1,000 (one thousand)
      return parseFloat(str.replace(/,/g, ""));
    }
    // Likely 1234,56
    return parseFloat(str.replace(",", "."));
  } else if (hasDot) {
    const parts = str.split(".");
    if (parts.length > 2) {
      // Multiple dots, must be thousand separators: 10.000.000
      return parseFloat(str.replace(/\./g, ""));
    }
    if (
      parts.length === 2 &&
      parts[1].length === 3 &&
      parseInt(parts[0]) < 1000
    ) {
      // Likely 10.000 (ten thousand)
      return parseFloat(str.replace(/\./g, ""));
    }
  }

  return parseFloat(str.replace(/[^0-9.-]/g, "")) || 0;
};

export const parseDate = (val: any): string => {
  if (!val) return new Date().toISOString();

  // If it's an Excel serial date (number)
  if (typeof val === "number") {
    // Excel dates are days since 1900-01-01
    const date = new Date(Math.round((val - 25569) * 86400 * 1000));
    return date.toISOString();
  }

  const str = String(val).trim();
  if (!str) return new Date().toISOString();

  // Try common Vietnamese formats: DD/MM/YYYY, DD-MM-YYYY
  const vnRegex = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/;
  const match = str.match(vnRegex);
  if (match) {
    const day = parseInt(match[1], 10);
    const month = parseInt(match[2], 10) - 1;
    const year = parseInt(match[3], 10);
    const date = new Date(year, month, day);
    if (!isNaN(date.getTime())) return date.toISOString();
  }

  const date = new Date(str);
  return isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
};

export const formatPaymentStatus = (status: PaymentStatus) => {
  switch (status) {
    case PaymentStatus.UNPAID:
      return "Chưa thanh toán";
    case PaymentStatus.PARTIAL:
      return "Thanh toán một phần";
    case PaymentStatus.PAID:
      return "Đã thanh toán";
    default:
      return status;
  }
};

export const formatPaymentMethod = (method: PaymentMethod) => {
  switch (method) {
    case PaymentMethod.CASH:
      return "Tiền mặt";
    case PaymentMethod.BANK_TRANSFER:
      return "Chuyển khoản";
    case PaymentMethod.CREDIT_CARD:
      return "Thẻ tín dụng";
    case PaymentMethod.OTHER:
      return "Khác";
    default:
      return method;
  }
};

export function parseExcelData(jsonData: any[]) {
  const keywords = {
    productCode: [
      "mã sản phẩm",
      "mã hàng",
      "part no",
      "part number",
      "mã sp",
      "sku",
      "item code",
      "mã vạch",
      "barcode",
      "mã",
      "model",
      "ký hiệu",
      "mã hiệu",
    ],
    productName: [
      "tên sản phẩm",
      "part name",
      "tên mặt hàng",
      "vietnamese name",
      "tên sp",
      "description",
      "mô tả",
      "product name",
      "name",
      "tên",
      "diễn giải",
      "quy cách",
    ],
    quantity: [
      "số lượng đặt",
      "order quantity",
      "ord qty",
      "quantity",
      "qty",
      "số lượng",
      "đặt hàng",
      "sl",
      "số lượng nhập",
      "số lượng thực tế",
      "số lượng giao",
      "sl thực tế",
      "sl giao",
      "actual qty",
      "received qty",
      "thực nhận",
      "số lượng báo giá",
      "số lượng yêu cầu",
    ],
    price: [
      "giá",
      "price",
      "đơn giá",
      "unit price",
      "giá dự kiến",
      "giá nhập",
      "cost",
      "đơn giá",
      "giá bán",
      "đơn giá báo giá",
      "giá niêm yết",
    ],
    date: [
      "ngày",
      "date",
      "ngày đặt",
      "ngày báo giá",
      "ngày lập",
      "ngày chứng từ",
    ],
  };

  let headerRowIndex = -1;
  let colMap = {
    productCode: -1,
    productName: -1,
    quantity: -1,
    price: -1,
    date: -1,
  };

  // Look for header row in the first 20 rows
  for (let i = 0; i < Math.min(jsonData.length, 20); i++) {
    const row = jsonData[i];
    if (!Array.isArray(row)) continue;

    let tempMap = {
      productCode: -1,
      productName: -1,
      quantity: -1,
      price: -1,
      date: -1,
    };

    row.forEach((cell, index) => {
      if (!cell) return;
      const lowerCell = String(cell).toLowerCase().trim();

      if (
        tempMap.productCode === -1 &&
        keywords.productCode.some(
          (k) => lowerCell === k || lowerCell.includes(k),
        )
      ) {
        tempMap.productCode = index;
      } else if (
        tempMap.productName === -1 &&
        keywords.productName.some(
          (k) => lowerCell === k || lowerCell.includes(k),
        )
      ) {
        tempMap.productName = index;
      } else if (
        tempMap.quantity === -1 &&
        keywords.quantity.some((k) => lowerCell === k || lowerCell.includes(k))
      ) {
        tempMap.quantity = index;
      } else if (
        tempMap.price === -1 &&
        keywords.price.some((k) => lowerCell === k || lowerCell.includes(k))
      ) {
        tempMap.price = index;
      } else if (
        tempMap.date === -1 &&
        keywords.date.some((k) => lowerCell === k || lowerCell.includes(k))
      ) {
        tempMap.date = index;
      }
    });

    // If we found at least productCode, we assume this is the header row
    if (tempMap.productCode !== -1) {
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
  let documentDate: string | undefined;

  for (let i = headerRowIndex + 1; i < jsonData.length; i++) {
    const row = jsonData[i];
    if (!Array.isArray(row)) continue;

    const name =
      colMap.productCode !== -1
        ? String(row[colMap.productCode] || "").trim()
        : "";
    // Skip empty rows or rows that look like headers
    if (
      !name ||
      name.toLowerCase() === "part number" ||
      name.toLowerCase() === "mã sản phẩm"
    )
      continue;

    const productName =
      colMap.productName !== -1
        ? String(row[colMap.productName] || "").trim()
        : undefined;

    const qty = colMap.quantity !== -1 ? parseNumber(row[colMap.quantity]) : 1;
    const price = colMap.price !== -1 ? parseNumber(row[colMap.price]) : 0;

    // If we haven't found a document date yet, try to get it from this row or nearby
    if (!documentDate && colMap.date !== -1 && row[colMap.date]) {
      documentDate = parseDate(row[colMap.date]);
    }

    if (name) {
      records.push({ name, productName, qty, price });
    }
  }

  // If we still don't have a date, maybe it's above the header
  if (!documentDate && colMap.date !== -1) {
    for (let i = 0; i < headerRowIndex; i++) {
      const row = jsonData[i];
      if (Array.isArray(row) && row[colMap.date]) {
        documentDate = parseDate(row[colMap.date]);
        break;
      }
    }
  }

  return { records, documentDate };
}
