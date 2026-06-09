"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  ReactNode,
} from "react";

export interface CartItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
  finish: string;
}

function key(item: Pick<CartItem, "id" | "finish">) {
  return `${item.id}::${item.finish}`;
}

interface CartContextType {
  items: CartItem[];
  addItem: (item: CartItem) => void;
  removeItem: (id: string, finish: string) => void;
  updateQuantity: (id: string, finish: string, quantity: number) => void;
  clearCart: () => void;
  total: number;
  count: number;
}

const CartContext = createContext<CartContextType | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);

  const addItem = useCallback((newItem: CartItem) => {
    setItems((prev) => {
      const existing = prev.find((i) => key(i) === key(newItem));
      if (existing) {
        return prev.map((i) =>
          key(i) === key(newItem)
            ? { ...i, quantity: i.quantity + newItem.quantity }
            : i
        );
      }
      return [...prev, newItem];
    });
  }, []);

  const removeItem = useCallback((id: string, finish: string) => {
    setItems((prev) => prev.filter((i) => key(i) !== key({ id, finish })));
  }, []);

  const updateQuantity = useCallback((id: string, finish: string, quantity: number) => {
    if (quantity <= 0) {
      setItems((prev) => prev.filter((i) => key(i) !== key({ id, finish })));
    } else {
      setItems((prev) =>
        prev.map((i) => (key(i) === key({ id, finish }) ? { ...i, quantity } : i))
      );
    }
  }, []);

  const clearCart = useCallback(() => setItems([]), []);

  const total = items.reduce((sum, i) => sum + i.price * i.quantity, 0);
  const count = items.reduce((sum, i) => sum + i.quantity, 0);

  return (
    <CartContext.Provider
      value={{ items, addItem, removeItem, updateQuantity, clearCart, total, count }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}
