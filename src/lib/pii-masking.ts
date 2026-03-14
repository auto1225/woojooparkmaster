/** SEC-4: 개인정보 마스킹 유틸 */

export function maskPhone(phone: string): string {
  if (!phone) return '';
  const n = phone.replace(/-/g, '');
  if (n.length === 11) return n.slice(0, 3) + '-****-' + n.slice(7);
  if (n.length === 10) return n.slice(0, 3) + '-***-' + n.slice(6);
  return phone.slice(0, Math.floor(phone.length / 2)) + '*'.repeat(phone.length - Math.floor(phone.length / 2));
}

export function maskVehicleNumber(num: string): string {
  if (!num || num.length < 4) return num || '';
  return num.slice(0, -4) + '****';
}

export function maskName(name: string): string {
  if (!name) return '';
  if (name.length <= 1) return '*';
  if (name.length === 2) return name[0] + '*';
  return name[0] + '*'.repeat(name.length - 2) + name[name.length - 1];
}

export function maskEmail(email: string): string {
  if (!email) return '';
  const [local, domain] = email.split('@');
  if (!domain) return email;
  const visible = Math.min(2, local.length);
  return local.slice(0, visible) + '****@' + domain;
}

export function maskAddress(addr: string): string {
  if (!addr) return '';
  const parts = addr.split(' ');
  if (parts.length <= 2) return addr;
  return parts.slice(0, 2).join(' ') + ' ****';
}

export type PIIFieldType = 'phone' | 'vehicle_number' | 'name' | 'email' | 'address';

export function maskField(value: string, field: PIIFieldType): string {
  switch (field) {
    case 'phone': return maskPhone(value);
    case 'vehicle_number': return maskVehicleNumber(value);
    case 'name': return maskName(value);
    case 'email': return maskEmail(value);
    case 'address': return maskAddress(value);
    default: return value;
  }
}
