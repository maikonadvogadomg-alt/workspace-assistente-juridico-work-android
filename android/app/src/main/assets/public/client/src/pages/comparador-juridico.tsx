import { Link } from "wouter";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function ComparadorJuridico() {
  return (
    <div className="h-screen flex flex-col" data-testid="page-comparador">
      <div className="flex items-center gap-2 px-3 py-2 border-b bg-background">
        <Link href="/">
          <Button size="icon" variant="ghost" data-testid="button-back-home">
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </Link>
        <span className="text-sm font-medium">Comparador Juridico (TJMG + BCB)</span>
      </div>
      <iframe
        src="/comparador.html"
        className="flex-1 w-full border-0"
        title="Comparador Juridico"
        data-testid="iframe-comparador"
      />
    </div>
  );
}
