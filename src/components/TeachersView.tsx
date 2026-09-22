import React, { useState } from 'react';
import { Teacher } from '../types';
import { useAuth } from '../lib/authContext';
import { playNotificationChime } from '../lib/focusAudio';
import {
  Users,
  Plus,
  Search,
  Mail,
  Clock,
  MapPin,
  Trash2,
  Edit2,
  BookOpen,
  UserCheck,
  Check,
  Sparkles,
} from 'lucide-react';

interface TeachersViewProps {
  teachers: Teacher[];
  onSaveTeacher: (teacher: Teacher) => void;
  onDeleteTeacher: (id: string) => void;
}

export const TeachersView: React.FC<TeachersViewProps> = ({
  teachers,
  onSaveTeacher,
  onDeleteTeacher,
}) => {
  const { user, addXpAndSparks } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTeacher, setEditingTeacher] = useState<Teacher | null>(null);

  // Form State
  const [name, setName] = useState('');
  const [subject, setSubject] = useState('');
  const [email, setEmail] = useState('');
  const [officeLocation, setOfficeLocation] = useState('');
  const [officeHours, setOfficeHours] = useState('');
  const [notes, setNotes] = useState('');

  const openAddModal = () => {
    setEditingTeacher(null);
    setName('');
    setSubject('');
    setEmail('');
    setOfficeLocation('');
    setOfficeHours('Mon/Wed 2:00 PM - 4:00 PM');
    setNotes('');
    setModalOpen(true);
  };

  const openEditModal = (t: Teacher) => {
    setEditingTeacher(t);
    setName(t.name);
    setSubject(t.subject);
    setEmail(t.email);
    setOfficeLocation(t.officeLocation);
    setOfficeHours(t.officeHours);
    setNotes(t.notes || '');
    setModalOpen(true);
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !subject.trim()) return;

    const teacherObj: Teacher = {
      id: editingTeacher?.id || `teacher_${Date.now()}`,
      userId: user?.id || 'guest',
      name: name.trim(),
      subject: subject.trim(),
      email: email.trim(),
      officeLocation: officeLocation.trim(),
      officeHours: officeHours.trim(),
      notes: notes.trim(),
      avatar: `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(name)}&backgroundColor=0f172a`,
    };

    onSaveTeacher(teacherObj);
    setModalOpen(false);
    playNotificationChime('spark');
    addXpAndSparks(15, 1);
  };

  const filteredTeachers = teachers.filter(
    (t) =>
      t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.subject.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.officeLocation.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6 sm:space-y-8 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white flex items-center gap-2.5">
            <span className="p-2 rounded-xl bg-orange-500/10 text-orange-400 border border-orange-500/20">
              <Users className="w-5 h-5" />
            </span>
            Faculty & Teachers Directory
          </h1>
          <p className="text-zinc-400 text-xs sm:text-sm mt-1">
            Store professor contact emails, office hour schedules, and course grading policies.
          </p>
        </div>

        <button
          onClick={openAddModal}
          className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-indigo-500 via-purple-500 to-orange-500 hover:opacity-90 text-white font-bold text-xs uppercase tracking-wide shadow-[0_0_15px_rgba(99,102,241,0.3)] flex items-center gap-1.5 cursor-pointer"
        >
          <Plus className="w-4 h-4 text-white" /> Add Professor
        </button>
      </div>

      {/* Search Filter */}
      <div className="relative max-w-md">
        <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-3" />
        <input
          type="text"
          placeholder="Search by professor name, department, or office room..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-9 pr-4 py-2 rounded-xl bg-zinc-900/40 border border-white/10 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500"
        />
      </div>

      {/* Teachers Cards Grid */}
      {filteredTeachers.length === 0 ? (
        <div className="text-center py-16 p-8 rounded-3xl bg-zinc-900/40 border border-white/5 text-zinc-500 text-xs">
          <Users className="w-10 h-10 text-zinc-600 mx-auto mb-2" />
          <p className="font-semibold text-zinc-400">No professors in directory</p>
          <p className="text-[11px] text-zinc-500 mt-1">
            Click "+ Add Professor" to log instructor office hours and contact emails.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredTeachers.map((t) => (
            <div
              key={t.id}
              className="p-6 rounded-3xl bg-zinc-900/40 border border-white/5 shadow-lg flex flex-col justify-between hover:border-white/15 transition-all group"
            >
              <div>
                {/* Top Profile */}
                <div className="flex items-start justify-between gap-3 mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-zinc-950 border border-white/10 overflow-hidden shrink-0">
                      <img src={t.avatar} alt={t.name} className="w-full h-full object-cover" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-white group-hover:text-orange-300 transition-colors">
                        {t.name}
                      </h3>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-orange-500/10 text-orange-300 border border-orange-500/20">
                        {t.subject}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => openEditModal(t)}
                      className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white transition-colors cursor-pointer"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => {
                        if (confirm(`Remove ${t.name} from directory?`)) {
                          onDeleteTeacher(t.id);
                        }
                      }}
                      className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Details List */}
                <div className="space-y-2 text-xs text-zinc-300 font-mono mb-4">
                  {t.email && (
                    <a
                      href={`mailto:${t.email}`}
                      className="flex items-center gap-2 text-zinc-400 hover:text-orange-300 transition-colors truncate"
                    >
                      <Mail className="w-3.5 h-3.5 text-orange-400 shrink-0" />
                      <span className="truncate">{t.email}</span>
                    </a>
                  )}

                  {t.officeLocation && (
                    <div className="flex items-center gap-2 text-zinc-400">
                      <MapPin className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                      <span>{t.officeLocation}</span>
                    </div>
                  )}

                  {t.officeHours && (
                    <div className="flex items-center gap-2 text-zinc-400">
                      <Clock className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      <span>{t.officeHours}</span>
                    </div>
                  )}
                </div>

                {t.notes && (
                  <div className="p-3 rounded-xl bg-zinc-950/80 border border-white/5 text-[11px] text-zinc-400 leading-relaxed">
                    {t.notes}
                  </div>
                )}
              </div>

              {t.email && (
                <div className="mt-4 pt-3 border-t border-white/5">
                  <a
                    href={`mailto:${t.email}`}
                    className="w-full py-2 rounded-xl bg-zinc-800 hover:bg-zinc-750 border border-white/5 hover:border-white/10 text-xs font-semibold text-zinc-300 flex items-center justify-center gap-1.5 transition-all"
                  >
                    <Mail className="w-3.5 h-3.5 text-orange-400" /> Send Email Inquiry
                  </a>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add / Edit Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-in fade-in overflow-y-auto">
          <div className="relative w-full max-w-md max-h-[92dvh] overflow-y-auto bg-zinc-950 border border-white/10 rounded-3xl p-5 sm:p-8 shadow-2xl text-white my-auto">
            <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
              <Users className="w-5 h-5 text-orange-400" />
              {editingTeacher ? 'Edit Professor Profile' : 'Add New Professor'}
            </h3>

            <form onSubmit={handleFormSubmit} className="space-y-3 text-xs">
              <div>
                <label className="block font-mono text-zinc-400 mb-1">Professor Full Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Dr. Alan Turing"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-zinc-900 border border-white/10 text-white focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-mono text-zinc-400 mb-1">Course / Department</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Algorithms & Computational Theory"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-zinc-900 border border-white/10 text-white focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-mono text-zinc-400 mb-1">Email Address</label>
                <input
                  type="email"
                  placeholder="e.g. alan.turing@university.edu"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-zinc-900 border border-white/10 text-white focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-mono text-zinc-400 mb-1">Office Room</label>
                  <input
                    type="text"
                    placeholder="e.g. Turing Hall 402"
                    value={officeLocation}
                    onChange={(e) => setOfficeLocation(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl bg-zinc-900 border border-white/10 text-white focus:border-indigo-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block font-mono text-zinc-400 mb-1">Office Hours</label>
                  <input
                    type="text"
                    placeholder="e.g. Tue/Thu 3-5 PM"
                    value={officeHours}
                    onChange={(e) => setOfficeHours(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl bg-zinc-900 border border-white/10 text-white focus:border-indigo-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block font-mono text-zinc-400 mb-1">Study Notes / Grading Policy</label>
                <textarea
                  rows={3}
                  placeholder="Midterm weighted 40%, strict on late assignments..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full p-3 rounded-xl bg-zinc-900 border border-white/10 text-white focus:border-indigo-500 focus:outline-none"
                />
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
                  Save Professor
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
