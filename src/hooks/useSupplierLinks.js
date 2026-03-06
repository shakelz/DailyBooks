import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';

function normalizeLinkUrl(url = '') {
  const raw = String(url || '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  return `https://${raw}`;
}

function normalizeSupplierLink(row = {}) {
  return {
    id: row?.link_id || row?.id,
    title: String(row?.title || '').trim(),
    url: String(row?.url || '').trim(),
    createdAt: row?.created_at || row?.createdAt || null,
    updatedAt: row?.updated_at || row?.updatedAt || null,
    shopId: row?.shop_id || row?.shopId || null,
  };
}

async function insertSupplierLink(payload) {
  return supabase
    .from('supplier_links')
    .insert(payload)
    .select('*')
    .single();
}

async function updateSupplierLink(linkId, payload) {
  return supabase
    .from('supplier_links')
    .update({
      title: payload.title,
      url: payload.url,
      updated_at: new Date().toISOString(),
    })
    .eq('link_id', linkId)
    .eq('shop_id', payload.shop_id)
    .select('*')
    .single();
}

export function useSupplierLinks(shopId) {
  const [links, setLinks] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchLinks = useCallback(async () => {
    if (!shopId) {
      setLinks([]);
      return;
    }

    setLoading(true);
    const result = await supabase
      .from('supplier_links')
      .select('*')
      .eq('shop_id', String(shopId))
      .order('created_at', { ascending: false, nullsFirst: false });

    if (result.error) {
      setLoading(false);
      return;
    }

    const next = Array.isArray(result.data)
      ? result.data.map(normalizeSupplierLink).filter((row) => row.title && row.url)
      : [];
    setLinks(next);
    setLoading(false);
  }, [shopId]);

  useEffect(() => {
    fetchLinks();
  }, [fetchLinks]);

  const addLink = useCallback(async ({ title, url }) => {
    const cleanTitle = String(title || '').trim();
    const cleanUrl = normalizeLinkUrl(url);
    if (!shopId || !cleanTitle || !cleanUrl) {
      return { error: new Error('Title and URL are required.') };
    }

    const tempId = `temp-${Date.now()}`;
    const optimisticRow = {
      id: tempId,
      title: cleanTitle,
      url: cleanUrl,
      createdAt: new Date().toISOString(),
      shopId: String(shopId),
    };

    setLinks((prev) => [optimisticRow, ...prev]);

    const inserted = await insertSupplierLink({
      shop_id: String(shopId),
      title: cleanTitle,
      url: cleanUrl,
    });

    if (inserted.error || !inserted.data) {
      setLinks((prev) => prev.filter((row) => String(row.id) !== tempId));
      return { error: inserted.error || new Error('Failed to save link.') };
    }

    const normalized = normalizeSupplierLink(inserted.data);
    setLinks((prev) => prev.map((row) => (String(row.id) === tempId ? normalized : row)));
    return { data: normalized };
  }, [shopId]);

  const updateLink = useCallback(async (linkId, { title, url }) => {
    const cleanTitle = String(title || '').trim();
    const cleanUrl = normalizeLinkUrl(url);
    if (!shopId || !linkId || !cleanTitle || !cleanUrl) {
      return { error: new Error('Title and URL are required.') };
    }

    const previousRow = links.find((row) => String(row.id) === String(linkId));
    const optimisticRow = {
      ...(previousRow || {}),
      id: linkId,
      title: cleanTitle,
      url: cleanUrl,
      shopId: String(shopId),
    };

    setLinks((prev) => prev.map((row) => (String(row.id) === String(linkId) ? optimisticRow : row)));

    const updated = await updateSupplierLink(linkId, {
      shop_id: String(shopId),
      title: cleanTitle,
      url: cleanUrl,
    });

    if (updated.error || !updated.data) {
      if (previousRow) {
        setLinks((prev) => prev.map((row) => (String(row.id) === String(linkId) ? previousRow : row)));
      }
      return { error: updated.error || new Error('Failed to update link.') };
    }

    const normalized = normalizeSupplierLink(updated.data);
    setLinks((prev) => prev.map((row) => (String(row.id) === String(linkId) ? normalized : row)));
    return { data: normalized };
  }, [shopId, links]);

  const deleteLink = useCallback(async (linkId) => {
    if (!shopId || !linkId) {
      return { error: new Error('Missing link identifier.') };
    }

    const previous = links;
    setLinks((prev) => prev.filter((row) => String(row.id) !== String(linkId)));

    const result = await supabase
      .from('supplier_links')
      .delete()
      .eq('link_id', linkId)
      .eq('shop_id', String(shopId));

    if (result.error) {
      setLinks(previous);
      return { error: result.error };
    }

    return { data: true };
  }, [shopId, links]);

  return {
    links,
    loading,
    addLink,
    updateLink,
    deleteLink,
    refreshLinks: fetchLinks,
  };
}
