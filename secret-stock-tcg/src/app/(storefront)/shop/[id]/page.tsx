// Redirects /shop/[id] → /inventory/[id] for inventory-showcase version
import { redirect } from 'next/navigation';

export default function ShopItemRedirect({ params }: { params: { id: string } }) {
  redirect(`/inventory/${params.id}`);
}
