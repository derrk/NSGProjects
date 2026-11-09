import { prisma } from "@/lib/db";
import type { Product } from "@prisma/client";

// Single source of truth for "can a customer buy this right now?" — published,
// and either untracked or actually in stock.
export function isBuyable(
  p: Pick<Product, "published" | "trackInventory" | "quantity">,
): boolean {
  return p.published && (!p.trackInventory || p.quantity > 0);
}

export function availableQty(
  p: Pick<Product, "trackInventory" | "quantity">,
): number | null {
  return p.trackInventory ? p.quantity : null;
}

export async function getPublishedProducts() {
  return prisma.product.findMany({
    where: { published: true },
    orderBy: [{ featured: "desc" }, { createdAt: "desc" }],
    include: { category: true },
  });
}

export async function getFeaturedProducts(limit = 4) {
  return prisma.product.findMany({
    where: { published: true, featured: true },
    orderBy: { updatedAt: "desc" },
    take: limit,
    include: { category: true },
  });
}

export async function getProductBySlug(slug: string) {
  return prisma.product.findUnique({
    where: { slug },
    include: { category: true },
  });
}

export async function getAdminProducts() {
  return prisma.product.findMany({
    orderBy: [{ published: "desc" }, { createdAt: "desc" }],
    include: { category: true },
  });
}

export async function getProductById(id: string) {
  return prisma.product.findUnique({
    where: { id },
    include: { category: true },
  });
}

export async function getCategories() {
  return prisma.category.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
}

// Categories with a live (published) product count, for storefront nav + tiles.
export async function getCategoriesWithCounts() {
  const categories = await prisma.category.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: { _count: { select: { products: { where: { published: true } } } } },
  });
  return categories.map((c) => ({
    id: c.id,
    name: c.name,
    slug: c.slug,
    count: c._count.products,
  }));
}

export async function getProductsByCategorySlug(slug: string) {
  const category = await prisma.category.findUnique({ where: { slug } });
  if (!category) return null;
  const products = await prisma.product.findMany({
    where: { published: true, categoryId: category.id },
    orderBy: [{ featured: "desc" }, { createdAt: "desc" }],
    include: { category: true },
  });
  return { category, products };
}

export async function searchPublishedProducts(query: string) {
  const term = query.trim();
  if (!term) return [];
  return prisma.product.findMany({
    where: {
      published: true,
      OR: [
        { name: { contains: term, mode: "insensitive" } },
        { brand: { contains: term, mode: "insensitive" } },
        { setName: { contains: term, mode: "insensitive" } },
        { cardNumber: { contains: term, mode: "insensitive" } },
        { description: { contains: term, mode: "insensitive" } },
      ],
    },
    orderBy: [{ featured: "desc" }, { createdAt: "desc" }],
    include: { category: true },
    take: 60,
  });
}
