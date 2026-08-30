import { useState, useMemo } from 'react';
import {
    StickyNote, Plus, X, Search, Calendar, Pin, Trash2, Edit3,
    Archive, RotateCcw, Tag, User, Check, AlertCircle, Clock
} from 'lucide-react';
import { useNotes } from '../context/NotesContext';

const NOTE_CATEGORIES = [
    { id: 'all', label: 'All', icon: null },
    { id: 'inquiry', label: 'Website Inquiry', color: 'blue', icon: '🌐' },
    { id: 'urgent', label: 'Urgent', color: 'rose', icon: '🔥' },
    { id: 'reminder', label: 'Reminder', color: 'amber', icon: '⏰' },
    { id: 'repair', label: 'Repair', color: 'blue', icon: '🔧' },
    { id: 'inventory', label: 'Inventory', color: 'emerald', icon: '📦' },
    { id: 'customer', label: 'Customer', color: 'purple', icon: '👥' },
    { id: 'cash', label: 'Cash / Expense', color: 'indigo', icon: '💰' },
    { id: 'general', label: 'General', color: 'slate', icon: '📝' },
];

const COLOR_OPTIONS = [
    { id: 'amber', bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-900', badge: 'bg-amber-100 text-amber-800', dot: 'bg-amber-400' },
    { id: 'rose', bg: 'bg-rose-50', border: 'border-rose-200', text: 'text-rose-900', badge: 'bg-rose-100 text-rose-800', dot: 'bg-rose-400' },
    { id: 'emerald', bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-900', badge: 'bg-emerald-100 text-emerald-800', dot: 'bg-emerald-400' },
    { id: 'blue', bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-900', badge: 'bg-blue-100 text-blue-800', dot: 'bg-blue-400' },
    { id: 'purple', bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-900', badge: 'bg-purple-100 text-purple-800', dot: 'bg-purple-400' },
    { id: 'slate', bg: 'bg-slate-50', border: 'border-slate-200', text: 'text-slate-900', badge: 'bg-slate-100 text-slate-800', dot: 'bg-slate-400' },
];

const DATE_FILTER_PRESETS = [
    { id: 'all', label: 'All Time' },
    { id: 'today', label: 'Today' },
    { id: 'yesterday', label: 'Yesterday' },
    { id: 'this_week', label: 'This Week' },
    { id: 'this_month', label: 'This Month' },
    { id: 'custom', label: 'Custom' },
];

function formatNoteDate(isoString) {
    if (!isoString) return '-';
    try {
        const d = new Date(isoString);
        if (Number.isNaN(d.getTime())) return '-';
        return d.toLocaleDateString('en-GB', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    } catch {
        return '-';
    }
}

export default function NotesDrawer({ isOpen, onClose }) {
    const { notes, addNote, updateNote, deleteNote, togglePin, toggleArchive } = useNotes();

    // Tab state: 'active' | 'history' | 'all'
    const [activeTab, setActiveTab] = useState('active');

    // Filter states
    const [searchQuery, setSearchQuery] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('all');
    const [datePreset, setDatePreset] = useState('all');
    const [customStartDate, setCustomStartDate] = useState('');
    const [customEndDate, setCustomEndDate] = useState('');

    // Composer states
    const [showComposer, setShowComposer] = useState(false);
    const [composerTitle, setComposerTitle] = useState('');
    const [composerContent, setComposerContent] = useState('');
    const [composerCategory, setComposerCategory] = useState('general');
    const [composerColor, setComposerColor] = useState('amber');
    const [composerPinned, setComposerPinned] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Edit modal states
    const [editingNote, setEditingNote] = useState(null);
    const [editTitle, setEditTitle] = useState('');
    const [editContent, setEditContent] = useState('');
    const [editCategory, setEditCategory] = useState('general');
    const [editColor, setEditColor] = useState('amber');
    const [editPinned, setEditPinned] = useState(false);

    // Counts
    const activeCount = useMemo(() => notes.filter((n) => !n.isArchived).length, [notes]);
    const historyCount = useMemo(() => notes.filter((n) => n.isArchived).length, [notes]);
    const allCount = notes.length;

    // Filtered notes
    const filteredNotes = useMemo(() => {
        const query = searchQuery.trim().toLowerCase();
        const now = new Date();
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const startOfYesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
        const endOfYesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, -1);
        const startOfWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay());
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

        return notes.filter((note) => {
            // Tab filter
            if (activeTab === 'active' && note.isArchived) return false;
            if (activeTab === 'history' && !note.isArchived) return false;

            // Category filter
            if (categoryFilter !== 'all' && note.category !== categoryFilter) {
                return false;
            }

            // Date filter
            if (datePreset !== 'all') {
                const noteDate = new Date(note.createdAt || note.created_at);
                if (datePreset === 'today') {
                    if (noteDate < startOfToday) return false;
                } else if (datePreset === 'yesterday') {
                    if (noteDate < startOfYesterday || noteDate > endOfYesterday) return false;
                } else if (datePreset === 'this_week') {
                    if (noteDate < startOfWeek) return false;
                } else if (datePreset === 'this_month') {
                    if (noteDate < startOfMonth) return false;
                } else if (datePreset === 'custom') {
                    if (customStartDate) {
                        const start = new Date(customStartDate);
                        start.setHours(0, 0, 0, 0);
                        if (noteDate < start) return false;
                    }
                    if (customEndDate) {
                        const end = new Date(customEndDate);
                        end.setHours(23, 59, 59, 999);
                        if (noteDate > end) return false;
                    }
                }
            }

            // Search query filter
            if (query) {
                const matchTitle = (note.title || '').toLowerCase().includes(query);
                const matchContent = (note.content || '').toLowerCase().includes(query);
                const matchAuthor = (note.authorName || '').toLowerCase().includes(query);
                const matchCategory = (note.category || '').toLowerCase().includes(query);
                if (!matchTitle && !matchContent && !matchAuthor && !matchCategory) {
                    return false;
                }
            }

            return true;
        });
    }, [notes, activeTab, categoryFilter, datePreset, customStartDate, customEndDate, searchQuery]);

    const handleCreateNote = async (e) => {
        e?.preventDefault();
        if (!composerContent.trim() && !composerTitle.trim()) return;

        setIsSubmitting(true);
        try {
            await addNote({
                title: composerTitle.trim(),
                content: composerContent.trim(),
                category: composerCategory,
                color: composerColor,
                isPinned: composerPinned,
            });
            setComposerTitle('');
            setComposerContent('');
            setComposerCategory('general');
            setComposerColor('amber');
            setComposerPinned(false);
            setShowComposer(false);
        } catch (err) {
            console.error('Failed to create note:', err);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleOpenEdit = (note) => {
        setEditingNote(note);
        setEditTitle(note.title || '');
        setEditContent(note.content || '');
        setEditCategory(note.category || 'general');
        setEditColor(note.color || 'amber');
        setEditPinned(Boolean(note.isPinned));
    };

    const handleSaveEdit = async (e) => {
        e?.preventDefault();
        if (!editingNote) return;
        if (!editContent.trim() && !editTitle.trim()) return;

        try {
            await updateNote(editingNote.id, {
                title: editTitle.trim(),
                content: editContent.trim(),
                category: editCategory,
                color: editColor,
                isPinned: editPinned,
            });
            setEditingNote(null);
        } catch (err) {
            console.error('Failed to update note:', err);
        }
    };

    const handleDeleteNote = async (id) => {
        if (typeof window !== 'undefined' && !window.confirm('Are you sure you want to delete this note?')) {
            return;
        }
        try {
            await deleteNote(id);
        } catch (err) {
            console.error('Failed to delete note:', err);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[80]" onClick={onClose}>
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />

            {/* Right Drawer */}
            <div
                className="absolute right-0 top-0 h-full w-full max-w-2xl bg-white shadow-2xl flex flex-col"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header Banner */}
                <div className="bg-gradient-to-r from-amber-500 via-amber-600 to-orange-500 p-4 sm:p-5 flex items-center justify-between shadow-sm flex-shrink-0">
                    <div>
                        <h2 className="text-lg font-black text-white flex items-center gap-2">
                            <StickyNote size={22} className="text-amber-100" />
                            Notes & History
                        </h2>
                        <p className="text-xs text-amber-100 mt-0.5">
                            Keep important reminders, customer memos, and view full history anytime
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={() => setShowComposer((prev) => !prev)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/20 hover:bg-white/30 text-white text-xs font-bold transition-all border border-white/30"
                        >
                            <Plus size={15} />
                            {showComposer ? 'Close Form' : 'New Note'}
                        </button>
                        <button
                            type="button"
                            onClick={onClose}
                            className="text-white hover:bg-white/20 p-1.5 rounded-xl transition-colors"
                        >
                            <X size={20} />
                        </button>
                    </div>
                </div>

                {/* Sub Tabs: Active Notes | Notes History | All */}
                <div className="px-4 pt-3 pb-2 border-b border-slate-100 flex-shrink-0 bg-slate-50/50">
                    <div className="rounded-xl bg-slate-100 p-1 grid grid-cols-3 gap-1">
                        <button
                            type="button"
                            onClick={() => setActiveTab('active')}
                            className={`rounded-lg py-2 text-xs font-black transition-all flex items-center justify-center gap-1.5 ${activeTab === 'active'
                                ? 'bg-white text-amber-800 shadow-sm'
                                : 'text-slate-500 hover:text-slate-800'
                                }`}
                        >
                            📌 Active ({activeCount})
                        </button>
                        <button
                            type="button"
                            onClick={() => setActiveTab('history')}
                            className={`rounded-lg py-2 text-xs font-black transition-all flex items-center justify-center gap-1.5 ${activeTab === 'history'
                                ? 'bg-white text-blue-700 shadow-sm'
                                : 'text-slate-500 hover:text-slate-800'
                                }`}
                        >
                            📜 History ({historyCount})
                        </button>
                        <button
                            type="button"
                            onClick={() => setActiveTab('all')}
                            className={`rounded-lg py-2 text-xs font-black transition-all flex items-center justify-center gap-1.5 ${activeTab === 'all'
                                ? 'bg-white text-slate-800 shadow-sm'
                                : 'text-slate-500 hover:text-slate-800'
                                }`}
                        >
                            🗂️ All ({allCount})
                        </button>
                    </div>
                </div>

                {/* Search, Categories & Date Filter Toolbar */}
                <div className="px-4 py-2.5 space-y-2 border-b border-slate-100 bg-white flex-shrink-0">
                    {/* Search bar */}
                    <div className="relative w-full">
                        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Search in notes, titles, authors..."
                            className="w-full pl-9 pr-8 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:bg-white transition-all"
                        />
                        {searchQuery && (
                            <button
                                type="button"
                                onClick={() => setSearchQuery('')}
                                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                            >
                                <X size={14} />
                            </button>
                        )}
                    </div>

                    {/* Category Filter Chips */}
                    <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar text-xs">
                        {NOTE_CATEGORIES.map((cat) => (
                            <button
                                key={cat.id}
                                type="button"
                                onClick={() => setCategoryFilter(cat.id)}
                                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold whitespace-nowrap transition-all flex items-center gap-1 ${categoryFilter === cat.id
                                    ? 'bg-amber-600 text-white shadow-sm'
                                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                    }`}
                            >
                                {cat.icon && <span>{cat.icon}</span>}
                                {cat.label}
                            </button>
                        ))}
                    </div>

                    {/* Date Filters (especially for History & All tabs) */}
                    <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-slate-100 text-[11px]">
                        <span className="font-bold text-slate-400 flex items-center gap-1">
                            <Calendar size={12} /> Date:
                        </span>
                        {DATE_FILTER_PRESETS.map((preset) => (
                            <button
                                key={preset.id}
                                type="button"
                                onClick={() => setDatePreset(preset.id)}
                                className={`px-2 py-0.5 rounded-md font-bold transition-all ${datePreset === preset.id
                                    ? 'bg-slate-800 text-white'
                                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                    }`}
                            >
                                {preset.label}
                            </button>
                        ))}
                    </div>

                    {/* Custom Date Range Picker */}
                    {datePreset === 'custom' && (
                        <div className="flex items-center gap-2 pt-1.5">
                            <input
                                type="date"
                                value={customStartDate}
                                onChange={(e) => setCustomStartDate(e.target.value)}
                                className="px-2 py-1 rounded-lg border border-slate-200 text-xs text-slate-700 bg-slate-50"
                            />
                            <span className="text-xs text-slate-400">to</span>
                            <input
                                type="date"
                                value={customEndDate}
                                onChange={(e) => setCustomEndDate(e.target.value)}
                                className="px-2 py-1 rounded-lg border border-slate-200 text-xs text-slate-700 bg-slate-50"
                            />
                        </div>
                    )}
                </div>

                {/* Main Scrollable Content */}
                <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50/40">
                    {/* Add Note Composer Box */}
                    {showComposer && (
                        <form
                            onSubmit={handleCreateNote}
                            className="bg-white rounded-2xl p-4 border-2 border-amber-300 shadow-lg space-y-3 animate-in fade-in slide-in-from-top-2 duration-200"
                        >
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-black uppercase text-amber-700 tracking-wider flex items-center gap-1.5">
                                    <Plus size={14} /> New Note / Memo
                                </span>
                                <label className="flex items-center gap-1.5 text-xs font-bold text-slate-600 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={composerPinned}
                                        onChange={(e) => setComposerPinned(e.target.checked)}
                                        className="rounded text-amber-600 focus:ring-amber-500"
                                    />
                                    <Pin size={13} className={composerPinned ? 'text-amber-600 fill-amber-600' : 'text-slate-400'} />
                                    Pin to Top
                                </label>
                            </div>

                            <input
                                type="text"
                                value={composerTitle}
                                onChange={(e) => setComposerTitle(e.target.value)}
                                placeholder="Note Title (Optional)..."
                                className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-sm font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:bg-white"
                            />

                            <textarea
                                value={composerContent}
                                onChange={(e) => setComposerContent(e.target.value)}
                                placeholder="Write your note, reminder, phone number, instructions, customer info..."
                                rows={3}
                                required
                                className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:bg-white resize-none"
                            />

                            {/* Tag & Color Controls */}
                            <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-100">
                                <div className="flex items-center gap-2">
                                    {/* Category Select */}
                                    <select
                                        value={composerCategory}
                                        onChange={(e) => setComposerCategory(e.target.value)}
                                        className="text-xs font-bold text-slate-700 bg-slate-100 border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none"
                                    >
                                        {NOTE_CATEGORIES.filter((c) => c.id !== 'all').map((cat) => (
                                            <option key={cat.id} value={cat.id}>
                                                {cat.icon} {cat.label}
                                            </option>
                                        ))}
                                    </select>

                                    {/* Color palette */}
                                    <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg">
                                        {COLOR_OPTIONS.map((col) => (
                                            <button
                                                key={col.id}
                                                type="button"
                                                onClick={() => setComposerColor(col.id)}
                                                className={`h-5 w-5 rounded-full ${col.dot} transition-transform ${composerColor === col.id ? 'ring-2 ring-slate-800 scale-110' : 'hover:opacity-80'}`}
                                                title={col.id}
                                            />
                                        ))}
                                    </div>
                                </div>

                                <div className="flex items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setShowComposer(false)}
                                        className="px-3 py-1.5 text-xs font-bold text-slate-500 hover:text-slate-800"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={isSubmitting || (!composerContent.trim() && !composerTitle.trim())}
                                        className="px-4 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-black shadow-sm transition-all disabled:opacity-50"
                                    >
                                        {isSubmitting ? 'Saving...' : 'Save Note'}
                                    </button>
                                </div>
                            </div>
                        </form>
                    )}

                    {/* Notes List */}
                    {filteredNotes.length === 0 ? (
                        <div className="bg-white rounded-2xl border border-slate-200/80 p-10 text-center space-y-2">
                            <StickyNote size={36} className="mx-auto text-slate-300" />
                            <p className="text-sm font-bold text-slate-600">No notes found</p>
                            <p className="text-xs text-slate-400 max-w-xs mx-auto">
                                {activeTab === 'active'
                                    ? 'Create your first note or reminder using the "+ New Note" button above.'
                                    : 'No notes match the selected date or category filters.'}
                            </p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 gap-2.5">
                            {filteredNotes.map((note) => {
                                const colorConfig = COLOR_OPTIONS.find((c) => c.id === note.color) || COLOR_OPTIONS[0];
                                const catConfig = NOTE_CATEGORIES.find((c) => c.id === note.category) || { label: 'General', icon: '📝' };

                                return (
                                    <div
                                        key={note.id}
                                        className={`rounded-2xl border transition-all p-3.5 shadow-sm hover:shadow-md bg-white ${note.isPinned ? 'border-amber-400 ring-1 ring-amber-300/60' : 'border-slate-200'}`}
                                    >
                                        {/* Top Card Row */}
                                        <div className="flex items-start justify-between gap-2">
                                            <div className="flex items-center gap-1.5 flex-wrap">
                                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider flex items-center gap-1 ${colorConfig.badge}`}>
                                                    {catConfig.icon} {catConfig.label}
                                                </span>
                                                {note.isPinned && (
                                                    <span className="flex items-center gap-1 text-[10px] font-black uppercase text-amber-700 bg-amber-100/90 px-2 py-0.5 rounded-full">
                                                        <Pin size={10} className="fill-amber-600 text-amber-600" /> Pinned
                                                    </span>
                                                )}
                                                {note.isArchived && (
                                                    <span className="flex items-center gap-1 text-[10px] font-bold uppercase text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full">
                                                        <Archive size={10} /> In History
                                                    </span>
                                                )}
                                            </div>

                                            {/* Action Icon Buttons */}
                                            <div className="flex items-center gap-1">
                                                <button
                                                    type="button"
                                                    onClick={() => togglePin(note.id)}
                                                    title={note.isPinned ? 'Unpin' : 'Pin to top'}
                                                    className={`p-1 rounded-lg text-xs transition-colors ${note.isPinned ? 'text-amber-600 bg-amber-50 hover:bg-amber-100' : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100'}`}
                                                >
                                                    <Pin size={14} className={note.isPinned ? 'fill-amber-600' : ''} />
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => handleOpenEdit(note)}
                                                    title="Edit note"
                                                    className="p-1 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                                                >
                                                    <Edit3 size={14} />
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => toggleArchive(note.id)}
                                                    title={note.isArchived ? 'Restore to Active' : 'Move to History'}
                                                    className={`p-1 rounded-lg transition-colors ${note.isArchived ? 'text-emerald-600 hover:bg-emerald-50' : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100'}`}
                                                >
                                                    {note.isArchived ? <RotateCcw size={14} /> : <Archive size={14} />}
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => handleDeleteNote(note.id)}
                                                    title="Delete note"
                                                    className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
                                        </div>

                                        {/* Note Title (if present) */}
                                        {note.title && (
                                            <h4 className="text-sm font-black text-slate-800 mt-2">
                                                {note.title}
                                            </h4>
                                        )}

                                        {/* Note Content */}
                                        <p className="text-xs text-slate-700 whitespace-pre-wrap font-medium mt-1 leading-relaxed">
                                            {note.content}
                                        </p>

                                        {/* Card Footer: Author & Timestamp */}
                                        <div className="flex items-center justify-between text-[10px] text-slate-400 pt-2.5 mt-2 border-t border-slate-100">
                                            <span className="flex items-center gap-1">
                                                <Clock size={11} className="text-slate-400" />
                                                {formatNoteDate(note.createdAt)}
                                            </span>
                                            {note.authorName && (
                                                <span className="flex items-center gap-1 font-medium text-slate-500">
                                                    <User size={11} className="text-slate-400" />
                                                    {note.authorName}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Edit Note Modal */}
                {editingNote && (
                    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4" onClick={() => setEditingNote(null)}>
                        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
                        <form
                            onSubmit={handleSaveEdit}
                            onClick={(e) => e.stopPropagation()}
                            className="relative bg-white rounded-2xl w-full max-w-lg shadow-2xl p-5 border border-slate-200 space-y-3 z-10"
                        >
                            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                                <h3 className="text-sm font-black text-slate-800 flex items-center gap-2">
                                    <Edit3 size={16} className="text-amber-600" />
                                    Edit Note
                                </h3>
                                <button
                                    type="button"
                                    onClick={() => setEditingNote(null)}
                                    className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                                >
                                    <X size={18} />
                                </button>
                            </div>

                            <div>
                                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                                    Title (Optional)
                                </label>
                                <input
                                    type="text"
                                    value={editTitle}
                                    onChange={(e) => setEditTitle(e.target.value)}
                                    placeholder="Note title..."
                                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-sm font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:bg-white"
                                />
                            </div>

                            <div>
                                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                                    Content
                                </label>
                                <textarea
                                    value={editContent}
                                    onChange={(e) => setEditContent(e.target.value)}
                                    rows={4}
                                    required
                                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:bg-white resize-none"
                                />
                            </div>

                            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100">
                                <div className="flex items-center gap-2">
                                    <select
                                        value={editCategory}
                                        onChange={(e) => setEditCategory(e.target.value)}
                                        className="text-xs font-bold text-slate-700 bg-slate-100 border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none"
                                    >
                                        {NOTE_CATEGORIES.filter((c) => c.id !== 'all').map((cat) => (
                                            <option key={cat.id} value={cat.id}>
                                                {cat.icon} {cat.label}
                                            </option>
                                        ))}
                                    </select>

                                    <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg">
                                        {COLOR_OPTIONS.map((col) => (
                                            <button
                                                key={col.id}
                                                type="button"
                                                onClick={() => setEditColor(col.id)}
                                                className={`h-5 w-5 rounded-full ${col.dot} transition-transform ${editColor === col.id ? 'ring-2 ring-slate-800 scale-110' : 'hover:opacity-80'}`}
                                            />
                                        ))}
                                    </div>
                                </div>

                                <label className="flex items-center gap-1.5 text-xs font-bold text-slate-600 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={editPinned}
                                        onChange={(e) => setEditPinned(e.target.checked)}
                                        className="rounded text-amber-600 focus:ring-amber-500"
                                    />
                                    <Pin size={13} className={editPinned ? 'text-amber-600 fill-amber-600' : 'text-slate-400'} />
                                    Pinned
                                </label>
                            </div>

                            <div className="flex items-center justify-end gap-2 pt-3">
                                <button
                                    type="button"
                                    onClick={() => setEditingNote(null)}
                                    className="px-3 py-1.5 text-xs font-bold text-slate-500 hover:text-slate-800"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-black shadow-sm"
                                >
                                    Save Changes
                                </button>
                            </div>
                        </form>
                    </div>
                )}
            </div>
        </div>
    );
}
