import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { 
  ArrowUp12Regular, 
  ArrowDown12Regular, 
  Settings20Regular,
  Checkmark16Regular
} from "@fluentui/react-icons";
import { cn } from "../../../lib/cn";
import type { SortField, SortDirection, ViewMode } from "../../../store/uiStore";
import { useUIStore } from "../../../store/uiStore";

export interface ExplorerControlsProps {
  sortField: SortField;
  sortDirection: SortDirection;
  viewMode: ViewMode;
  onSortChange: (field: SortField, direction: SortDirection) => void;
  className?: string;
}

const SORT_FIELDS: { field: SortField; label: string }[] = [
  { field: "name", label: "Name" },
  { field: "date", label: "Date" },
  { field: "size", label: "Size" },
];

const COLUMNS = [
  { id: "size", label: "Size" },
  { id: "type", label: "Type" },
  { id: "modified", label: "Modified Date" },
  { id: "created", label: "Created Date" },
  { id: "items", label: "Contents Count" },
];

export function ExplorerControls({ 
  sortField, 
  sortDirection, 
  viewMode,
  onSortChange, 
  className 
}: ExplorerControlsProps) {
  const visibleColumns = useUIStore((s) => s.visibleColumns);
  const toggleColumn = useUIStore((s) => s.toggleColumn);

  const handleFieldClick = (f: SortField) => {
    if (f === sortField) {
      onSortChange(f, sortDirection === "asc" ? "desc" : "asc");
    } else {
      onSortChange(f, "asc");
    }
  };

  const Arrow = sortDirection === "asc" ? ArrowUp12Regular : ArrowDown12Regular;

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button
            type="button"
            className={cn(
              "flex items-center gap-2 px-3 h-8 rounded-[var(--tv-radius-sm)]",
              "bg-transparent hover:bg-[rgba(255,255,255,0.06)] active:bg-[rgba(255,255,255,0.1)]",
              "text-[var(--tv-text-secondary)] hover:text-[var(--tv-text-primary)]",
              "transition-colors duration-[120ms] border border-[var(--tv-border-subtle)] cursor-pointer outline-none",
              "focus-visible:ring-1 focus-visible:ring-[var(--tv-accent-primary)]"
            )}
            style={{ font: "var(--tv-type-label-sm)" }}
          >
            <Settings20Regular style={{ width: 16, height: 16 }} />
            <span>Options</span>
          </button>
        </DropdownMenu.Trigger>

        <DropdownMenu.Portal>
          <DropdownMenu.Content
            className={cn(
              "z-50 min-w-[180px] p-1 bg-[var(--tv-bg-elevated)] backdrop-blur-md",
              "border border-[var(--tv-border-subtle)] rounded-[var(--tv-radius-md)]",
              "shadow-xl animate-in fade-in zoom-in-95 duration-100"
            )}
            sideOffset={4}
            align="end"
          >
            <DropdownMenu.Label className="px-2 py-1.5 text-[11px] font-bold uppercase tracking-wider text-[var(--tv-text-disabled)]">
              Sort By
            </DropdownMenu.Label>
            {SORT_FIELDS.map(({ field: f, label }) => {
              const isActive = sortField === f;
              return (
                <DropdownMenu.Item
                  key={f}
                  onClick={() => handleFieldClick(f)}
                  className={cn(
                    "relative flex items-center gap-2 px-2 py-1.5 rounded-[var(--tv-radius-sm)]",
                    "text-[var(--tv-text-primary)] cursor-pointer outline-none",
                    "hover:bg-[rgba(255,255,255,0.08)] focus:bg-[rgba(255,255,255,0.08)]",
                    "transition-colors duration-75"
                  )}
                  style={{ font: "var(--tv-type-body-sm)" }}
                >
                  <div className="w-4 flex items-center justify-center">
                    {isActive && <Checkmark16Regular style={{ width: 14, height: 14 }} />}
                  </div>
                  <span className="flex-1">{label}</span>
                  {isActive && <Arrow className="text-[var(--tv-text-secondary)]" style={{ width: 12, height: 12 }} />}
                </DropdownMenu.Item>
              );
            })}

            {viewMode === "details" && (
              <>
                <DropdownMenu.Separator className="h-px bg-[var(--tv-border-subtle)] my-1" />

                <DropdownMenu.Label className="px-2 py-1.5 text-[11px] font-bold uppercase tracking-wider text-[var(--tv-text-disabled)]">
                  Display Columns
                </DropdownMenu.Label>
                {COLUMNS.map(({ id, label }) => {
                  const isVisible = visibleColumns.includes(id) || id === "name";
                  return (
                    <DropdownMenu.CheckboxItem
                      key={id}
                      disabled={id === "name"}
                      checked={isVisible}
                      onCheckedChange={() => toggleColumn(id)}
                      className={cn(
                        "relative flex items-center gap-2 px-2 py-1.5 rounded-[var(--tv-radius-sm)]",
                        "text-[var(--tv-text-primary)] cursor-pointer outline-none",
                        "hover:bg-[rgba(255,255,255,0.08)] focus:bg-[rgba(255,255,255,0.08)]",
                        "disabled:pointer-events-none disabled:opacity-50",
                        "transition-colors duration-75"
                      )}
                      style={{ font: "var(--tv-type-body-sm)" }}
                    >
                      <div className="w-4 flex items-center justify-center">
                        {isVisible && <Checkmark16Regular style={{ width: 14, height: 14 }} />}
                      </div>
                      <span>{label}</span>
                    </DropdownMenu.CheckboxItem>
                  );
                })}
              </>
            )}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </div>
  );
}
