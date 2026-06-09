import CheckoutView from "@/components/CheckoutView";

export const metadata = {
  title: "Checkout | SlabCraft Displays",
};

export default function CheckoutPage() {
  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-14">
      <h1 className="font-serif text-4xl font-bold text-[#1a1612] mb-2">
        Checkout
      </h1>
      <p className="text-[#a89880] text-sm mb-8">
        This is a demo site. No real payments are processed.
      </p>
      <CheckoutView />
    </div>
  );
}
