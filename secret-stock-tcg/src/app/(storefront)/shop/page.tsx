// Redirects /shop → /inventory for inventory-showcase version
// Original ecommerce shop page preserved in git history on `master` branch
import { redirect } from 'next/navigation';

export default function ShopRedirect() {
  redirect('/inventory');
}
