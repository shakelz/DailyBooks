import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from './AuthContext';

const NotesContext = createContext(null);

function cleanText(value) {
    return typeof value === 'string' ? value.trim() : '';
}

function parseIsoTimestamp(value) {
    const raw = cleanText(value);
    if (!raw) return '';
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) return '';
    return parsed.toISOString();
}

function normalizeNoteRecord(record = {}) {
    const id = cleanText(record?.id || record?.note_id) || String(record?.id || Date.now());
    const shopId = cleanText(record?.shop_id || record?.shopId || '');
    const title = cleanText(record?.title || '');
    const content = cleanText(record?.content || record?.text || record?.notes || record?.body || '');
    const category = cleanText(record?.category || record?.tag || 'general') || 'general';
    const color = cleanText(record?.color || 'amber') || 'amber';
    const isPinned = Boolean(record?.is_pinned ?? record?.isPinned ?? record?.pinned ?? false);
    const isArchived = Boolean(record?.is_archived ?? record?.isArchived ?? record?.archived ?? false);
    const authorName = cleanText(record?.author_name || record?.authorName || record?.author || record?.user_name || '');
    const createdBy = cleanText(record?.created_by || record?.createdBy || '');
    const createdAt = parseIsoTimestamp(record?.created_at || record?.createdAt || record?.timestamp) || new Date().toISOString();
    const updatedAt = parseIsoTimestamp(record?.updated_at || record?.updatedAt || createdAt) || createdAt;

    return {
        id,
        shopId,
        shop_id: shopId,
        title,
        content,
        category,
        color,
        isPinned,
        is_pinned: isPinned,
        isArchived,
        is_archived: isArchived,
        authorName,
        author_name: authorName,
        createdBy,
        created_by: createdBy,
        createdAt,
        created_at: createdAt,
        updatedAt,
        updated_at: updatedAt,
    };
}

function sortNotes(notesList = []) {
    return [...notesList].sort((a, b) => {
        // Pinned notes first
        if (a.isPinned !== b.isPinned) {
            return a.isPinned ? -1 : 1;
        }
        // Then newest created first
        const aMs = Date.parse(a?.createdAt || a?.created_at || '');
        const bMs = Date.parse(b?.createdAt || b?.created_at || '');
        return (Number.isFinite(bMs) ? bMs : 0) - (Number.isFinite(aMs) ? aMs : 0);
    });
}

function getLocalCacheKey(shopId) {
    return `dailybooks_notes_${cleanText(shopId)}`;
}

function readLocalNotesCache(shopId) {
    if (typeof window === 'undefined') return [];
    try {
        const raw = localStorage.getItem(getLocalCacheKey(shopId));
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
            return parsed.map(normalizeNoteRecord);
        }
    } catch {
        // fallback
    }
    return [];
}

function writeLocalNotesCache(shopId, notesList = []) {
    if (typeof window === 'undefined') return;
    try {
        localStorage.setItem(getLocalCacheKey(shopId), JSON.stringify(notesList));
    } catch {
        // storage quota exceeded or private mode
    }
}

function mergeNotes(dbNotes = [], cachedNotes = []) {
    const map = new Map();
    (Array.isArray(cachedNotes) ? cachedNotes : []).forEach((n) => {
        if (n && n.id) map.set(String(n.id), normalizeNoteRecord(n));
    });
    (Array.isArray(dbNotes) ? dbNotes : []).forEach((n) => {
        if (n && n.id) map.set(String(n.id), normalizeNoteRecord(n));
    });
    return sortNotes([...map.values()]);
}

export function NotesProvider({ children }) {
    const { activeShopId, user } = useAuth();
    const [notes, setNotes] = useState([]);
    const [notesLoaded, setNotesLoaded] = useState(false);
    const notesChannelRef = useRef(null);

    const broadcastNoteSync = useCallback((payload) => {
        const channel = notesChannelRef.current;
        if (!channel) return Promise.resolve(null);
        return channel.send({
            type: 'broadcast',
            event: 'note_sync',
            payload,
        });
    }, []);

    // Fetch notes from Supabase or LocalStorage cache
    useEffect(() => {
        const sid = cleanText(activeShopId);
        if (!sid) {
            setNotes([]);
            setNotesLoaded(false);
            return undefined;
        }

        let cancelled = false;
        const initialCached = readLocalNotesCache(sid);
        if (initialCached && initialCached.length > 0) {
            setNotes(sortNotes(initialCached));
        }

        const fetchNotesFromDb = async () => {
            try {
                const { data, error } = await supabase
                    .from('notes')
                    .select('*')
                    .eq('shop_id', sid)
                    .order('created_at', { ascending: false });

                if (cancelled) return;

                const currentCache = readLocalNotesCache(sid);

                if (!error && Array.isArray(data)) {
                    const dbNormalized = data.map(normalizeNoteRecord);
                    const merged = mergeNotes(dbNormalized, currentCache);
                    setNotes(merged);
                    writeLocalNotesCache(sid, merged);

                    // Auto-sync any notes in local cache that aren't yet in DB
                    const dbIds = new Set(dbNormalized.map((n) => String(n.id)));
                    const missingInDb = currentCache.filter((n) => !dbIds.has(String(n.id)));
                    if (missingInDb.length > 0) {
                        for (const pendingNote of missingInDb) {
                            supabase.from('notes').upsert([{
                                id: pendingNote.id,
                                shop_id: sid,
                                title: pendingNote.title || null,
                                content: pendingNote.content,
                                category: pendingNote.category,
                                color: pendingNote.color,
                                is_pinned: pendingNote.isPinned,
                                is_archived: pendingNote.isArchived,
                                author_name: pendingNote.authorName || null,
                                created_by: pendingNote.createdBy || null,
                                created_at: pendingNote.createdAt,
                                updated_at: pendingNote.updatedAt,
                            }]).then();
                        }
                    }
                } else if (error) {
                    console.warn('Notes table query notice:', error.message);
                    if (currentCache && currentCache.length > 0) {
                        setNotes(sortNotes(currentCache));
                    }
                }
            } catch (err) {
                console.warn('Notes fetch error:', err);
            } finally {
                if (!cancelled) {
                    setNotesLoaded(true);
                }
            }
        };

        fetchNotesFromDb();

        // Realtime Subscription
        const shopFilter = `shop_id=eq.${sid}`;
        const channel = supabase.channel(`public:notes:${sid}`)
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notes', filter: shopFilter }, (payload) => {
                const incoming = normalizeNoteRecord(payload.new);
                setNotes((prev) => {
                    const exists = prev.some((n) => String(n.id) === String(incoming.id));
                    const next = exists ? prev.map((n) => String(n.id) === String(incoming.id) ? incoming : n) : [incoming, ...prev];
                    const sorted = sortNotes(next);
                    writeLocalNotesCache(sid, sorted);
                    return sorted;
                });
            })
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'notes', filter: shopFilter }, (payload) => {
                const incoming = normalizeNoteRecord(payload.new);
                setNotes((prev) => {
                    const next = prev.map((n) => String(n.id) === String(incoming.id) ? incoming : n);
                    const sorted = sortNotes(next);
                    writeLocalNotesCache(sid, sorted);
                    return sorted;
                });
            })
            .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'notes', filter: shopFilter }, (payload) => {
                const deletedId = String(payload.old?.id || payload.old?.note_id || '');
                setNotes((prev) => {
                    const next = prev.filter((n) => String(n.id) !== deletedId);
                    writeLocalNotesCache(sid, next);
                    return next;
                });
            })
            .on('broadcast', { event: 'note_sync' }, ({ payload }) => {
                if (!payload || !payload.action) return;
                const { action, data } = payload;
                if (action === 'INSERT' && data) {
                    const incoming = normalizeNoteRecord(data);
                    setNotes((prev) => {
                        if (prev.some((n) => String(n.id) === String(incoming.id))) return prev;
                        const next = sortNotes([incoming, ...prev]);
                        writeLocalNotesCache(sid, next);
                        return next;
                    });
                } else if (action === 'UPDATE' && data) {
                    const incoming = normalizeNoteRecord(data);
                    setNotes((prev) => {
                        const next = sortNotes(prev.map((n) => String(n.id) === String(incoming.id) ? incoming : n));
                        writeLocalNotesCache(sid, next);
                        return next;
                    });
                } else if (action === 'DELETE' && data?.id) {
                    setNotes((prev) => {
                        const next = prev.filter((n) => String(n.id) !== String(data.id));
                        writeLocalNotesCache(sid, next);
                        return next;
                    });
                }
            })
            .subscribe();

        notesChannelRef.current = channel;

        return () => {
            cancelled = true;
            if (notesChannelRef.current === channel) {
                notesChannelRef.current = null;
            }
            supabase.removeChannel(channel);
        };
    }, [activeShopId]);

    const addNote = useCallback(async (noteInput = {}) => {
        const sid = cleanText(activeShopId);
        if (!sid) throw new Error('No active shop selected');

        const nowIso = new Date().toISOString();
        const generatedId = `note_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        const authorName = cleanText(user?.name || user?.full_name || user?.email?.split('@')[0] || 'Staff');
        const createdBy = cleanText(user?.id || '');

        const newNote = normalizeNoteRecord({
            id: generatedId,
            shop_id: sid,
            title: cleanText(noteInput.title),
            content: cleanText(noteInput.content),
            category: cleanText(noteInput.category) || 'general',
            color: cleanText(noteInput.color) || 'amber',
            is_pinned: Boolean(noteInput.isPinned || noteInput.is_pinned),
            is_archived: false,
            author_name: authorName,
            created_by: createdBy,
            created_at: nowIso,
            updated_at: nowIso,
        });

        if (!newNote.content && !newNote.title) {
            throw new Error('Note content or title is required');
        }

        // Optimistic UI update
        setNotes((prev) => {
            const next = sortNotes([newNote, ...prev]);
            writeLocalNotesCache(sid, next);
            return next;
        });

        // Save to Supabase
        const dbPayload = {
            id: newNote.id,
            shop_id: sid,
            title: newNote.title || null,
            content: newNote.content,
            category: newNote.category,
            color: newNote.color,
            is_pinned: newNote.isPinned,
            is_archived: newNote.isArchived,
            author_name: newNote.authorName || null,
            created_by: newNote.createdBy || null,
            created_at: newNote.createdAt,
            updated_at: newNote.updatedAt,
        };

        try {
            const { error } = await supabase.from('notes').upsert([dbPayload]);
            if (error) {
                console.warn('Supabase upsert note notice (persisted in local cache):', error.message);
            }
        } catch (err) {
            console.warn('Supabase upsert note network error:', err);
        }

        broadcastNoteSync({ action: 'INSERT', data: newNote }).catch(() => {});
        return newNote;
    }, [activeShopId, broadcastNoteSync, user]);

    const updateNote = useCallback(async (id, fields = {}) => {
        const sid = cleanText(activeShopId);
        if (!sid) return;

        const strId = cleanText(id);
        if (!strId) return;

        const nowIso = new Date().toISOString();
        let updatedRecord = null;

        setNotes((prev) => {
            const next = prev.map((item) => {
                if (String(item.id) !== strId) return item;
                const merged = normalizeNoteRecord({
                    ...item,
                    ...fields,
                    id: strId,
                    shop_id: sid,
                    updated_at: nowIso,
                });
                updatedRecord = merged;
                return merged;
            });
            const sorted = sortNotes(next);
            writeLocalNotesCache(sid, sorted);
            return sorted;
        });

        if (!updatedRecord) return;

        const dbPatch = {
            updated_at: nowIso,
        };
        if (fields.title !== undefined) dbPatch.title = cleanText(fields.title) || null;
        if (fields.content !== undefined) dbPatch.content = cleanText(fields.content);
        if (fields.category !== undefined) dbPatch.category = cleanText(fields.category) || 'general';
        if (fields.color !== undefined) dbPatch.color = cleanText(fields.color) || 'amber';
        if (fields.isPinned !== undefined || fields.is_pinned !== undefined) {
            dbPatch.is_pinned = Boolean(fields.isPinned ?? fields.is_pinned);
        }
        if (fields.isArchived !== undefined || fields.is_archived !== undefined) {
            dbPatch.is_archived = Boolean(fields.isArchived ?? fields.is_archived);
        }

        try {
            const { error } = await supabase
                .from('notes')
                .update(dbPatch)
                .eq('id', strId)
                .eq('shop_id', sid);

            if (error) {
                console.warn('Supabase update note notice:', error.message);
            }
        } catch (err) {
            console.warn('Supabase update note network error:', err);
        }

        broadcastNoteSync({ action: 'UPDATE', data: updatedRecord }).catch(() => {});
        return updatedRecord;
    }, [activeShopId, broadcastNoteSync]);

    const deleteNote = useCallback(async (id) => {
        const sid = cleanText(activeShopId);
        if (!sid) return;

        const strId = cleanText(id);
        if (!strId) return;

        setNotes((prev) => {
            const next = prev.filter((item) => String(item.id) !== strId);
            writeLocalNotesCache(sid, next);
            return next;
        });

        try {
            await supabase
                .from('notes')
                .delete()
                .eq('id', strId)
                .eq('shop_id', sid);
        } catch (err) {
            console.warn('Supabase delete note error:', err);
        }

        broadcastNoteSync({ action: 'DELETE', data: { id: strId, shop_id: sid } }).catch(() => {});
    }, [activeShopId, broadcastNoteSync]);

    const togglePin = useCallback(async (id) => {
        const target = notes.find((n) => String(n.id) === String(id));
        if (!target) return;
        return updateNote(id, { isPinned: !target.isPinned });
    }, [notes, updateNote]);

    const toggleArchive = useCallback(async (id) => {
        const target = notes.find((n) => String(n.id) === String(id));
        if (!target) return;
        return updateNote(id, { isArchived: !target.isArchived });
    }, [notes, updateNote]);

    const value = {
        notes,
        notesLoaded,
        addNote,
        updateNote,
        deleteNote,
        togglePin,
        toggleArchive,
    };

    return (
        <NotesContext.Provider value={value}>
            {children}
        </NotesContext.Provider>
    );
}

export function useNotes() {
    const context = useContext(NotesContext);
    if (!context) {
        throw new Error('useNotes must be used within a NotesProvider');
    }
    return context;
}
