import { useState, useRef, useEffect } from "react";
import {
  Add20Regular,
  Delete20Regular,
  ArrowDownload20Regular,
  Settings20Regular,
  Search20Regular,
  Document20Regular,
} from "@fluentui/react-icons";
import { useThemeStore } from "../store/themeStore";
import {
  Button,
  IconButton,
  Input,
  Checkbox,
  Badge,
  Tooltip,
  Spinner,
  Kbd,
  Separator,
  Navbar,
  Sidebar,
  Breadcrumb,
  FolderTree,
  StorageIndicator,
  // Phase 5
  FileIcon,
  FolderIcon,
  ColorSwatchRow,
  FileCard,
  FolderCard,
  FileRow,
  FolderRow,
  FileGrid,
  FileList,
  FileDetails,
  ViewToggle,
  SortBar,
  EmptyState,
  SelectionBar,
  FileSkeleton,
  FolderSkeleton,
  RowSkeleton,
  // Phase 6
  FileContextMenu,
  FolderContextMenu,
  EmptyAreaContextMenu,
  ConfirmModal,
  RenameModal,
  NewFolderModal,
  MoveModal,
  FilePropertiesModal,
  FolderPropertiesModal,
  // Phase 7
  TransferItem,
  TransfersTray,
  TransfersTrayToggle,
  // Phase 8
  SearchOverlay,
  CommandPalette,
  SearchResultItem,
  // Phase 9
  SettingsModal,
  ActivityFeed,
  ActivityFeedEmpty,
  ActivityItem,
} from "../themes/index";
import type { UploadState } from "../store/uploadStore";
import { MOCK_FOLDER_TREE, MOCK_FILES, MOCK_FOLDERS, MOCK_ACTIVITY, MOCK_SEARCH_RESULTS } from "./mockData";
import { PhoneStep } from "../features/auth/PhoneStep";
import { OtpStep } from "../features/auth/OtpStep";
import { useUIStore } from "../store/uiStore";
import type { ViewMode } from "../store/uiStore";
import type { SortField, SortDirection } from "../store/uiStore";

// ── Layout helpers ────────────────────────────────────────────────────────────

function SectionHeader({ title }: { title: string }) {
  return (
    <h2
      style={{
        margin: 0,
        padding: "16px 20px 12px",
        background: "var(--tv-bg-elevated)",
        font: "var(--tv-type-title-sm)",
        color: "var(--tv-text-secondary)",
        textTransform: "uppercase",
        letterSpacing: "0.1em",
        borderBottom: "1px solid var(--tv-border-subtle)",
      }}
    >
      {title}
    </h2>
  );
}

function SectionBody({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        padding: "20px",
        display: "flex",
        flexDirection: "column",
        gap: "16px",
      }}
    >
      {children}
    </div>
  );
}

function SectionContainer({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section
      style={{
        width: 440,
        maxHeight: "100%",
        display: "flex",
        flexDirection: "column",
        background: "var(--tv-bg-elevated)",
        border: "1px solid var(--tv-border-subtle)",
        borderRadius: "var(--tv-radius-lg)",
        overflow: "hidden",
        boxShadow: "var(--tv-shadow-sm)",
      }}
    >
      <SectionHeader title={title} />
      <div style={{ flex: 1, overflowY: "auto" }}>
        <SectionBody>{children}</SectionBody>
      </div>
    </section>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="w-full flex flex-col gap-2">
      <span
        style={{ font: "var(--tv-type-label-sm)" }}
        className="text-[var(--tv-text-disabled)] uppercase tracking-widest"
      >
        {label}
      </span>
      <div className="flex flex-wrap items-center gap-3">{children}</div>
    </div>
  );
}


// ── Phase 2 — Primitives ──────────────────────────────────────────────────────

function ButtonsSection() {
  const [loading, setLoading] = useState(false);

  const handleLoadingDemo = () => {
    setLoading(true);
    setTimeout(() => setLoading(false), 2000);
  };

  return (
    <SectionContainer title="§ Buttons">
      <Row label="Variants">
        <Button variant="primary">Primary</Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="ghost">Ghost</Button>
        <Button variant="danger">Danger</Button>
      </Row>

      <Separator />

      <Row label="Sizes">
        <Button size="sm">Small</Button>
        <Button size="md">Medium</Button>
        <Button size="lg">Large</Button>
      </Row>

      <Separator />

      <Row label="With icon">
        <Button icon={<Add20Regular />} variant="primary">
          Upload
        </Button>
        <Button icon={<Delete20Regular />} variant="danger">
          Delete
        </Button>
        <Button icon={<ArrowDownload20Regular />} variant="secondary">
          Download
        </Button>
      </Row>

      <Separator />

      <Row label="States">
        <Button loading={loading} onClick={handleLoadingDemo}>
          {loading ? "Loading…" : "Click to load"}
        </Button>
        <Button disabled>Disabled</Button>
        <Button variant="danger" disabled>
          Disabled danger
        </Button>
      </Row>

      <Separator />

      <Row label="Icon buttons">
        <Tooltip content="Add new">
          <IconButton icon={<Add20Regular />} label="Add" />
        </Tooltip>
        <Tooltip content="Settings">
          <IconButton icon={<Settings20Regular />} label="Settings" />
        </Tooltip>
        <Tooltip content="Download">
          <IconButton
            icon={<ArrowDownload20Regular />}
            label="Download"
            variant="secondary"
          />
        </Tooltip>
        <IconButton icon={<Delete20Regular />} label="Delete" disabled />
      </Row>
    </SectionContainer>
  );
}

function InputsSection() {
  const [value, setValue] = useState("");
  const [searchValue, setSearchValue] = useState("");

  return (
    <SectionContainer title="§ Inputs">
      <div className="w-full max-w-sm flex flex-col gap-4">
        <Input
          label="Folder name"
          placeholder="e.g. Documents"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          id="demo-text"
        />

        <Input
          variant="search"
          placeholder="Search files…"
          value={searchValue}
          onChange={(e) => setSearchValue(e.target.value)}
          id="demo-search"
        />

        <Input
          label="Email address"
          placeholder="you@example.com"
          error="Invalid email address"
          id="demo-error"
        />

        <Input
          label="Disabled"
          placeholder="Cannot edit"
          disabled
          id="demo-disabled"
        />

        <Input
          label="With suffix"
          placeholder="Enter size"
          suffix={
            <span style={{ font: "var(--tv-type-label)" }}>MB</span>
          }
          id="demo-suffix"
        />
      </div>
    </SectionContainer>
  );
}

function CheckboxSection() {
  const [a, setA] = useState(false);
  const [b, setB] = useState(true);

  return (
    <SectionContainer title="§ Checkbox">
      <Row label="Unchecked / checked / indeterminate">
        <Checkbox
          checked={a}
          onChange={setA}
          label="Unchecked (click me)"
        />
        <Checkbox
          checked={b}
          onChange={setB}
          label="Checked (click me)"
        />
        <Checkbox indeterminate label="Indeterminate" />
      </Row>
      <Separator />
      <Row label="Disabled states">
        <Checkbox disabled label="Disabled unchecked" />
        <Checkbox disabled checked label="Disabled checked" />
        <Checkbox disabled indeterminate label="Disabled indeterminate" />
      </Row>
    </SectionContainer>
  );
}

function BadgeSection() {
  return (
    <SectionContainer title="§ Badges">
      <Row label="Variants">
        <Badge>Default</Badge>
        <Badge variant="success">Success</Badge>
        <Badge variant="warning">Warning</Badge>
        <Badge variant="error">Error</Badge>
        <Badge variant="info">Info</Badge>
        <Badge variant="coming-soon">Coming soon</Badge>
      </Row>
    </SectionContainer>
  );
}

function TooltipSection() {
  return (
    <SectionContainer title="§ Tooltips">
      <Row label="Sides (hover each)">
        <Tooltip content="Appears on top" side="top">
          <Button variant="secondary" size="sm">
            Top
          </Button>
        </Tooltip>
        <Tooltip content="Appears on right" side="right">
          <Button variant="secondary" size="sm">
            Right
          </Button>
        </Tooltip>
        <Tooltip content="Appears below" side="bottom">
          <Button variant="secondary" size="sm">
            Bottom
          </Button>
        </Tooltip>
        <Tooltip content="Appears on left" side="left">
          <Button variant="secondary" size="sm">
            Left
          </Button>
        </Tooltip>
      </Row>
      <Separator />
      <Row label="Rich content">
        <Tooltip
          content={
            <span>
              Press <Kbd>Ctrl+K</Kbd> to open
            </span>
          }
        >
          <Button variant="ghost" size="sm">
            Hover for keybind tip
          </Button>
        </Tooltip>
      </Row>
    </SectionContainer>
  );
}

function SpinnerSection() {
  return (
    <SectionContainer title="§ Spinner">
      <Row label="Sizes">
        <Spinner size="sm" className="text-[var(--tv-text-secondary)]" />
        <Spinner size="md" className="text-[var(--tv-text-secondary)]" />
        <Spinner size="lg" className="text-[var(--tv-text-secondary)]" />
      </Row>
      <Separator />
      <Row label="Colors">
        <Spinner size="md" className="text-[var(--tv-accent-primary)]" />
        <Spinner size="md" className="text-[var(--tv-success)]" />
        <Spinner size="md" className="text-[var(--tv-error)]" />
      </Row>
    </SectionContainer>
  );
}

function KbdAndSeparatorSection() {
  return (
    <SectionContainer title="§ Kbd & Separator">
      <Row label="Keyboard shortcuts">
        <Kbd>Ctrl</Kbd>
        <Kbd>Ctrl+K</Kbd>
        <Kbd>Ctrl+Shift+N</Kbd>
        <Kbd>F2</Kbd>
        <Kbd>Delete</Kbd>
        <Kbd>Alt+Enter</Kbd>
      </Row>
      <Separator />
      <Row label="Separator — horizontal">
        <div className="w-full">
          <div
            style={{ font: "var(--tv-type-body-sm)" }}
            className="text-[var(--tv-text-secondary)] mb-3"
          >
            Above the line
          </div>
          <Separator />
          <div
            style={{ font: "var(--tv-type-body-sm)" }}
            className="text-[var(--tv-text-secondary)] mt-3"
          >
            Below the line
          </div>
        </div>
      </Row>
      <Row label="Separator — vertical (in flex row)">
        <div className="flex items-center gap-3 h-8">
          <span
            style={{ font: "var(--tv-type-body-sm)" }}
            className="text-[var(--tv-text-secondary)]"
          >
            Left
          </span>
          <Separator orientation="vertical" />
          <span
            style={{ font: "var(--tv-type-body-sm)" }}
            className="text-[var(--tv-text-secondary)]"
          >
            Right
          </span>
        </div>
      </Row>
    </SectionContainer>
  );
}

// ── Phase 3 — Layout shell ────────────────────────────────────────────────────

function LayoutSection() {
  return (
    <section
      style={{
        width: 440,
        background: "var(--tv-bg-elevated)",
        border: "1px solid var(--tv-border-subtle)",
        borderRadius: "var(--tv-radius-lg)",
        overflow: "hidden",
        boxShadow: "var(--tv-shadow-sm)",
      }}
    >
      <SectionHeader title="§ Layout" />
      <SectionBody>
        <div className="w-full">
          <Row label="Navbar">
            <div
              style={{
                width: "100%",
                border: "1px solid var(--tv-border-default)",
                borderRadius: "var(--tv-radius-md)",
                overflow: "hidden",
              }}
            >
              <Navbar />
            </div>
          </Row>
        </div>

        <Separator />

        <Row label="Breadcrumb">
          <Breadcrumb
            segments={[
              { label: "My Vault", href: "/browse" },
              { label: "Documents", href: "/browse/documents" },
              { label: "Work" },
            ]}
          />
        </Row>

        <Separator />

        <Row label="StorageIndicator">
          <div
            style={{
              width: 220,
              border: "1px solid var(--tv-border-default)",
              borderRadius: "var(--tv-radius-md)",
              overflow: "hidden",
              background: "var(--tv-bg-elevated)",
            }}
          >
            <StorageIndicator />
          </div>
        </Row>

        <Separator />

        <Row label="Sidebar (340px tall preview)">
          <div
            style={{
              width: 240,
              height: 340,
              border: "1px solid var(--tv-border-default)",
              borderRadius: "var(--tv-radius-md)",
              overflow: "hidden",
            }}
          >
            <Sidebar nodes={MOCK_FOLDER_TREE} />
          </div>
        </Row>
      </SectionBody>
    </section>
  );
}

function FolderTreeSection() {
  return (
    <SectionContainer title="§ Folder Tree">
      <div
        style={{
          width: 240,
          height: 320,
          border: "1px solid var(--tv-border-default)",
          borderRadius: "var(--tv-radius-md)",
          overflow: "hidden",
          background: "var(--tv-bg-elevated)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <FolderTree nodes={MOCK_FOLDER_TREE} />
      </div>
    </SectionContainer>
  );
}

// ── Phase 5 — File browser ────────────────────────────────────────────────────

function IconsSection() {
  const MIME_SAMPLES = [
    "application/pdf",
    "image/jpeg",
    "image/png",
    "video/mp4",
    "audio/mpeg",
    "application/zip",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "text/markdown",
    "application/json",
    "application/octet-stream",
  ];
  return (
    <SectionContainer title="§ Icons">
      <Row label="FileIcon — by MIME type">
        <div className="flex flex-wrap gap-4">
          {MIME_SAMPLES.map((mime) => (
            <div key={mime} className="flex flex-col items-center gap-1">
              <FileIcon mimeType={mime} size={24} />
              <span style={{ font: "var(--tv-type-label-sm)", color: "var(--tv-text-disabled)" }}>
                {mime.split("/")[1]?.slice(0, 8)}
              </span>
            </div>
          ))}
        </div>
      </Row>

      <Separator />

      <Row label="FolderIcon — colors">
        <div className="flex gap-4">
          {[
            undefined,
            "var(--tv-accent-primary)",
            "var(--tv-warning)",
            "var(--tv-error)",
            "var(--tv-success)",
            "var(--tv-info)",
          ].map((color, i) => (
            <div key={i} className="flex flex-col items-center gap-1">
              <FolderIcon iconColor={color} size={24} />
              <FolderIcon iconColor={color} size={24} open />
            </div>
          ))}
        </div>
      </Row>
    </SectionContainer>
  );
}

function ColorSwatchSection() {
  const [color, setColor] = useState<string | undefined>("#3b82f6");
  return (
    <SectionContainer title="§ ColorSwatchRow">
      <Row label="Interactive (selected: {color})">
        <ColorSwatchRow value={color} onChange={setColor} />
        <span style={{ font: "var(--tv-type-body-sm)", color: "var(--tv-text-secondary)" }}>
          Selected: {color ?? "none"}
        </span>
      </Row>
    </SectionContainer>
  );
}

function FileBrowserSection() {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [sortField, setSortField] = useState<SortField>("name");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

  const handleSelect = (id: string, e: React.MouseEvent | React.KeyboardEvent) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (e.ctrlKey || e.metaKey) {
        if (next.has(id)) next.delete(id);
        else next.add(id);
      } else {
        if (next.has(id) && next.size === 1) next.clear();
        else { next.clear(); next.add(id); }
      }
      return next;
    });
  };

  const handleSort = (field: SortField) => {
    if (field === sortField) {
      setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  return (
    <SectionContainer title="§ File Browser">
      {/* Toolbar */}
      <Row label="ViewToggle + SortBar">
        <div className="flex items-center gap-3">
          <SortBar field={sortField} direction={sortDirection} onChange={(f, d) => { setSortField(f); setSortDirection(d); }} />
          <ViewToggle mode={viewMode} onChange={setViewMode} />
        </div>
      </Row>

      <Separator />

      {/* Cards */}
      <Row label="FolderCard + FileCard (grid)">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px,1fr))", gap: 8, width: "100%" }}>
          {MOCK_FOLDERS.slice(0, 3).map((f) => (
            <FolderCard
              key={f.id}
              folder={f}
              isSelected={selectedIds.has(f.id)}
              dragPayload={{ fileIds: [], folderSlugs: [f.slug ?? f.id], itemCount: 1, label: f.name }}
              onSelect={handleSelect}
            />
          ))}
          {MOCK_FILES.slice(0, 3).map((f) => (
            <FileCard
              key={f.id}
              file={f}
              isSelected={selectedIds.has(f.id)}
              dragPayload={{ fileIds: [f.id], folderSlugs: [], itemCount: 1, label: f.name ?? f.original_name }}
              onSelect={handleSelect}
            />
          ))}
        </div>
      </Row>

      <Separator />

      {/* Rows */}
      <Row label="FolderRow + FileRow (list)">
        <div 
          className="scrollable-horizontal"
          style={{ width: "100%", border: "1px solid var(--tv-border-subtle)", borderRadius: "var(--tv-radius-md)", overflowX: "auto", background: "var(--tv-bg-elevated)", WebkitOverflowScrolling: "touch" }}
        >
          <div style={{ minWidth: 400 }}>
            {MOCK_FOLDERS.slice(0, 2).map((f) => (
              <FolderRow key={f.id} folder={f} isSelected={selectedIds.has(f.id)} dragPayload={{ fileIds: [], folderSlugs: [f.slug ?? f.id], itemCount: 1, label: f.name }} onSelect={handleSelect} />
            ))}
            {MOCK_FILES.slice(0, 3).map((f) => (
              <FileRow key={f.id} file={f} isSelected={selectedIds.has(f.id)} dragPayload={{ fileIds: [f.id], folderSlugs: [], itemCount: 1, label: f.name ?? f.original_name }} onSelect={handleSelect} />
            ))}
          </div>
        </div>
      </Row>

      <Separator />

      {/* Detail rows */}
      <Row label="FolderRow + FileRow (details)">
        <div 
          className="scrollable-horizontal"
          style={{ width: "100%", border: "1px solid var(--tv-border-subtle)", borderRadius: "var(--tv-radius-md)", overflowX: "auto", background: "var(--tv-bg-elevated)", WebkitOverflowScrolling: "touch" }}
        >
          <div style={{ minWidth: 600 }}>
            {MOCK_FOLDERS.slice(0, 2).map((f) => (
              <FolderRow key={f.id} folder={f} isSelected={selectedIds.has(f.id)} showColumns dragPayload={{ fileIds: [], folderSlugs: [f.slug ?? f.id], itemCount: 1, label: f.name }} onSelect={handleSelect} />
            ))}
            {MOCK_FILES.slice(0, 3).map((f) => (
              <FileRow key={f.id} file={f} isSelected={selectedIds.has(f.id)} showColumns dragPayload={{ fileIds: [f.id], folderSlugs: [], itemCount: 1, label: f.name ?? f.original_name }} onSelect={handleSelect} />
            ))}
          </div>
        </div>
      </Row>

      <Separator />

      {/* FileGrid */}
      <Row label="FileGrid (full, with mock data)">
        <div style={{ width: "100%", border: "1px solid var(--tv-border-subtle)", borderRadius: "var(--tv-radius-md)", overflow: "hidden", background: "var(--tv-bg-base)" }}>
          <FileGrid
            folders={MOCK_FOLDERS}
            files={MOCK_FILES}
            selectedIds={selectedIds}
            onSelect={handleSelect}
          />
        </div>
      </Row>

      <Separator />

      {/* FileList */}
      <Row label="FileList (full)">
        <div 
          className="scrollable-horizontal"
          style={{ width: "100%", background: "var(--tv-bg-base)", borderRadius: "var(--tv-radius-md)", overflowX: "auto", WebkitOverflowScrolling: "touch" }}
        >
          <div style={{ minWidth: 600 }}>
            <FileList
              folders={MOCK_FOLDERS}
              files={MOCK_FILES}
              selectedIds={selectedIds}
              onSelect={handleSelect}
            />
          </div>
        </div>
      </Row>

      <Separator />

      {/* FileDetails */}
      <Row label="FileDetails (full)">
        <div 
          className="scrollable-horizontal"
          style={{ width: "100%", background: "var(--tv-bg-base)", borderRadius: "var(--tv-radius-md)", overflowX: "auto", WebkitOverflowScrolling: "touch" }}
        >
          <div style={{ minWidth: 800 }}>
            <FileDetails
              folders={MOCK_FOLDERS}
              files={MOCK_FILES}
              selectedIds={selectedIds}
              sortField={sortField}
              sortDirection={sortDirection}
              onSelect={handleSelect}
              onSort={handleSort}
            />
          </div>
        </div>
      </Row>

      <Separator />

      {/* Skeletons */}
      <Row label="Skeletons">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px,1fr))", gap: 8, width: "100%" }}>
          <FolderSkeleton />
          <FolderSkeleton />
          <FileSkeleton />
          <FileSkeleton />
          <FileSkeleton />
        </div>
        <div style={{ width: "100%", border: "1px solid var(--tv-border-subtle)", borderRadius: "var(--tv-radius-md)", overflow: "hidden" }}>
          <RowSkeleton columns={2} />
          <RowSkeleton columns={2} />
          <RowSkeleton columns={4} />
          <RowSkeleton columns={4} />
        </div>
      </Row>

      <Separator />

      {/* EmptyState variants */}
      <Row label="EmptyState — empty-folder">
        <div style={{ width: "100%", border: "1px solid var(--tv-border-subtle)", borderRadius: "var(--tv-radius-md)", background: "var(--tv-bg-base)" }}>
          <EmptyState
            variant="empty-folder"
            onAction={() => console.log("upload files")}
            onSecondaryAction={() => console.log("new folder")}
          />
        </div>
      </Row>
      <Row label="EmptyState — no-results">
        <div style={{ width: "100%", border: "1px solid var(--tv-border-subtle)", borderRadius: "var(--tv-radius-md)", background: "var(--tv-bg-base)" }}>
          <EmptyState variant="no-results" query="budget 2024.xlsx" />
        </div>
      </Row>
      <Row label="EmptyState — no-channels">
        <div style={{ width: "100%", border: "1px solid var(--tv-border-subtle)", borderRadius: "var(--tv-radius-md)", background: "var(--tv-bg-base)" }}>
          <EmptyState variant="no-channels" onAction={() => {}} />
        </div>
      </Row>
      <Row label="EmptyState — welcome">
        <div style={{ width: "100%", border: "1px solid var(--tv-border-subtle)", borderRadius: "var(--tv-radius-md)", background: "var(--tv-bg-base)" }}>
          <EmptyState variant="welcome" onAction={() => {}} onDismiss={() => {}} />
        </div>
      </Row>

      <Separator />

      {/* SelectionBar */}
      <Row label="SelectionBar (2 items selected)">
        <div style={{ position: "relative", width: "100%", height: 80, border: "1px solid var(--tv-border-subtle)", borderRadius: "var(--tv-radius-md)", background: "var(--tv-bg-base)", overflow: "hidden" }}>
          <SelectionBar count={2} onClearSelection={() => {}} />
        </div>
      </Row>
    </SectionContainer>
  );
}

// ── Main PreviewPage ──────────────────────────────────────────────────────────

export function PreviewPage() {
  const { activeTheme, availableThemes, setTheme } = useThemeStore();
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Lock body scroll to prevent any weird layout shifting in the preview
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  const handleWheel = (e: React.WheelEvent) => {
    if (!scrollContainerRef.current) return;

    const target = e.target as HTMLElement;

    // 1. Check for horizontal internal scroll priority
    const horizontalParent = target.closest(".scrollable-horizontal") as HTMLElement | null;
    if (horizontalParent) {
      const { scrollLeft, scrollWidth, clientWidth } = horizontalParent;
      const canScrollLeft = scrollLeft > 0;
      const canScrollRight = scrollLeft < scrollWidth - clientWidth;

      if ((e.deltaY < 0 && canScrollLeft) || (e.deltaY > 0 && canScrollRight)) {
        horizontalParent.scrollLeft += e.deltaY;
        return;
      }
    }

    // 2. Check for vertical internal scroll priority
    const verticalParent = target.closest(
      '[style*="overflow-y: auto"], [style*="overflowY: auto"]'
    ) as HTMLElement | null;

    if (verticalParent) {
      const { scrollTop, scrollHeight, clientHeight } = verticalParent;
      const canScrollUp = scrollTop > 0;
      const canScrollDown = scrollTop < scrollHeight - clientHeight;

      if ((e.deltaY < 0 && canScrollUp) || (e.deltaY > 0 && canScrollDown)) {
        return; // Let the element handle its own vertical scroll
      }
    }

    // 3. Fallback to global horizontal scroll
    scrollContainerRef.current.scrollLeft += e.deltaY;
  };

  return (
    <div
      onWheel={handleWheel}
      style={{
        position: "fixed",
        inset: 0,
        background: "var(--tv-bg-base)",
        color: "var(--tv-text-primary)",
        fontFamily: "var(--tv-font-sans)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        width: "100%",
        height: "100%",
      }}
    >
      {/* ── Background Grid ────────────────────────────────────────────────── */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          backgroundImage: `
            radial-gradient(circle at 1px 1px, var(--tv-border-subtle) 1px, transparent 0)
          `,
          backgroundSize: "32px 32px",
          pointerEvents: "none",
          opacity: 0.4,
          zIndex: 0,
        }}
      />

      {/* ── Top bar ──────────────────────────────────────────────────────── */}
      <header
        style={{
          position: "relative",
          zIndex: 100,
          height: "48px",
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 24px",
          background: "var(--tv-bg-glass)",
          backdropFilter: "blur(var(--tv-glass-blur))",
          borderBottom: "1px solid var(--tv-border-subtle)",
        }}
      >
        <span
          style={{
            font: "var(--tv-type-title-lg)",
            color: "var(--tv-text-primary)",
          }}
        >
          TeleVault · Component Preview
        </span>

        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <label
            htmlFor="theme-select"
            style={{
              font: "var(--tv-type-body-sm)",
              color: "var(--tv-text-secondary)",
            }}
          >
            Theme:
          </label>
          <select
            id="theme-select"
            value={activeTheme}
            onChange={(e) => setTheme(e.target.value)}
            style={{
              padding: "4px 10px",
              borderRadius: "var(--tv-radius-sm)",
              background: "var(--tv-bg-overlay)",
              border: "1px solid var(--tv-border-default)",
              color: "var(--tv-text-primary)",
              font: "var(--tv-type-body-sm)",
              cursor: "pointer",
            }}
          >
            {availableThemes.length === 0 ? (
              <option value="default">Default Dark</option>
            ) : (
              availableThemes.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))
            )}
          </select>

          <Tooltip content={<span>Search <Kbd>Ctrl+F</Kbd></span>}>
            <IconButton
              icon={<Search20Regular />}
              label="Search"
              size="sm"
            />
          </Tooltip>
        </div>
      </header>

      {/* ── Masonry Grid Layout ─────────────────────────────────────────── */}
      <main
        ref={scrollContainerRef}
        style={{
          flex: 1,
          overflowX: "auto",
          overflowY: "hidden",
          WebkitOverflowScrolling: "touch",
          padding: "32px",
          zIndex: 1,
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            flexWrap: "wrap",
            alignContent: "flex-start",
            gap: "24px",
            height: "100%",
            width: "max-content",
          }}
        >
          <div style={{ width: 440, display: "contents", breakInside: "avoid" }}>
            <ButtonsSection />
            <InputsSection />
            <CheckboxSection />
            <BadgeSection />
            <TooltipSection />
            <SpinnerSection />
            <KbdAndSeparatorSection />
          </div>

          <div style={{ width: 440, display: "contents", breakInside: "avoid" }}>
            <LayoutSection />
            <FolderTreeSection />
          </div>

          <div style={{ width: 440, display: "contents", breakInside: "avoid" }}>
            <AuthSection />
            <IconsSection />
            <ColorSwatchSection />
          </div>

          <div style={{ width: 440, display: "contents", breakInside: "avoid" }}>
            <FileBrowserSection />
          </div>

          <div style={{ width: 440, display: "contents", breakInside: "avoid" }}>
            <Phase6Section />
          </div>

          <div style={{ width: 440, display: "contents", breakInside: "avoid" }}>
            <Phase7Section />
            <Phase8Section />
            <Phase9Section />
            <DesignTokensSection />
          </div>
        </div>
      </main>
    </div>
  );
}

function AuthSection() {
  return (
    <SectionContainer title="§ Auth">
      <Row label="PhoneStep (standalone)">
        <div style={{ width: "100%" }}>
          <PhoneStep
            onSubmit={(e164) => console.log("PhoneStep submit:", e164)}
            isPending={false}
            error={null}
          />
        </div>
      </Row>

      <Separator />

      <Row label="OtpStep (standalone)">
        <div style={{ width: "100%" }}>
          <OtpStep
            phone="+393401234567"
            codeType="sms"
            onResend={() => console.log("OtpStep resend")}
            onSuccess={() => {}}
          />
        </div>
      </Row>

      <Separator />

      <Row label="Full LoginPage">
        <div
          style={{
            padding: "10px 144px",
            borderRadius: "var(--tv-radius-md)",
            background: "var(--tv-bg-overlay)",
            border: "1px solid var(--tv-border-default)",
            color: "var(--tv-text-secondary)",
            font: "var(--tv-type-body-sm)",
          }}
        >
          Full <code style={{ color: "var(--tv-accent-primary)" }}>LoginPage</code> available
          at{" "}
          <a
            href="/login"
            target="_blank"
            rel="noreferrer"
            style={{ color: "var(--tv-accent-primary)" }}
          >
            /login
          </a>
        </div>
      </Row>
    </SectionContainer>
  );
}

function DesignTokensSection() {
  return (
    <SectionContainer title="§ Design Tokens">
      <div style={{ display: "flex", flexWrap: "wrap", gap: "12px" }}>
        {(
          [
            ["--tv-bg-base", "bg-base"],
            ["--tv-bg-elevated", "bg-elevated"],
            ["--tv-bg-overlay", "bg-overlay"],
            ["--tv-bg-subtle", "bg-subtle"],
            ["--tv-bg-highest", "bg-highest"],
          ] as [string, string][]
        ).map(([varName, label]) => (
          <div
            key={varName}
            style={{
              width: 70,
              height: 70,
              borderRadius: "var(--tv-radius-md)",
              background: `var(${varName})`,
              border: "1px solid var(--tv-border-default)",
              display: "flex",
              alignItems: "flex-end",
              padding: "6px",
            }}
          >
            <span
              style={{
                font: "var(--tv-type-label-sm)",
                color: "var(--tv-text-secondary)",
              }}
            >
              {label}
            </span>
          </div>
        ))}
        <div
          style={{
            width: 70,
            height: 70,
            borderRadius: "var(--tv-radius-md)",
            background: "var(--tv-accent-primary)",
            display: "flex",
            alignItems: "flex-end",
            padding: "6px",
          }}
        >
          <span
            style={{
              font: "var(--tv-type-label-sm)",
              color: "var(--tv-accent-on)",
            }}
          >
            accent
          </span>
        </div>
      </div>
    </SectionContainer>
  );
}

// ── Phase 7 section ──────────────────────────────────────────────────────────

const MOCK_UPLOADS: UploadState[] = [
  {
    id: "op-1",
    operationId: "op-1",
    fileName: "vacation-photos.zip",
    fileSize: 142_800_000,
    progress: 0,
    status: "uploading",
    createdAt: Date.now() - 10000,
  },
  {
    id: "op-2",
    operationId: "op-2",
    fileName: "project-presentation.pptx",
    fileSize: 8_430_000,
    progress: 45,
    status: "uploading",
    createdAt: Date.now() - 5000,
  },
  {
    id: "op-3",
    operationId: "op-3",
    fileName: "invoice-march-2026.pdf",
    fileSize: 214_000,
    progress: 100,
    status: "complete",
    createdAt: Date.now() - 60000,
  },
  {
    id: "op-4",
    operationId: "op-4",
    fileName: "corrupted-file.dat",
    fileSize: 52_000,
    progress: 30,
    status: "error",
    error: "Server rejected file",
    createdAt: Date.now() - 30000,
  },
];

// ── Phase 8 section ───────────────────────────────────────────────────────────

function Phase8Section() {
  const [searchOpen, setSearchOpen] = useState(false);
  const [cmdOpen, setCmdOpen] = useState(false);

  return (
    <>
      {/* ── Search ──────────────────────────────────────────────────────── */}
      <SectionContainer title="§ Search">
        <Row label="SearchResultItem (standalone)">
          <div style={{ display: "flex", flexDirection: "column", gap: 4, width: "100%", maxWidth: 560 }}>
            {MOCK_SEARCH_RESULTS.slice(0, 3).map((r, i) => (
              <SearchResultItem
                key={r.id}
                result={r}
                query="design"
                isActive={i === 1}
                onSelect={() => {}}
              />
            ))}
          </div>
        </Row>

        <Separator />

        <Row label="SearchOverlay (Spotlight-style modal)">
          <Button variant="primary" onClick={() => setSearchOpen(true)}>
            Open Search
          </Button>
          <span style={{ font: "var(--tv-type-body-sm)", color: "var(--tv-text-secondary)" }}>
            Also: Ctrl+F
          </span>
        </Row>
      </SectionContainer>

      {/* ── Command Palette ──────────────────────────────────────────────── */}
      <SectionContainer title="§ Command Palette">
        <Row label="CommandPalette — all actions, filterable">
          <Button variant="primary" onClick={() => setCmdOpen(true)}>
            Open Command Palette
          </Button>
          <span style={{ font: "var(--tv-type-body-sm)", color: "var(--tv-text-secondary)" }}>
            Also: Ctrl+K
          </span>
        </Row>
      </SectionContainer>

      {/* Overlays mounted here */}
      <SearchOverlay
        open={searchOpen}
        onOpenChange={setSearchOpen}
        mockResults={MOCK_SEARCH_RESULTS}
      />
      <CommandPalette
        open={cmdOpen}
        onOpenChange={setCmdOpen}
        onAction={(id) => {
          alert(`Action: ${id}`);
          setCmdOpen(false);
        }}
      />
    </>
  );
}

// ── Phase 9 section ───────────────────────────────────────────────────────────

function Phase9Section() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { activePanel, setActivePanel } = useUIStore();

  return (
    <>
      {/* ── Activity Feed ──────────────────────────────────────────────────── */}
      <SectionContainer title="§ Activity Feed">
        <Row label="Toggle overlay">
          <Button
            variant="ghost"
            size="md"
            onClick={() => setActivePanel(activePanel === "activity" ? null : "activity")}
          >
            {activePanel === "activity" ? "Close Activity Feed" : "Open Activity Feed"}
          </Button>
          <span style={{ font: "var(--tv-type-body-sm)", color: "var(--tv-text-secondary)" }}>
            (Renders as fixed overlay when active)
          </span>
        </Row>

        <Separator />

        <Row label="ActivityFeedEmpty">
          <div
            style={{
              width: 320,
              border: "1px solid var(--tv-border-subtle)",
              borderRadius: "var(--tv-radius-md)",
              overflow: "hidden",
              height: 120,
            }}
          >
            <ActivityFeedEmpty />
          </div>
        </Row>

        <Separator />

        <Row label="ActivityItem samples">
          <div style={{ display: "flex", flexDirection: "column", gap: 0, width: "100%", maxWidth: 360 }}>
            {MOCK_ACTIVITY.slice(0, 3).map((event, i) => (
              <ActivityItem
                key={event.id}
                event={event}
                isLast={i === 2}
              />
            ))}
          </div>
        </Row>
      </SectionContainer>

      {/* ── Settings Modal ─────────────────────────────────────────────────── */}
      <SectionContainer title="§ Settings Modal">
        <Row label="Open modal">
          <Button variant="primary" size="md" onClick={() => setSettingsOpen(true)}>
            <Settings20Regular style={{ width: 16, height: 16, marginRight: 6 }} />
            Open Settings
          </Button>
        </Row>
      </SectionContainer>

      {/* Overlays */}
      <ActivityFeed />
      <SettingsModal open={settingsOpen} onOpenChange={setSettingsOpen} />
    </>
  );
}

function Phase7Section() {
  const [trayOpen, setTrayOpen] = useState(false);
  const [uploads, setUploads] = useState<UploadState[]>(MOCK_UPLOADS);

  const handleCancel = (id: string) => {
    setUploads((prev) =>
      prev.map((u) => (u.operationId === id ? { ...u, status: "cancelled" } : u)),
    );
  };

  const handleRemove = (id: string) => {
    setUploads((prev) => prev.filter((u) => u.operationId !== id));
  };

  return (
    <>
      <SectionContainer title="§ Transfers Tray">
        <Row label="TransferItem states">
          <div style={{ display: "flex", flexDirection: "column", gap: 8, width: "100%", maxWidth: 360 }}>
            {uploads.map((u) => (
              <TransferItem
                key={u.operationId}
                upload={u}
                onCancel={handleCancel}
                onRemove={handleRemove}
              />
            ))}
          </div>
        </Row>

        <Separator />

        <Row label="TransfersTrayToggle (standalone)">
          <TransfersTrayToggle activeCount={uploads.filter(u => u.status === "uploading").length} onClick={() => setTrayOpen(true)} />
          <TransfersTrayToggle activeCount={0} onClick={() => {}} />
        </Row>

        <Separator />

        <Row label="TransfersTray (floating — bottom right of page)">
          <Button variant="primary" onClick={() => setTrayOpen((v) => !v)}>
            {trayOpen ? "Close Tray" : "Open Tray"}
          </Button>
          <span style={{ font: "var(--tv-type-body-sm)", color: "var(--tv-text-secondary)" }}>
            Tray renders at bottom-right with interactive mock data
          </span>
        </Row>
      </SectionContainer>

      {/* The tray itself — portal-style, fixed to bottom-right */}
      <TransfersTray
        open={trayOpen}
        onOpenChange={setTrayOpen}
        mockUploads={uploads}
      />
    </>
  );
}

// ── Phase 6 section (extracted to keep state local) ───────────────────────────

function Phase6Section() {
  // Context menu demo state
  const [folderColor, setFolderColor] = useState<string>("var(--tv-accent-primary)");

  // Modal states
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmDanger, setConfirmDanger] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [filePropsOpen, setFilePropsOpen] = useState(false);
  const [folderPropsOpen, setFolderPropsOpen] = useState(false);

  const mockFile = MOCK_FILES[0];
  const mockFolder = MOCK_FOLDERS[0];

  return (
    <>
      <SectionContainer title="§ Context Menus">
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          {/* File context menu */}
          <FileContextMenu
            onOpen={() => alert("Open file")}
            onDownload={() => alert("Download")}
            onRename={() => setRenameOpen(true)}
            onMove={() => setMoveOpen(true)}
            onCopy={() => alert("Copy")}
            onProperties={() => setFilePropsOpen(true)}
            onDelete={() => { setConfirmDanger(true); setConfirmOpen(true); }}
          >
            <div
              style={{
                padding: "10px 16px",
                background: "var(--tv-bg-elevated)",
                borderRadius: "var(--tv-radius-md)",
                border: "1px solid var(--tv-border-default)",
                cursor: "context-menu",
                font: "var(--tv-type-body-sm)",
                color: "var(--tv-text-secondary)",
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <Document20Regular style={{ width: 16, height: 16 }} />
              Right-click → File Menu
            </div>
          </FileContextMenu>

          {/* Folder context menu */}
          <FolderContextMenu
            currentColor={folderColor}
            onOpen={() => alert("Open folder")}
            onRename={() => setRenameOpen(true)}
            onMove={() => setMoveOpen(true)}
            onCopy={() => alert("Copy folder")}
            onColorChange={setFolderColor}
            onProperties={() => setFolderPropsOpen(true)}
            onDelete={() => { setConfirmDanger(true); setConfirmOpen(true); }}
          >
            <div
              style={{
                padding: "10px 16px",
                background: "var(--tv-bg-elevated)",
                borderRadius: "var(--tv-radius-md)",
                border: "1px solid var(--tv-border-default)",
                cursor: "context-menu",
                font: "var(--tv-type-body-sm)",
                color: "var(--tv-text-secondary)",
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <span
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: "50%",
                  background: folderColor,
                  flexShrink: 0,
                  display: "inline-block",
                }}
              />
              Right-click → Folder Menu
            </div>
          </FolderContextMenu>

          {/* Empty area context menu */}
          <EmptyAreaContextMenu
            onNewFolder={() => setNewFolderOpen(true)}
            onUpload={() => alert("Upload")}
          >
            <div
              style={{
                padding: "10px 16px",
                background: "var(--tv-bg-elevated)",
                borderRadius: "var(--tv-radius-md)",
                border: "1px dashed var(--tv-border-default)",
                cursor: "context-menu",
                font: "var(--tv-type-body-sm)",
                color: "var(--tv-text-secondary)",
              }}
            >
              Right-click → Empty Area Menu
            </div>
          </EmptyAreaContextMenu>
        </div>
      </SectionContainer>

      <SectionContainer title="§ Modals">
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Button variant="secondary" size="sm" onClick={() => { setConfirmDanger(false); setConfirmOpen(true); }}>
            Confirm Modal
          </Button>
          <Button variant="danger" size="sm" onClick={() => { setConfirmDanger(true); setConfirmOpen(true); }}>
            Danger Confirm
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setRenameOpen(true)}>
            Rename Modal
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setNewFolderOpen(true)}>
            New Folder
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setMoveOpen(true)}>
            Move Modal
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setFilePropsOpen(true)}>
            File Properties
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setFolderPropsOpen(true)}>
            Folder Properties
          </Button>
        </div>

        {/* ── All modals mounted here ──────────────────────────────────────── */}
        <ConfirmModal
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          title={confirmDanger ? "Delete item?" : "Confirm action"}
          description={
            confirmDanger
              ? "This will permanently delete the selected item. This action cannot be undone."
              : "Are you sure you want to proceed with this action?"
          }
          confirmLabel={confirmDanger ? "Delete" : "Confirm"}
          danger={confirmDanger}
          onConfirm={() => { alert("Confirmed"); setConfirmOpen(false); }}
        />
        <RenameModal
          open={renameOpen}
          onOpenChange={setRenameOpen}
          initialName="Project Report Q4.pdf"
          isFile
          onRename={(name) => { alert(`Renamed to: ${name}`); setRenameOpen(false); }}
        />
        <NewFolderModal
          open={newFolderOpen}
          onOpenChange={setNewFolderOpen}
          onCreateFolder={(name) => { alert(`Create folder: ${name}`); setNewFolderOpen(false); }}
        />
        <MoveModal
          open={moveOpen}
          onOpenChange={setMoveOpen}
          itemName="Project Report Q4.pdf"
          onMove={(slug) => { alert(`Move to folder slug: ${slug ?? "root"}`); setMoveOpen(false); }}
        />
        {mockFile && (
          <FilePropertiesModal
            open={filePropsOpen}
            onOpenChange={setFilePropsOpen}
            file={mockFile}
            onRename={(name) => { alert(`Rename to: ${name}`); setFilePropsOpen(false); }}
          />
        )}
        {mockFolder && (
          <FolderPropertiesModal
            open={folderPropsOpen}
            onOpenChange={setFolderPropsOpen}
            folder={mockFolder}
            onSave={(updates) => { alert(`Save: ${JSON.stringify(updates)}`); setFolderPropsOpen(false); }}
          />
        )}
      </SectionContainer>
    </>
  );
}
