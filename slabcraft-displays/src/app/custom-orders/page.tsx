import CustomOrderForm from "@/components/CustomOrderForm";

export const metadata = {
  title: "Custom Orders | SlabCraft Displays",
  description: "Request a fully custom handmade wooden card display. Custom sizing, logos, engravings, and finishes available.",
};

export default function CustomOrdersPage() {
  return (
    <div>
      {/* Header */}
      <section className="bg-[#1a1612] text-[#f5f0e8] py-16">
        <div className="max-w-3xl mx-auto px-4 text-center">
          <div className="text-[#c9a96e] text-sm font-semibold tracking-widest uppercase mb-3">
            Built Just for You
          </div>
          <h1 className="font-serif text-5xl font-bold mb-5">
            Request a Custom Wooden Display
          </h1>
          <p className="text-[#a89880] text-lg leading-relaxed">
            Looking for something unique? Submit your idea and we&apos;ll help
            design a custom display for your card collection, slabs, or
            collectibles. Every custom build is made to your exact specs.
          </p>
        </div>
      </section>

      {/* What we can do */}
      <section className="bg-[#f0e8d8] border-b border-[#e0d4bf] py-10">
        <div className="max-w-5xl mx-auto px-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 text-center">
            {[
              { icon: "🪵", label: "Custom Sizes" },
              { icon: "✏️", label: "Logo Engraving" },
              { icon: "🎨", label: "Any Wood Finish" },
              { icon: "📦", label: "Bulk Orders" },
            ].map((item) => (
              <div key={item.label} className="bg-white rounded-lg p-5 border border-[#e0d4bf]">
                <div className="text-3xl mb-2">{item.icon}</div>
                <div className="text-sm font-semibold text-[#1a1612]">{item.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Form */}
      <section className="max-w-3xl mx-auto px-4 py-16">
        <CustomOrderForm />
      </section>
    </div>
  );
}
