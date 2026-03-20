import { Heart24Regular } from "@fluentui/react-icons";
import { Button } from "./Button";
import { DialogContent, DialogHeader, DialogFooter } from "./DialogBase";
interface DonationModalProps {
  open: boolean;
  onConfirm: () => void;
}

export function DonationModal({ open, onConfirm }: DonationModalProps) {
  const handleDonateClick = () => {
    window.open("https://revolut.me/elpideus", "_blank");
    onConfirm();
  };

  return (
    <DialogContent
      open={open}
      onOpenChange={onConfirm}
      title="Support TeleVault"
      hideTitle
      maxWidth="500px"
    >
      <DialogHeader
        title="Support TeleVault"
        description="A message from the developer."
        onClose={onConfirm}
      />
      <div className="px-6 py-6 text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary shadow-inner">
          <Heart24Regular className="h-8 w-8" />
        </div>
        
        <h3 className="mb-3 text-xl font-semibold text-[var(--tv-text-primary)]">
          Hi! I'm the solo developer behind TeleVault.
        </h3>
        
        <div className="space-y-4 text-[var(--tv-type-body)] text-[var(--tv-text-secondary)] leading-relaxed text-left sm:text-center">
          <p>
            I'm building TeleVault as an open-source project to provide a premium self-hosted vault experience for everyone.
          </p>
          <p>
            Maintaining and improving this project takes a lot of time and effort. If you find TeleVault useful, please consider supporting its development with a donation.
          </p>
          <p className="text-[var(--tv-type-body-sm)] opacity-80">
            Your support helps keep the project alive and ensures I can continue adding new features!
          </p>
        </div>
      </div>
      
      <DialogFooter>
        <Button
          variant="ghost"
          size="lg"
          className="flex-1 sm:flex-none"
          onClick={onConfirm}
        >
          Maybe Later
        </Button>
        <Button
          variant="primary"
          size="lg"
          className="flex-1 sm:flex-none gap-2"
          onClick={handleDonateClick}
        >
          <Heart24Regular className="h-5 w-5" />
          Support Project
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
