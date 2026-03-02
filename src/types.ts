export type OrderStatus = 'pending' | 'confirmed' | 'picked_up' | 'cleaning' | 'ready' | 'delivered' | 'cancelled';
export type OrderType = 'sorted' | 'unsorted';
export type ServiceType = 'wash' | 'iron' | 'wash_iron';
export type OrderSpeed = 'normal' | 'express';
export type StaffRole = 'admin' | 'delivery_man' | 'cleaner';

export interface Profile {
  id: string;
  phone: string | null;
  full_name: string | null;
  is_admin: boolean;
  is_guest: boolean;
  wallet_balance: number;
  referral_code: string | null;
  language: string;
  created_at: string;
}

export interface Order {
  id: string;
  order_number: number;
  user_id: string;
  address_id: string | null;
  status: OrderStatus;
  type: OrderType;
  service_type: ServiceType | null;
  speed: OrderSpeed;
  total: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
  is_paid: boolean;
  confirmed_by?: string | null;
  assigned_delivery_id?: string | null;
  delivery_assigned_by?: string | null;
  picked_up_confirmed_by?: string | null;
  assigned_cleaner_id?: string | null;
  cleaner_assigned_by?: string | null;
  ready_confirmed_by?: string | null;
  final_delivery_id?: string | null;
  final_delivery_assigned_by?: string | null;
  profiles?: Pick<Profile, 'phone' | 'full_name'>;
  address?: { full_address: string | null; house_number: string | null; city: string | null } | null;
  items?: OrderItem[];
  receipt?: Receipt | null;
}

export interface OrderItem {
  id: string;
  order_id: string;
  item_name_ar: string;
  item_name_en: string;
  quantity: number;
  service_type: ServiceType;
  unit_price: number;
  subtotal: number;
}

export interface Receipt {
  id: string;
  order_id: string;
  items_snapshot: ReceiptItem[];
  subtotal: number;
  express_fee: number;
  total: number;
  is_paid: boolean;
  paid_at: string | null;
  issued_by: string | null;
  issued_at: string;
  notes: string | null;
}

export interface ReceiptItem {
  name_ar: string;
  name_en: string;
  quantity: number;
  unit_price: number;
  service_type: ServiceType;
  subtotal: number;
}

export interface StaffProfile {
  id: string;
  phone: string | null;
  full_name: string | null;
  roles: StaffRole[];
}

export interface Category {
  id: string;
  name_ar: string;
  name_en: string;
  type: string;
  image_url: string | null;
  sort_order: number;
  is_active: boolean;
}

export interface Item {
  id: string;
  category_id: string;
  name_ar: string;
  name_en: string;
  image_url: string | null;
  wash_price: number;
  iron_price: number;
  wash_iron_price: number;
  order_count: number;
  sort_order: number;
  is_active: boolean;
  categories?: Pick<Category, 'name_ar' | 'name_en'>;
}

export interface Bundle {
  id: string;
  name_ar: string;
  name_en: string;
  description_ar: string | null;
  description_en: string | null;
  price: number;
  original_price: number | null;
  items_count: number;
  validity_days: number;
  cashback_percent: number;
  is_active: boolean;
  is_popular: boolean;
  sort_order: number;
}

export interface DashboardStats {
  totalOrdersToday: number;
  revenueToday: number;
  pendingOrders: number;
  totalCustomers: number;
  totalOrdersAllTime: number;
  revenueAllTime: number;
}
