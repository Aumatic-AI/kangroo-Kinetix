"use client";
import { useEffect, useMemo, useState } from "react";
import { Eye, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Dropdown } from "@/components/ui/Dropdown";
import { Pagination } from "@/components/ui/Pagination";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { PAGE_SIZE_COMPACT } from "@/lib/pagination";
import { formatDate } from "@/utils/datetime";
import { useListings } from "../hooks/useListings";
import { ListingDrawer } from "../components/ListingDrawer";
import { AddListingDrawer } from "../components/AddListingDrawer";
import { ListingStatusChip, ListingThumb } from "../components/ListingBits";
import type { ListingStatus } from "../types/listings.types";

const PAGE_SIZE = PAGE_SIZE_COMPACT;
const SEARCH_DEBOUNCE_MS = 300;

const STATUS_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
];

/** Mirrors the real columns — only the body shimmers; the header is known up front. */
function ListingsTableSkeleton() {
  return (
    <div className="border border-default rounded-lg overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Listing</TableHead>
            <TableHead>Category</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Last promoted</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: PAGE_SIZE }, (_, i) => (
            <TableRow key={i}>
              <TableCell>
                <div className="flex items-center gap-3">
                  <Skeleton className="w-9 h-9 rounded-lg shrink-0" />
                  <div className="space-y-1.5">
                    <Skeleton className="h-3.5 w-40 rounded" />
                    <Skeleton className="h-3 w-20 rounded" />
                  </div>
                </div>
              </TableCell>
              <TableCell><Skeleton className="h-3.5 w-28 rounded" /></TableCell>
              <TableCell><Skeleton className="h-5 w-16 rounded-full" /></TableCell>
              <TableCell><Skeleton className="h-3.5 w-24 rounded" /></TableCell>
              <TableCell><div className="flex justify-end"><Skeleton className="h-8 w-16 rounded-lg" /></div></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

/**
 * The property inventory the content automation rotates through. The table is
 * deliberately light — thumbnail, name, city, category, status, last promoted —
 * and opening a row shows every image and the full details (ListingDrawer).
 * Most listings come from the inventory import; "Add listing" covers one-off
 * additions (AddListingDrawer).
 */
export function ListingsPage() {
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [category, setCategory] = useState("all");
  const [selected, setSelected] = useState<{ id: string; title: string } | null>(null);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => { setSearch(query.trim()); setPage(1); }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [query]);

  const { data, isLoading, error } = useListings({
    page,
    limit: PAGE_SIZE,
    search: search || undefined,
    status: status === "all" ? undefined : (status as ListingStatus),
    category: category === "all" ? undefined : category,
  });

  const categoryOptions = useMemo(
    () => [{ value: "all", label: "All categories" }, ...(data?.categories ?? []).map((c) => ({ value: c, label: c }))],
    [data?.categories],
  );
  const total = data ? data.counts.active + data.counts.inactive : 0;
  const filtered = search !== "" || status !== "all" || category !== "all";

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-10">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-text">Listings</h2>
          <p className="text-sm text-muted mt-1">
            The properties and venues Kangrooo promotes. Open one to see its images and full details.
            {data && total > 0 && <> {total} listing{total === 1 ? "" : "s"} · {data.counts.active} active.</>}
          </p>
        </div>
        <Button icon={<Plus />} onClick={() => setAdding(true)} className="shrink-0">Add listing</Button>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-muted absolute left-3 top-1/2 -translate-y-1/2" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, city or category…"
            className="pl-9"
            aria-label="Search listings"
          />
        </div>
        <Dropdown options={STATUS_OPTIONS} value={status} onValueChange={(v) => { setStatus(v); setPage(1); }} className="w-44 shrink-0" />
        <Dropdown options={categoryOptions} value={category} onValueChange={(v) => { setCategory(v); setPage(1); }} className="w-56 shrink-0" />
      </div>

      {isLoading ? (
        <ListingsTableSkeleton />
      ) : error ? (
        <div className="py-16 text-center border border-default rounded-2xl border-dashed">
          <p className="text-sm text-danger font-medium">{error.message}</p>
        </div>
      ) : !data || data.listings.length === 0 ? (
        <div className="py-16 text-center border border-default rounded-2xl border-dashed space-y-2">
          <p className="text-sm text-muted">
            {filtered ? "No listings match these filters." : "No listings yet — import the property inventory or add one with \"Add listing\"."}
          </p>
        </div>
      ) : (
        <>
          <div className="border border-default rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Listing</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last promoted</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.listings.map((l) => (
                  <TableRow
                    key={l.id}
                    className="cursor-pointer"
                    tabIndex={0}
                    onClick={() => setSelected({ id: l.id, title: l.title })}
                    onKeyDown={(e) => { if (e.key === "Enter") setSelected({ id: l.id, title: l.title }); }}
                  >
                    <TableCell>
                      <div className="flex items-center gap-3 min-w-0">
                        <ListingThumb url={l.thumbnailUrl} />
                        <div className="min-w-0">
                          <p className="font-semibold text-text truncate">{l.title}</p>
                          <p className="text-xs text-muted truncate">{l.city ?? "Location unknown"}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted">{l.spaceCategory ?? "—"}</TableCell>
                    <TableCell><ListingStatusChip status={l.status} /></TableCell>
                    <TableCell className="text-muted">{l.lastPromotedAt ? formatDate(l.lastPromotedAt) : "Never"}</TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end">
                        <Button size="sm" variant="outline" icon={<Eye className="w-3.5 h-3.5" />} onClick={(e) => { e.stopPropagation(); setSelected({ id: l.id, title: l.title }); }}>
                          View
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <Pagination page={data.pagination.page} totalPages={data.pagination.totalPages} onPageChange={setPage} />
        </>
      )}

      <ListingDrawer listingId={selected?.id ?? null} title={selected?.title} onClose={() => setSelected(null)} />
      <AddListingDrawer open={adding} onOpenChange={setAdding} categories={data?.categories ?? []} onCreated={setSelected} />
    </div>
  );
}
