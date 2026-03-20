import { Warning24Regular } from "@fluentui/react-icons";
import { Button } from "./Button";
import { DialogContent, DialogHeader, DialogFooter } from "./DialogBase";

interface EarlyAccessWarningModalProps {
  open: boolean;
  onConfirm: () => void;
}

export function EarlyAccessWarningModal({
  open,
  onConfirm,
}: EarlyAccessWarningModalProps) {
  return (
    <DialogContent
      open={open}
      onOpenChange={() => {}}
      title="Early Access Software — Important Notice"
      hideTitle
      maxWidth="520px"
      closeOnOutsideClick={false}
      closeOnEscape={false}
    >
      <DialogHeader
        title="Early Access Software — Important Notice"
        description="Please read carefully before continuing."
        onClose={() => {}}
      />
      <div className="px-6 py-4">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--tv-color-warning,#f59e0b)]/10 text-[var(--tv-color-warning,#f59e0b)]">
          <Warning24Regular className="h-7 w-7" />
        </div>

        <div className="space-y-4 text-[var(--tv-type-body)] text-[var(--tv-text-secondary)] leading-relaxed">
          <p>
            TeleVault is currently in an{" "}
            <strong className="text-[var(--tv-text-primary)]">
              early access, proof-of-concept stage
            </strong>
            . While it is functional and safe to explore, it has not yet reached
            a level of stability suitable for production or mission-critical use.
          </p>
          <p>
            As the project evolves, future updates may introduce breaking
            changes that could result in{" "}
            <strong className="text-[var(--tv-text-primary)]">
              data loss, file corruption, or inaccessibility of previously
              uploaded content.
            </strong>{" "}
            Every effort will be made to prevent this, but it cannot be
            guaranteed at this stage of development.
          </p>
          <p>
            For your own protection, please{" "}
            <strong className="text-[var(--tv-text-primary)]">
              avoid uploading files you cannot afford to lose
            </strong>
            , sensitive personal or professional documents, or any data for
            which you do not have a separate backup.
          </p>
          <p className="text-[var(--tv-type-body-sm)] opacity-75">
            The developer assumes no liability for any loss or corruption of
            data arising from the use of this software during its early access
            period. By clicking 'I Understand', you acknowledge these risks and
            agree to use TeleVault accordingly.
          </p>
        </div>
      </div>
      <DialogFooter>
        <Button
          variant="primary"
          size="lg"
          className="w-full sm:w-auto"
          onClick={onConfirm}
        >
          I Understand
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
