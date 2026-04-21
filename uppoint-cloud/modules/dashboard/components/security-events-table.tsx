"use client";

import { useMemo, useState } from "react";
import { Search, ShieldAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Locale } from "@/modules/i18n/config";
import type { Dictionary } from "@/modules/i18n/dictionaries";

interface SecurityEventTableRow {
  id: string;
  action: string;
  result: string | null;
  reason: string | null;
  requestId: string | null;
  ip: string | null;
  userAgent: string | null;
  createdAtIso: string;
  actionLabel: string;
  device: string;
}

interface SecurityEventsTableProps {
  locale: Locale;
  labels: Dictionary["dashboard"]["security"];
  events: SecurityEventTableRow[];
  auditFailures24h: number;
}

const EVENTS_PER_PAGE = 5;

function resolveEventColor(result: string | null, action: string): string {
  if (result === "FAILURE" || action.includes("failed") || action.includes("denied")) {
    return "corp-dot-danger";
  }

  if (result === "SUCCESS" || action.includes("success") || action.includes("verified")) {
    return "corp-dot-success";
  }

  if (action.includes("otp") || action.includes("challenge")) {
    return "corp-dot-warning";
  }

  return "corp-dot-info";
}

export function SecurityEventsTable({
  locale,
  labels,
  events,
  auditFailures24h,
}: SecurityEventsTableProps) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);

  const filteredEvents = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      return events;
    }

    return events.filter(
      (event) =>
        event.actionLabel.toLowerCase().includes(normalizedQuery) ||
        (event.reason ?? "").toLowerCase().includes(normalizedQuery) ||
        (event.ip ?? "").toLowerCase().includes(normalizedQuery) ||
        event.device.toLowerCase().includes(normalizedQuery),
    );
  }, [events, query]);

  const totalPages = Math.max(1, Math.ceil(filteredEvents.length / EVENTS_PER_PAGE));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * EVENTS_PER_PAGE;
  const pagedEvents = filteredEvents.slice(pageStart, pageStart + EVENTS_PER_PAGE);

  return (
    <section className="corp-surface corp-surface-pad">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h3 className="corp-section-title">{labels.eventsTitle}</h3>
          <p className="corp-body-muted">{labels.eventsDescription}</p>
        </div>
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(1);
            }}
            placeholder={labels.searchPlaceholder}
            className="corp-input pl-9"
          />
        </div>
      </div>

      <div className="mt-4 overflow-x-auto rounded-xl border border-border/60">
        <table className="corp-table">
          <thead className="corp-table-head bg-background/80">
            <tr>
              <th className="corp-table-cell text-left">{labels.columns.date}</th>
              <th className="corp-table-cell text-left">{labels.columns.event}</th>
              <th className="corp-table-cell text-left">{labels.columns.ip}</th>
              <th className="corp-table-cell text-left">{labels.columns.device}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {pagedEvents.length === 0 ? (
              <tr>
                <td colSpan={4} className="corp-table-cell py-6">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <ShieldAlert className="h-4 w-4" />
                    <span>{labels.noEvents}</span>
                  </div>
                </td>
              </tr>
            ) : (
              pagedEvents.map((event) => (
                <tr key={event.id} className="corp-table-row">
                  <td className="corp-table-cell align-top">
                    <div className="font-medium">
                      {new Intl.DateTimeFormat(locale === "tr" ? "tr-TR" : "en-US", {
                        dateStyle: "medium",
                      }).format(new Date(event.createdAtIso))}
                    </div>
                    <div className="corp-field-hint">
                      {new Intl.DateTimeFormat(locale === "tr" ? "tr-TR" : "en-US", {
                        timeStyle: "medium",
                      }).format(new Date(event.createdAtIso))}
                    </div>
                  </td>
                  <td className="corp-table-cell">
                    <div className="flex items-center gap-2">
                      <span className={`h-2 w-2 rounded-full ${resolveEventColor(event.result, event.action)}`} />
                      <span className="font-medium">{event.actionLabel}</span>
                    </div>
                    {event.reason ? (
                      <p className="corp-field-hint mt-1">{event.reason}</p>
                    ) : null}
                  </td>
                  <td className="corp-table-cell font-mono text-[13px]">{event.ip ?? labels.unknownIp}</td>
                  <td className="corp-table-cell">{event.device}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex items-center justify-between">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="corp-btn-sm"
          disabled={currentPage <= 1}
          onClick={() => setPage((current) => Math.max(1, current - 1))}
        >
          {labels.paginationPrev}
        </Button>
        <p className="corp-body-muted">
          {labels.paginationPage}: {currentPage} / {totalPages}
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="corp-btn-sm"
          disabled={currentPage >= totalPages}
          onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
        >
          {labels.paginationNext}
        </Button>
      </div>

      <p className="corp-field-hint mt-3">
        {labels.failures24h}: {auditFailures24h}
      </p>
    </section>
  );
}
