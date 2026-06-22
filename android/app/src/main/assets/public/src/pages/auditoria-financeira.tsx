import { Link } from "wouter";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AuditoriaFinanceira() {
  return (
    <div className="h-screen flex flex-col" data-testid="page-auditoria">
      <div className="flex items-center gap-2 px-3 py-2 border-b bg-background">
        <Link href="/">
          <Button size="icon" variant="ghost" data-testid="button-back-home">
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </Link>
        <span className="text-sm font-medium">Auditoria Pericial — Dr. Maikon da Rocha Caldeira</span>
      </div>
      <iframe
        src="/auditoria.html"
        className="flex-1 w-full border-0"
        title="Auditoria Financeira"
        data-testid="iframe-auditoria"
      />
    </div>
  );
}
