import { useCompanyLogo } from "@/lib/company-logo";

export function CompanyBrand({ name, logoPath, light = false }: { name: string; logoPath?: string | null; light?: boolean }) {
  const logo = useCompanyLogo(logoPath);
  return <div className={`flex min-w-0 items-center gap-3 ${light ? "text-forest-foreground" : "text-foreground"}`}>
    {logo.data && <img src={logo.data} alt={`${name} logo`} className="h-12 w-16 shrink-0 rounded-sm bg-card object-contain p-1" />}
    <span className="min-w-0 break-words font-display text-lg font-bold">{name}</span>
  </div>;
}