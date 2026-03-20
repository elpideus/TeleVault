import { useCallback, useRef } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { Group, Panel, type Layout } from "react-resizable-panels";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  pointerWithin,
  MeasuringStrategy,
} from "@dnd-kit/core";
import { Navbar } from "../../themes/default/components/Navbar";
import { Sidebar } from "../../themes/default/components/Sidebar";
import { ResizeHandle } from "../../themes/default/components/ResizeHandle";
import { SearchOverlay } from "../../themes/default/components/SearchOverlay";
import { CommandPalette } from "../../themes/default/components/CommandPalette";
import { ActivityFeed } from "../../themes/default/components/ActivityFeed";
import { TransfersTray } from "../../themes/default/components/TransfersTray";
import { SettingsModal } from "../../themes/default/components/SettingsModal";
import { useUIStore } from "../../store/uiStore";
import { useKeybinds } from "../../hooks/useKeybinds";
import { useQuery } from "@tanstack/react-query";
import { getRootChildren, folderKeys } from "../../api/folders";
import type { FolderNode } from "../../themes/default/components/FolderTree";
import { springFluid } from "../../lib/springs";
import type { ActionId } from "../../lib/keybinds";
import { useExplorerStore } from "../../store/explorerStore";
import { useExplorerActions } from "../../hooks/useExplorerActions";
import {
  RenameModal,
  ConfirmModal,
  NewFolderModal,
  MoveModal,
  FilePropertiesModal,
  FolderPropertiesModal,
  DisclaimerModal,
  DonationModal,
} from "../../themes/index";
import { useAuthStore } from "../../store/authStore";
import { useDragAndDrop } from "../../hooks/useDragAndDrop";
import { DragOverlayContent } from "../../themes/default/components/DragOverlayContent";

// Panel id used to look up size in Layout object
const SIDEBAR_PANEL_ID = "sidebar";

export function AppShell() {
  const shouldReduceMotion = useReducedMotion();
  const { sidebarWidth, setSidebarWidth, setSearchOpen, setCommandPaletteOpen, settingsOpen, setSettingsOpen, hasSeenDisclaimer, setHasSeenDisclaimer, hasSeenDonationModal, setHasSeenDonationModal } = useUIStore();
  const { isAuthenticated } = useAuthStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const location = useLocation();
  const navigate = useNavigate();

  // Extract slug from URL for mutations
  const currentSlug = location.pathname.startsWith("/browse") 
    ? location.pathname.replace(/^\/browse\/?/, "") 
    : "";

  const explorerStore = useExplorerStore();
  const explorerActions = useExplorerActions(currentSlug);

  // Wire keybinds — Ctrl+F and Ctrl+K open the overlays
  useKeybinds({
    onOpenSearch: () => setSearchOpen(true),
    onOpenCommandPalette: () => setCommandPaletteOpen(true),
    onNavigateBack: () => navigate(-1),
    onNavigateForward: () => navigate(1),
  });

  // Command palette action dispatcher
  const handlePaletteAction = useCallback(
    (id: ActionId) => {
      switch (id) {
        case "openSearch":
          setSearchOpen(true);
          break;
        case "openCommandPalette":
          setCommandPaletteOpen(true);
          break;
        case "navigateBack":
          navigate(-1);
          break;
        case "navigateForward":
          navigate(1);
          break;
        // Other actions (rename, delete, etc.) require selection context —
        // they will be wired in Phase 10 when the file browser is connected.
        default:
          break;
      }
    },
    [setSearchOpen, setCommandPaletteOpen, navigate],
  );

  const { data: rootFoldersData } = useQuery({
    queryKey: folderKeys.sidebarRoot(),
    queryFn: () => getRootChildren(1, 200),
  });

  const sidebarNodes: FolderNode[] = (rootFoldersData?.items ?? []).map((f) => ({
    id: f.id,
    name: f.name,
    slug: f.slug,
    iconColor: f.icon_color ?? undefined,
    iconImage: f.icon_image ?? undefined,
    children: undefined, // lazy-loaded on expand
  }));

  const getContainerWidth = useCallback(
    () => containerRef.current?.offsetWidth ?? window.innerWidth,
    [],
  );

  // `layout` is { [panelId]: sizePercent }
  // Use onLayoutChanged (fires after drag ends) for persistence — avoids noisy writes
  const handleLayoutChanged = useCallback(
    (layout: Layout) => {
      const pct = layout[SIDEBAR_PANEL_ID];
      if (pct == null) return;
      const newPx = Math.round((pct / 100) * getContainerWidth());
      setSidebarWidth(newPx);
    },
    [getContainerWidth, setSidebarWidth],
  );

  // Compute initial size as % of current container width.
  // Note: containerRef.current is null on first render, so getContainerWidth()
  // falls back to window.innerWidth. This is an acceptable approximation.
  const containerWidth = getContainerWidth();
  const initialSizePct = ((sidebarWidth ?? 240) / containerWidth) * 100;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  const { onDragStart, onDragEnd, activeDragPayload } =
    useDragAndDrop(currentSlug || null);

  return (
    <DndContext 
      sensors={sensors} 
      onDragStart={onDragStart} 
      onDragEnd={onDragEnd}
      collisionDetection={pointerWithin}
      measuring={{
        droppable: {
          strategy: MeasuringStrategy.Always,
        },
      }}
    >
    <div
      ref={containerRef}
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        background: "var(--tv-bg-base)",
        color: "var(--tv-text-primary)",
        overflow: "hidden",
      }}
    >
      {/* App-level overlays — rendered outside the panel layout so they float above */}
      <SearchOverlay />
      <CommandPalette onAction={handlePaletteAction} />
      <ActivityFeed />
      <TransfersTray />
      {/* TODO Phase 10: wire openSettings ActionId via CommandPalette */}
      <SettingsModal open={settingsOpen} onOpenChange={setSettingsOpen} />

      {/* Global Explorer Modals */}
      <RenameModal
        open={explorerStore.renameTarget !== null}
        onOpenChange={(open) => { if (!open) explorerStore.setRenameTarget(null); }}
        initialName={
          explorerStore.renameTarget?.type === "folder"
            ? explorerStore.renameTarget.item.name
            : explorerStore.renameTarget?.type === "file"
              ? (explorerStore.renameTarget.item.name ?? explorerStore.renameTarget.item.original_name)
              : ""
        }
        isFile={explorerStore.renameTarget?.type === "file"}
        loading={explorerActions.renameFolder.isPending || explorerActions.renameFile.isPending}
        onRename={(name) => {
          if (explorerStore.renameTarget?.type === "folder") {
            explorerActions.renameFolder.mutate({ slug: explorerStore.renameTarget.item.slug, name });
          } else if (explorerStore.renameTarget?.type === "file") {
            explorerActions.renameFile.mutate({ id: explorerStore.renameTarget.item.id, name });
          }
        }}
      />

      <ConfirmModal
        open={explorerStore.deleteTarget !== null}
        onOpenChange={(open) => { if (!open) explorerStore.setDeleteTarget(null); }}
        title={explorerStore.deleteTarget?.type === "folder" ? "Delete Folder" : "Delete File"}
        description={`Are you sure you want to delete "${
          explorerStore.deleteTarget?.type === "folder"
            ? explorerStore.deleteTarget.item.name
            : explorerStore.deleteTarget?.type === "file"
              ? (explorerStore.deleteTarget.item.name ?? explorerStore.deleteTarget.item.original_name)
              : ""
        }"? This action cannot be undone.`}
        confirmLabel="Delete"
        danger
        loading={explorerActions.deleteFolder.isPending || explorerActions.deleteFile.isPending}
        onConfirm={() => {
          if (explorerStore.deleteTarget?.type === "folder") {
            explorerActions.deleteFolder.mutate(explorerStore.deleteTarget.item.slug);
          } else if (explorerStore.deleteTarget?.type === "file") {
            explorerActions.deleteFile.mutate(explorerStore.deleteTarget.item.id);
          }
        }}
      />

      <NewFolderModal
        open={explorerStore.newFolderOpen}
        onOpenChange={(open) => {
          explorerStore.setNewFolderOpen(open);
          if (!open) explorerStore.setNewFolderParentSlug(null);
        }}
        loading={explorerActions.createNewFolder.isPending}
        onCreateFolder={(name) =>
          explorerActions.createNewFolder.mutate({
            name,
            parentSlug: explorerStore.newFolderParentSlug,
          })
        }
      />

      <MoveModal
        open={explorerStore.moveTarget !== null}
        onOpenChange={(open) => { if (!open) explorerStore.setMoveTarget(null); }}
        itemName={
          explorerStore.moveTarget?.type === "folder"
            ? explorerStore.moveTarget.item.name
            : explorerStore.moveTarget?.item?.name ?? explorerStore.moveTarget?.item?.original_name ?? ""
        }
        disabledIds={explorerStore.moveTarget?.item?.id ? [explorerStore.moveTarget.item.id] : []}
        loading={explorerActions.moveFolder.isPending || explorerActions.moveFile.isPending}
        onMove={(targetParentSlug) => {
          if (explorerStore.moveTarget?.type === "folder") {
            explorerActions.moveFolder.mutate({ 
              slug: explorerStore.moveTarget.item.slug, 
              targetParentSlug 
            });
          } else if (explorerStore.moveTarget?.type === "file") {
            explorerActions.moveFile.mutate({ 
              id: explorerStore.moveTarget.item.id, 
              targetFolderSlug: targetParentSlug 
            });
          }
        }}
      />

      {explorerStore.propertiesTarget?.type === "folder" && (
        <FolderPropertiesModal
          open={explorerStore.propertiesTarget !== null}
          onOpenChange={(open) => { if (!open) explorerStore.setPropertiesTarget(null); }}
          folder={explorerStore.propertiesTarget.item}
          onSave={(updates) => {
            const target = explorerStore.propertiesTarget;
            if (target?.type === "folder") {
              explorerActions.updateFolderProperties.mutate({
                slug: target.item.slug,
                ...updates,
              });
            }
          }}
        />
      )}

      {explorerStore.propertiesTarget?.type === "file" && (
        <FilePropertiesModal
          open={explorerStore.propertiesTarget !== null}
          onOpenChange={(open) => { if (!open) explorerStore.setPropertiesTarget(null); }}
          file={explorerStore.propertiesTarget.item}
          onRename={(name) => {
            const target = explorerStore.propertiesTarget;
            if (target?.type === "file") {
              explorerActions.renameFile.mutate({
                id: target.item.id,
                name,
              });
            }
          }}
        />
      )}

      {isAuthenticated && (
        <DisclaimerModal
          open={!hasSeenDisclaimer}
          onConfirm={() => setHasSeenDisclaimer(true)}
        />
      )}

      {isAuthenticated && hasSeenDisclaimer && (
        <DonationModal
          open={!hasSeenDonationModal}
          onConfirm={() => setHasSeenDonationModal(true)}
        />
      )}

      {/* Navbar — full width above panel group */}
      <Navbar onSettingsClick={() => setSettingsOpen(true)} />

      {/* Panel group — sidebar + content */}
      <Group
        orientation="horizontal"
        onLayoutChanged={handleLayoutChanged}
        style={{ flex: 1, overflow: "hidden" }}
      >
        <Panel
          id={SIDEBAR_PANEL_ID}
          defaultSize={initialSizePct}
          minSize="180px"
          maxSize="400px"
          style={{ overflow: "hidden" }}
        >
          <Sidebar nodes={sidebarNodes} />
        </Panel>

        <ResizeHandle />

        <Panel style={{ overflow: "hidden", display: "flex", flexDirection: "column" }}>
          {/* Page content with route-keyed spring animation */}
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname.split("/")[1] || "root"}
              initial={shouldReduceMotion ? undefined : { opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={shouldReduceMotion ? undefined : { opacity: 0, y: -2 }}
              transition={shouldReduceMotion ? { duration: 0 } : springFluid}
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                height: "100%",
              }}
            >
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </Panel>
      </Group>

      <DragOverlay dropAnimation={null}>
        {activeDragPayload ? (
          <DragOverlayContent payload={activeDragPayload} />
        ) : null}
      </DragOverlay>
    </div>
    </DndContext>
  );
}
