import { Button } from "./Button";
import { DialogContent, DialogHeader, DialogFooter } from "./DialogBase";

interface DisclaimerModalProps {
  open: boolean;
  onConfirm: () => void;
}

export function DisclaimerModal({ open, onConfirm }: DisclaimerModalProps) {
  return (
    <DialogContent
      open={open}
      onOpenChange={() => {}} // Controlled by onConfirm
      title="Service Usage & Guidelines"
      hideTitle
      maxWidth="500px"
      closeOnOutsideClick={false}
      closeOnEscape={false}
    >
      <DialogHeader
        title="Service Usage & Guidelines"
        description="Please read this important notice regarding the use of TeleVault."
        onClose={() => {}} // Disable manual close
      />
      <div className="px-6 py-4">
        <div className="space-y-4 text-[var(--tv-type-body)] text-[var(--tv-text-secondary)] leading-relaxed">
          <p>
            TeleVault is powered by Telegram's cloud infrastructure to provide a secure and private vault for files.
          </p>
          <p>
            To ensure the longevity and stability of this platform for all users, please note that{" "}
            <strong className="text-[var(--tv-text-primary)]">
              excessive data hoarding or abuse of this service may go against Telegram's Terms of Service.
            </strong>
          </p>
          <p>
            Please use TeleVault responsibly. Maintaining a premium and reliable experience depends on upholding these standards.
          </p>
          <p className="text-[var(--tv-type-body-sm)] opacity-80">
            By clicking 'I Understand', you acknowledge these guidelines and agree to use the service in accordance with Telegram's TOS.
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
