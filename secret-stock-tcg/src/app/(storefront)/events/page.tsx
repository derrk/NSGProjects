import { Calendar, MapPin, Clock, Ticket } from 'lucide-react';
import { events } from '@/lib/data';
import { formatDate } from '@/lib/utils';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Upcoming Events | Secret Stock TX – Wichita Falls, TX',
  description:
    'Find Secret Stock TX at card shows and events across Texas. Pokémon, One Piece, and Sports Cards available at every event.',
};

const typeColors: Record<string, string> = {
  'card-show': 'bg-blue-900/30 text-blue-300 border-blue-700/40',
  'league-cup': 'bg-yellow-900/30 text-yellow-300 border-yellow-700/40',
  'expo': 'bg-green-900/30 text-green-300 border-green-700/40',
  'local-event': 'bg-purple-900/30 text-purple-300 border-purple-700/40',
};

const typeLabels: Record<string, string> = {
  'card-show': 'Card Show',
  'league-cup': 'League Cup',
  'expo': 'Expo',
  'local-event': 'Local Event',
};

export default function EventsPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <div className="mb-10">
        <h1 className="text-3xl sm:text-4xl font-bold text-white mb-3">Upcoming Events</h1>
        <p className="text-slate-400 text-lg">
          Find Secret Stock TX at card shows and events across Texas. We bring our full
          inventory of singles, slabs, and sealed products to every event.
        </p>
      </div>

      <div className="space-y-6">
        {events.map((event) => (
          <div
            key={event.id}
            id={event.id}
            className="bg-[#0f0f1a] border border-gray-800 hover:border-purple-700/40 rounded-2xl p-6 transition-colors"
          >
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-4">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className={`text-xs px-2.5 py-1 rounded-full border ${typeColors[event.type]}`}>
                    {typeLabels[event.type]}
                  </span>
                </div>
                <h2 className="text-xl font-bold text-white">{event.name}</h2>
              </div>
              <div className="text-right shrink-0">
                <div className="text-2xl font-bold text-purple-400">
                  {new Date(event.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </div>
                <div className="text-sm text-slate-500">
                  {new Date(event.date).getFullYear()}
                </div>
              </div>
            </div>

            <div className="grid sm:grid-cols-3 gap-3 mb-4">
              <div className="flex items-start gap-2 text-sm text-slate-400">
                <MapPin className="w-4 h-4 text-purple-400 mt-0.5 shrink-0" />
                <div>
                  <div className="text-white font-medium">{event.location}</div>
                  <div>{event.city}</div>
                </div>
              </div>
              <div className="flex items-center gap-2 text-sm text-slate-400">
                <Clock className="w-4 h-4 text-purple-400 shrink-0" />
                {event.time}
              </div>
              <div className="flex items-center gap-2 text-sm text-slate-400">
                <Ticket className="w-4 h-4 text-purple-400 shrink-0" />
                {event.boothInfo}
              </div>
            </div>

            <p className="text-slate-400 text-sm leading-relaxed">{event.description}</p>
          </div>
        ))}
      </div>

      {/* Future admin note */}
      <div className="mt-10 p-4 bg-gray-900/40 border border-gray-800 rounded-xl text-sm text-slate-500">
        <span className="text-slate-400 font-medium">Coming Soon:</span> Admin-controlled event
        calendar. Store owners will be able to add, edit, and remove events from the dashboard.
      </div>
    </div>
  );
}
