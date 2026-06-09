export type ProductCategory =
  | 'pokemon'
  | 'one-piece'
  | 'sports-cards'
  | 'graded-slabs'
  | 'sealed-products'
  | 'vintage'
  | 'high-end';

export type ProductType = 'raw-single' | 'graded-slab' | 'sealed-product';

export type Condition = 'Mint' | 'Near Mint' | 'Lightly Played' | 'Moderately Played' | 'Heavily Played' | 'Damaged';

export type GradingCompany = 'PSA' | 'BGS' | 'CGC';

export interface BaseProduct {
  id: string;
  name: string;
  category: ProductCategory;
  type: ProductType;
  price: number;
  quantity: number;
  image: string;
  featured: boolean;
  description?: string;
  // Placeholder for future Collectr integration
  marketPrice?: number;
  collectrId?: string;
}

export interface RawSingle extends BaseProduct {
  type: 'raw-single';
  set: string;
  cardNumber: string;
  condition: Condition;
  language: string;
}

export interface GradedSlab extends BaseProduct {
  type: 'graded-slab';
  set: string;
  grade: string;
  certNumber: string;
  gradingCompany: GradingCompany;
}

export interface SealedProduct extends BaseProduct {
  type: 'sealed-product';
  productType: 'Booster Box' | 'ETB' | 'Collection Box' | 'Bundle' | 'Booster Pack' | 'Starter Deck';
  releaseDate?: string;
}

export type Product = RawSingle | GradedSlab | SealedProduct;

export interface CartItem {
  product: Product;
  quantity: number;
}

export interface Event {
  id: string;
  name: string;
  date: string;
  location: string;
  city: string;
  time: string;
  boothInfo: string;
  description: string;
  type: 'card-show' | 'league-cup' | 'expo' | 'local-event';
}

export interface CollectionInquiry {
  name: string;
  email: string;
  phone: string;
  collectionType: string;
  estimatedValue: string;
  notes: string;
}

export interface Order {
  id: string;
  items: CartItem[];
  total: number;
  status: 'pending' | 'processing' | 'shipped' | 'delivered' | 'cancelled';
  createdAt: string;
  customer: {
    name: string;
    email: string;
    address: string;
  };
}
