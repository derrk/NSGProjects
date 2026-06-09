import Link from 'next/link';
import { Calendar, MapPin, Clock, ChevronRight } from 'lucide-react';
import { events } from '@/lib/data';
import { formatDate } from '@/lib/utils';

const typeColors: Record<string, string> = {
  'card-show': 'bg-blue-900/50 text-blue-300 border-blue-700/40',
  'league-cup': 'bg-yellow-900/50 text-yellow-300 border-yellow-700/40',
  'expo': 'bg-green-900/50 text-green-300 border-green-700/40',
  'local-event': 'bg-purple-900/50 text-purple-300 border-purple-700/40',
};

const typeLabels: Record<string, string> = {
  'card-show': 'Card Show',
  'league-cup': 'League Cup',
  'expo': 'Expo',
  'local-event': 'Local Event',
};

export default function EventsPreview() {
  const upcoming = events.slice(0, 3);

  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
      <div className="flex items-end justify-between mb-8">
        <div>
          <h2 className="text-2xl sm:text-3xl font-bold text-white">Upcoming Events</h2>
          <p className="text-slate-400 mt-1">Find us at card shows &amp; events across Texas</p>
        </div>
        <Link
          href="/events"
          className="hidden sm:flex items-center gap-1 text-sm text-purple-400 hover:text-purple-300 transition-colors"
        >
          All events <ChevronRight className="w-4 h-4" />
        </Link>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        {upcoming.map((event) => (
          <div
            key={event.id}
            className="card-hover bg-[#0f0f1a] border border-gray-800 hover:border-purple-700/40 rounded-xl p-5 flex flex-col"
          >
            <div className="flex items-center justify-between mb-4">
              <span className={`text-xs px-2.5 py-1 rounded-full border ${typeColors[event.type]}`}>
                {typeLabels[event.type]}
              </span>
              <div className="text-right">
                <p className="text-xs text-purple-400 font-semibold">
                  {new Date(event.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </p>
                <p className="text-xs text-slate-500">
                  {new Date(event.date).getFullYear()}
                </p>
              </div>
            </div>

            <h3 className="font-bold text-white text-lg mb-2">{event.name}</h3>

            <div className="space-y-1.5 mb-4">
              <div className="flex items-center gap-2 text-sm text-slate-400">
                <MapPin className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                <span className="truncate">{event.city}</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-slate-400">
                <Clock className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                <span>{event.time}</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-slate-400">
                <Calendar className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                <span>{event.boothInfo}</span>
              </div>
            </div>

            <p className="text-sm text-slate-500 leading-relaxed mb-4 line-clamp-2 flex-1">
              {event.description}
            </p>

            <Link
              href={`/events#${event.id}`}
              className="text-sm text-purple-400 hover:text-purple-300 transition-colors font-medium flex items-center gap-1"
            >
              Learn More <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        ))}
      </div>
    </section>
  );
}
