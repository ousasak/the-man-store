/**
 * Standard data formatters for Currency (USD / KHR), Dates, Numbers, and Phones
 */

export function formatUSD(amount) {
  const num = Number(amount) || 0;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
}

export function formatKHR(amount) {
  const num = Math.round(Number(amount) || 0);
  return `${new Intl.NumberFormat('km-KH').format(num)} ៛`;
}

export function formatCurrency(amount, currency = 'USD') {
  if (currency === 'KHR') return formatKHR(amount);
  return formatUSD(amount);
}

export function formatNumber(number) {
  const num = Number(number) || 0;
  return new Intl.NumberFormat('en-US').format(num);
}

export function formatDate(dateString, format = 'medium') {
  if (!dateString) return '-';
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return '-';

  if (format === 'short') {
    return date.toLocaleDateString('km-KH', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  }

  return date.toLocaleDateString('km-KH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatPhoneNumber(phone) {
  if (!phone) return '-';
  const cleaned = ('' + phone).replace(/\D/g, '');
  if (cleaned.length === 9) {
    return `${cleaned.slice(0, 3)} ${cleaned.slice(3, 6)} ${cleaned.slice(6)}`;
  } else if (cleaned.length === 10) {
    return `${cleaned.slice(0, 3)} ${cleaned.slice(3, 6)} ${cleaned.slice(6)}`;
  }
  return phone;
}
