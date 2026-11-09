import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
// CartDrawer removed for inventory-showcase version — preserved for future ecommerce build
// import CartDrawer from "@/components/cart/CartDrawer";

// The public site's chrome. It lives here rather than in the root layout so the
// admin at /admin renders on its own, without the storefront nav and footer.
// A route group adds no path segment, so every URL is unchanged.
export default function StorefrontLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <Header />
      <main className="flex-1">{children}</main>
      <Footer />
      {/* <CartDrawer /> — removed for inventory-showcase version */}
    </>
  );
}
