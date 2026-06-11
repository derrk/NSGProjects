export type ProductCategory =
  | 'pokemon'
  | 'one-piece'
  | 'sports-cards'
  | 'graded-slabs'
  | 'sealed-products'
  | 'art'
  | 'apparel'
  | 'vintage'
  | 'high-end';

export type ProductType =
  | 'raw-single'
  | 'graded-slab'
  | 'sealed-product'
  | 'artwork'
  | 'apparel-item';

export type Condition =
  | 'Mint'
  | 'Near Mint'
  | 'Lightly Played'
  | 'Moderately Played'
  | 'Heavily Played'
  | 'Damaged';

export type GradingCompany = 'PSA' | 'BGS' | 'CGC' | 'SGC';

export interface BaseProduct {
  id: string;
  name: string;
  category: ProductCategory;
  type: ProductType;
  price: number;
  quantity: number;
  image: string;           // path relative to /public, e.g. /images/product.jpg
  featured: boolean;
  description?: string;
  marketPrice?: number;
  collectrId?: string;     // placeholder for future Collectr integration
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
  productType: 'Booster Box' | 'ETB' | 'Collection Box' | 'Bundle' | 'Booster Pack' | 'Starter Deck' | 'Promo Box';
  releaseDate?: string;
}

export interface Artwork extends BaseProduct {
  type: 'artwork';
  medium: string;       // 'Original Canvas', 'Print', etc.
  dimensions?: string;
  artist?: string;
}

export interface ApparelItem extends BaseProduct {
  type: 'apparel-item';
  apparelType: 'T-Shirt' | 'Hoodie' | 'Hat';
  sizes: string[];
  color: string;
  design: string;
}

export type Product = RawSingle | GradedSlab | SealedProduct | Artwork | ApparelItem;

// Cart types — preserved for future ecommerce build
export interface CartItem {
  product: Product;
  quantity: number;
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
