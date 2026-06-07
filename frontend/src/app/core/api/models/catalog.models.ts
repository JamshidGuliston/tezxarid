export interface City {
  id: number;
  name: string;
  slug: string;
}

export interface Category {
  id: number;
  name: string;
  image: string;
  sort_order: number;
}

export interface Product {
  id: number;
  city_product_id: number;
  name: string;
  image: string;
  unit: string;
  step: string;
  category: number;
  price: string;
  is_available: boolean;
  stock: number;
}
