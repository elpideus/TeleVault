import type { DragPayload } from "../../../types/dnd";
import { DragPreview } from "./DragPreview";

interface DragOverlayContentProps {
  payload: DragPayload;
}

export function DragOverlayContent({ payload }: DragOverlayContentProps) {
  return <DragPreview {...payload} />;
}
