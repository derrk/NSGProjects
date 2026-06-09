'use client';

import { useState } from 'react';
import {
  Package, Calendar, ShoppingBag, BarChart3, RefreshCw,
  Plus, Edit, Trash2, Check, X, Settings, Zap,
} from 'lucide-react';
import { products as initialProducts, events as initialEvents } from '@/lib/data';
import { Product } from '@/lib/types';
import { formatPrice } from '@/lib/utils';

const comingSoonModules = [
  { icon: '🔗', name: 'Collectr Sync', desc: 'Import inventory and sync market prices from Collectr' },
  { icon: '📊', name: 'Inventory Analytics', desc: 'Sales trends, top movers, and inventory health' },
  { icon: '📋', name: 'Buylist Management', desc: 'Manage your active buylist and purchase offers' },
  { icon: '🎪', name: 'Card Show Inventory', desc: 'Separate inventory tracking for card show events' },
  { icon: '🗺️', name: 'Multi-Location', desc: 'Track inventory across multiple locations' },
  { icon: '💳', name: 'Point of Sale', desc: 'In-store POS integration for in-person sales' },
];

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState<'inventory' | 'events' | 'orders'>('inventory');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [products, setProducts] = useState(initialProducts);

  function updateQuantity(id: string, delta: number) {
    setProducts((prev) =>
      prev.map((p) =>
        p.id === id ? { ...p, quantity: Math.max(0, p.quantity + delta) } : p
      )
    );
  }

  function deleteProduct(id: string) {
    if (confirm('Remove this product from inventory?')) {
      setProducts((prev) => prev.filter((p) => p.id !== id));
    }
  }

  const tabs = [
    { id: 'inventory', label: 'Inventory', icon: Package, count: products.length },
    { id: 'events', label: 'Events', icon: Calendar, count: initialEvents.length },
    { id: 'orders', label: 'Orders', icon: ShoppingBag, count: 0 },
  ] as const;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-purple-700 rounded-xl flex items-center justify-center">
            <Zap className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Admin Dashboard</h1>
            <p className="text-sm text-slate-500">Secret Stock TCG · Inventory Management</p>
          </div>
        </div>
        <button className="flex items-center gap-2 px-4 py-2 bg-purple-700 hover:bg-purple-600 text-white text-sm font-medium rounded-lg transition-colors">
          <Plus className="w-4 h-4" />
          Add Product
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        {[
          { label: 'Total Products', value: products.length, icon: Package, color: 'text-purple-400' },
          { label: 'In Stock', value: products.filter((p) => p.quantity > 0).length, icon: Check, color: 'text-green-400' },
          { label: 'Out of Stock', value: products.filter((p) => p.quantity === 0).length, icon: X, color: 'text-red-400' },
          { label: 'Upcoming Events', value: initialEvents.length, icon: Calendar, color: 'text-blue-400' },
        ].map((stat) => (
          <div key={stat.label} className="bg-[#0f0f1a] border border-gray-800 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-slate-500 uppercase tracking-wider">{stat.label}</span>
              <stat.icon className={`w-4 h-4 ${stat.color}`} />
            </div>
            <p className="text-2xl font-bold text-white">{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-gray-900/50 p-1 rounded-xl w-fit">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? 'bg-purple-700 text-white'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
            <span className={`text-xs px-1.5 py-0.5 rounded-full ${activeTab === tab.id ? 'bg-purple-600' : 'bg-gray-800'}`}>
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {/* Inventory Tab */}
      {activeTab === 'inventory' && (
        <div className="bg-[#0f0f1a] border border-gray-800 rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-800 text-xs text-slate-500 uppercase tracking-wider">
                  <th className="text-left px-4 py-3">Product</th>
                  <th className="text-left px-4 py-3 hidden sm:table-cell">Category</th>
                  <th className="text-left px-4 py-3 hidden md:table-cell">Type</th>
                  <th className="text-right px-4 py-3">Price</th>
                  <th className="text-center px-4 py-3">Qty</th>
                  <th className="text-center px-4 py-3">Status</th>
                  <th className="text-right px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-900">
                {products.map((product) => (
                  <tr key={product.id} className="hover:bg-gray-900/30 transition-colors">
                    <td className="px-4 py-3">
                      <p className="text-sm text-white font-medium truncate max-w-[200px]">{product.name}</p>
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell">
                      <span className="text-xs text-slate-400 capitalize">{product.category.replace('-', ' ')}</span>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <span className="text-xs text-slate-500 capitalize">{product.type.replace('-', ' ')}</span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="text-sm text-white font-semibold">{formatPrice(product.price)}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => updateQuantity(product.id, -1)}
                          className="w-6 h-6 rounded bg-gray-800 hover:bg-gray-700 flex items-center justify-center text-slate-400 hover:text-white transition-colors"
                        >
                          -
                        </button>
                        <span className="w-8 text-center text-sm text-white">{product.quantity}</span>
                        <button
                          onClick={() => updateQuantity(product.id, 1)}
                          className="w-6 h-6 rounded bg-gray-800 hover:bg-gray-700 flex items-center justify-center text-slate-400 hover:text-white transition-colors"
                        >
                          +
                        </button>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        product.quantity === 0
                          ? 'bg-red-950 text-red-400'
                          : product.quantity <= 3
                          ? 'bg-amber-950 text-amber-400'
                          : 'bg-green-950 text-green-400'
                      }`}>
                        {product.quantity === 0 ? 'Sold Out' : product.quantity <= 3 ? 'Low Stock' : 'In Stock'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button className="p-1.5 text-slate-500 hover:text-purple-400 transition-colors">
                          <Edit className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => deleteProduct(product.id)}
                          className="p-1.5 text-slate-500 hover:text-red-400 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Events Tab */}
      {activeTab === 'events' && (
        <div className="space-y-4">
          {initialEvents.map((event) => (
            <div key={event.id} className="bg-[#0f0f1a] border border-gray-800 rounded-xl p-4 flex items-center justify-between">
              <div>
                <h3 className="text-white font-medium">{event.name}</h3>
                <p className="text-sm text-slate-500 mt-0.5">{event.city} · {event.date} · {event.boothInfo}</p>
              </div>
              <div className="flex gap-2">
                <button className="p-2 text-slate-500 hover:text-purple-400 transition-colors">
                  <Edit className="w-4 h-4" />
                </button>
                <button className="p-2 text-slate-500 hover:text-red-400 transition-colors">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
          <button className="w-full py-3 border-2 border-dashed border-gray-700 rounded-xl text-slate-500 hover:border-purple-700/50 hover:text-purple-400 transition-colors text-sm flex items-center justify-center gap-2">
            <Plus className="w-4 h-4" /> Add Event
          </button>
        </div>
      )}

      {/* Orders Tab */}
      {activeTab === 'orders' && (
        <div className="text-center py-16 bg-[#0f0f1a] border border-gray-800 rounded-2xl">
          <ShoppingBag className="w-16 h-16 text-gray-700 mx-auto mb-4" />
          <p className="text-slate-400 text-lg mb-1">No orders yet</p>
          <p className="text-sm text-slate-600">Orders will appear here once payment processing is connected.</p>
        </div>
      )}

      {/* Coming Soon Modules */}
      <div className="mt-10">
        <div className="flex items-center gap-2 mb-5">
          <Settings className="w-5 h-5 text-slate-500" />
          <h2 className="text-lg font-semibold text-white">Coming Soon</h2>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {comingSoonModules.map((mod) => (
            <div
              key={mod.name}
              className="bg-[#0a0a0f] border border-gray-800/50 rounded-xl p-4 opacity-60"
            >
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xl">{mod.icon}</span>
                <h3 className="text-sm font-semibold text-slate-400">{mod.name}</h3>
                <span className="ml-auto text-xs px-2 py-0.5 bg-gray-800 text-slate-600 rounded-full">Soon</span>
              </div>
              <p className="text-xs text-slate-600">{mod.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
