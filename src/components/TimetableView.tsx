import React, { useState } from 'react';
import { TimetableSlot } from '../types';
import { useAuth } from '../lib/authContext';
import { playNotificationChime } from '../lib/focusAudio';
import {
  Calendar,
  Plus,
  Clock,
  MapPin,
  Trash2,
  BookOpen,
  User,
  CheckCircle,
  Sparkles,
} from 'lucide-react';

interface TimetableViewProps {
  slots: TimetableSlot[];
  onSaveSlot: (slot: TimetableSlot) => void;
  onDeleteSlot: (id: string) => void;
}

const DAYS_OF_WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export const TimetableView: React.FC<TimetableViewProps> = ({
  slots,
  onSaveSlot,
  onDeleteSlot,
}) => {
  const { user, addXpAndSparks } = useAuth();
  const [selectedDay, setSelectedDay] = useState<string>('all');
  const [modalOpen, setModalOpen] = useState(false);

  // Form State
  const [subject, setSubject] = useState('');
  const [day, setDay] = useState('Monday');
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('10:30');
  const [room, setRoom] = useState('Hall B-102');
  const [instructor, setInstructor] = useState('');
  const [color, setColor] = useState('purple');

  const openAddModal = () => {
    setSubject('');
    setDay('Monday');
    setStartTime('09:00');
    setEndTime('10:30');
    setRoom('');
    setInstructor('');
    setColor('purple');
    setModalOpen(true);
  };

  const handleSaveSlot = (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim()) return;

    const newSlot: TimetableSlot = {
      id: `slot_${Date.now()}`,
      userId: user?.id || 'guest',
      subject: subject.trim(),
      day,
      startTime,
      endTime,
      room: room.trim() || 'Online',
      instructor: instructor.trim(),
      color,
    };

    onSaveSlot(newSlot);
    setModalOpen(false);
    playNotificationChime('spark');
    addXpAndSparks(15, 1);
  };

  const filteredSlots = slots.filter(
    (s) => selectedDay === 'all' || s.day.toLowerCase() === selectedDay.toLowerCase()
  );

  // Sort slots by time
  const sortedSlots = [...filteredSlots].sort((a, b) => a.startTime.localeCompare(b.startTime));

  return (
    <div className="space-y-6 sm:space-y-8 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white flex items-center gap-2.5">
            <span className="p-2 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
              <Calendar className="w-5 h-5" />
            </span>
            Weekly Study Timetable & Classes
          </h1>
          <p className="text-zinc-400 text-xs sm:text-sm mt-1">
            Organize university lectures, lab blocks, and scheduled focus study windows.
          </p>
        </div>

        <button
          onClick={openAddModal}
          className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-indigo-500 via-purple-500 to-orange-500 hover:opacity-90 text-white font-bold text-xs uppercase tracking-wide shadow-[0_0_15px_rgba(99,102,241,0.3)] flex items-center gap-1.5 cursor-pointer"
        >
          <Plus className="w-4 h-4 text-white" /> Add Class / Block
        </button>
      </div>

      {/* Days Tabs Filter */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 bg-white/5 p-1.5 rounded-xl border border-white/5 text-xs font-mono">
        <button
          onClick={() => setSelectedDay('all')}
          className={`px-3 py-1.5 rounded-lg transition-all whitespace-nowrap cursor-pointer ${
            selectedDay === 'all'
              ? 'bg-white/10 text-white font-bold shadow-sm'
              : 'text-zinc-400 hover:text-white'
          }`}
        >
          Full Week ({slots.length})
        </button>
        {DAYS_OF_WEEK.map((d) => {
          const count = slots.filter((s) => s.day.toLowerCase() === d.toLowerCase()).length;
          return (
            <button
              key={d}
              onClick={() => setSelectedDay(d)}
              className={`px-3 py-1.5 rounded-lg transition-all whitespace-nowrap cursor-pointer ${
                selectedDay.toLowerCase() === d.toLowerCase()
                  ? 'bg-white/10 text-white font-bold shadow-sm'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              {d} {count > 0 && <span className="text-[10px] text-indigo-400">({count})</span>}
            </button>
          );
        })}
      </div>

      {/* Timetable Grid View */}
      {sortedSlots.length === 0 ? (
        <div className="text-center py-16 p-8 rounded-3xl bg-zinc-900/40 border border-white/5 text-zinc-500 text-xs">
          <Calendar className="w-10 h-10 text-zinc-600 mx-auto mb-2" />
          <p className="font-semibold text-zinc-400">No scheduled classes for this filter</p>
          <p className="text-[11px] text-zinc-500 mt-1">
            Click "+ Add Class / Block" to schedule lectures, labs, or dedicated revision sessions.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {sortedSlots.map((slot) => {
            return (
              <div
                key={slot.id}
                className="p-6 rounded-3xl bg-zinc-900/40 border border-white/5 shadow-lg flex flex-col justify-between hover:border-white/15 transition-all group"
              >
                <div>
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div>
                      <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-zinc-950 text-indigo-300 border border-white/10">
                        {slot.day}
                      </span>
                      <h3 className="text-base font-bold text-white mt-1.5 group-hover:text-indigo-300 transition-colors">
                        {slot.subject}
                      </h3>
                    </div>

                    <button
                      onClick={() => {
                        if (confirm(`Delete ${slot.subject}?`)) {
                          onDeleteSlot(slot.id);
                        }
                      }}
                      className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="space-y-2 text-xs text-zinc-300 font-mono mb-4">
                    <div className="flex items-center gap-2 text-indigo-300">
                      <Clock className="w-4 h-4 text-indigo-400 shrink-0" />
                      <span>
                        {slot.startTime} – {slot.endTime}
                      </span>
                    </div>

                    {slot.room && (
                      <div className="flex items-center gap-2 text-zinc-400">
                        <MapPin className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                        <span>{slot.room}</span>
                      </div>
                    )}

                    {slot.instructor && (
                      <div className="flex items-center gap-2 text-zinc-400">
                        <User className="w-4 h-4 text-orange-400 shrink-0" />
                        <span>Prof: {slot.instructor}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="pt-3 border-t border-white/5 flex items-center justify-between text-[11px] font-mono text-zinc-500">
                  <span>Status: Scheduled</span>
                  <span className="text-emerald-400 flex items-center gap-1">
                    <CheckCircle className="w-3 h-3" /> Active
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add Slot Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-in fade-in overflow-y-auto">
          <div className="relative w-full max-w-md max-h-[92dvh] overflow-y-auto bg-zinc-950 border border-white/10 rounded-3xl p-5 sm:p-8 shadow-2xl text-white my-auto">
            <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
              <Calendar className="w-5 h-5 text-indigo-400" />
              Add Class / Study Slot
            </h3>

            <form onSubmit={handleSaveSlot} className="space-y-3 text-xs">
              <div>
                <label className="block font-mono text-zinc-400 mb-1">Course / Study Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Distributed Systems Lecture"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-zinc-900 border border-white/10 text-white focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-mono text-zinc-400 mb-1">Day of the Week</label>
                <select
                  value={day}
                  onChange={(e) => setDay(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-white/10 text-white focus:border-indigo-500 focus:outline-none font-mono"
                >
                  {DAYS_OF_WEEK.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-mono text-zinc-400 mb-1">Start Time</label>
                  <input
                    type="time"
                    required
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-white/10 text-white focus:border-indigo-500 focus:outline-none font-mono"
                  />
                </div>
                <div>
                  <label className="block font-mono text-zinc-400 mb-1">End Time</label>
                  <input
                    type="time"
                    required
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-white/10 text-white focus:border-indigo-500 focus:outline-none font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-mono text-zinc-400 mb-1">Room / Location</label>
                  <input
                    type="text"
                    placeholder="e.g. Science Hall 301"
                    value={room}
                    onChange={(e) => setRoom(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl bg-zinc-900 border border-white/10 text-white focus:border-indigo-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block font-mono text-zinc-400 mb-1">Instructor (Optional)</label>
                  <input
                    type="text"
                    placeholder="e.g. Dr. Turing"
                    value={instructor}
                    onChange={(e) => setInstructor(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl bg-zinc-900 border border-white/10 text-white focus:border-indigo-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-zinc-800 text-zinc-400 hover:text-white cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-gradient-to-r from-indigo-500 via-purple-500 to-orange-500 text-white font-bold uppercase tracking-wide cursor-pointer shadow-md"
                >
                  Save to Schedule
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
