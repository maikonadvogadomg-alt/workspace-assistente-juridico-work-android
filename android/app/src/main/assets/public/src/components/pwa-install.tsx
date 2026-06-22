import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Download, X } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function PwaInstallBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem("pwa-install-dismissed") === "true";
    } catch {
      return false;
    }
  });
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    if (window.matchMedia("(display-mode: standalone)").matches) {
      setIsInstalled(true);
      return;
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener("beforeinstallprompt", handler);

    window.addEventListener("appinstalled", () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    });

    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setIsInstalled(true);
    }
    setDeferredPrompt(null);
  };

  const handleDismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem("pwa-install-dismissed", "true");
    } catch {}
  };

  if (isInstalled || dismissed || !deferredPrompt) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 flex items-center gap-3 p-3 rounded-md bg-primary text-primary-foreground shadow-lg max-w-md mx-auto" data-testid="pwa-install-banner">
      <Download className="w-5 h-5 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">Instalar no celular</p>
        <p className="text-xs opacity-80">Use como app, sem perder seus codigos</p>
      </div>
      <Button
        variant="secondary"
        size="sm"
        onClick={handleInstall}
        data-testid="button-pwa-install"
      >
        Instalar
      </Button>
      <button
        onClick={handleDismiss}
        className="p-1 opacity-70 hover:opacity-100"
        data-testid="button-pwa-dismiss"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
