import CartView from "@/components/CartView";

export const metadata = {
  title: "Cart | SlabCraft Displays",
};

export default function CartPage() {
  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-14">
      <h1 className="font-serif text-4xl font-bold text-[#1a1612] mb-8">
        Your Cart
      </h1>
      <CartView />
    </div>
  );
}
