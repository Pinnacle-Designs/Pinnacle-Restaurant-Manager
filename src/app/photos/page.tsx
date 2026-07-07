"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { PageHeader } from "@/components/ui";
import { PageSectionShell, PageSection } from "@/components/layout/PageSections";
import { PhotoUploader } from "@/components/photos/PhotoUploader";
import { PhotoGallery } from "@/components/insights/InsightPanel";
import { PHOTO_CATEGORIES } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { useAuth } from "@/components/auth/AuthProvider";
import { filterBySearchQuery } from "@/lib/search/text-match";
import { usePageSearch } from "@/hooks/usePageSearch";
import { clientFetch } from "@/lib/embed-api-client";

interface Photo {
  id: string;
  url: string;
  title: string | null;
  category: string;
  aiAnalysis: string | null;
  createdAt: string;
}

export default function PhotosPage() {
  const { can } = useAuth();
  const canViewReceipts = can("view_receipts");
  const canManageInventory = can("manage_inventory");
  const visibleCategories = PHOTO_CATEGORIES.filter((cat) => {
    if (cat.value === "RECEIPT" && !canViewReceipts) return false;
    if (cat.value === "VENDOR_INVOICE" && !canManageInventory) return false;
    return true;
  });

  const [photos, setPhotos] = useState<Photo[]>([]);
  const [categoryFilter, setCategoryFilter] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);
  const { query } = usePageSearch();

  const visiblePhotos = useMemo(() => {
    const byCategory = categoryFilter
      ? photos.filter((p) => p.category === categoryFilter)
      : photos;
    return filterBySearchQuery(byCategory, query, (photo) => [
      photo.title,
      photo.category,
      photo.aiAnalysis,
    ]);
  }, [photos, categoryFilter, query]);

  const fetchPhotos = useCallback(async () => {
    const res = await clientFetch("/api/photos");
    const data = await res.json();
    setPhotos(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchPhotos();
  }, [fetchPhotos]);

  const categoryCounts = visibleCategories.map((cat) => ({
    ...cat,
    count: photos.filter((p) => p.category === cat.value).length,
  }));

  return (
    <div>
      <PageHeader
        title="Photo Library"
        description="Capture and organize photos by category — menu, inventory, receipts, and more"
      />

      <PageSectionShell pageId="photos">
        <PageSection id="photos-overview" title="Library overview" defaultOpen>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border bg-white p-4 text-center">
              <p className="text-2xl font-bold text-slate-900">{photos.length}</p>
              <p className="text-xs text-slate-500">Total photos</p>
            </div>
            {categoryCounts.slice(0, 3).map((cat) => (
              <div key={cat.value} className="rounded-xl border bg-white p-4 text-center">
                <p className="text-2xl font-bold text-orange-600">{cat.count}</p>
                <p className="text-xs text-slate-500">{cat.label}</p>
              </div>
            ))}
          </div>
        </PageSection>

        <PageSection id="photos-upload" title="Upload photos">
          <PhotoUploader
            onUploadComplete={fetchPhotos}
            excludeCategories={[
              ...(canViewReceipts ? [] : ["RECEIPT"]),
              ...(canManageInventory ? [] : ["VENDOR_INVOICE"]),
            ]}
          />
        </PageSection>

        <PageSection
          id="photos-gallery"
          title="Photo gallery"
          description={
            categoryFilter
              ? `${visiblePhotos.length} photo${visiblePhotos.length === 1 ? "" : "s"} in selected category`
              : `${visiblePhotos.length} photo${visiblePhotos.length === 1 ? "" : "s"}`
          }
        >
          <div className="mb-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setCategoryFilter(undefined)}
              className={cn(
                "rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
                !categoryFilter
                  ? "bg-orange-500 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              )}
            >
              All ({photos.length})
            </button>
            {categoryCounts.map((cat) => (
              <button
                key={cat.value}
                type="button"
                onClick={() => setCategoryFilter(cat.value)}
                className={cn(
                  "rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
                  categoryFilter === cat.value
                    ? "bg-orange-500 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                )}
              >
                {cat.label} ({cat.count})
              </button>
            ))}
          </div>

          {loading ? (
            <p className="text-sm text-slate-500">Loading photos...</p>
          ) : (
            <PhotoGallery photos={visiblePhotos} categoryFilter={undefined} />
          )}
        </PageSection>
      </PageSectionShell>
    </div>
  );
}
