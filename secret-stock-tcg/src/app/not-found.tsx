import Link from 'next/link';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';

// The global 404, for URLs that match no route at all. It renders in the root
// layout rather than the storefront one, so it brings its own header and footer.
export default function NotFound() {
  return (
    <>
      <Header />
      <main className="flex-1">
        <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
          <p className="text-8xl font-extrabold text-purple-900 mb-4">404</p>
          <h1 className="text-2xl font-bold text-white mb-2">Page Not Found</h1>
          <p className="text-slate-400 mb-8">
            This card isn&apos;t in our binder. Try browsing our inventory instead.
          </p>
          <Link
            href="/"
            className="px-6 py-3 bg-purple-700 hover:bg-purple-600 text-white font-semibold rounded-xl transition-colors"
          >
            Back to Home
          </Link>
        </div>
      </main>
      <Footer />
    </>
  );
}
