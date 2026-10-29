import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// Private bucket; current branding logos are readable for customer signup. Historical files stay member-only.
export async function uploadCompanyLogo(companyId: string, file: File) {
  if (file.size > 2 * 1024 * 1024) throw new Error("Logo must be 2 MB or smaller");
  if (!file.type.startsWith("image/")) throw new Error("Logo must be an image");
  const ext = file.name.split(".").pop()?.toLowerCase() || "png";
  const path = `${companyId}/logo-${Date.now()}.${ext}`;
  const up = await supabase.storage.from("company-logos").upload(path, file, { upsert: true, contentType: file.type });
  if (up.error) throw up.error;
  const { error } = await supabase.from("companies").update({ logo_url: path }).eq("id", companyId);
  if (error) throw error;
  return path;
}

export function useCompanyLogo(path: string | null | undefined) {
  return useQuery({
    queryKey: ["company-logo", path],
    enabled: !!path,
    staleTime: 50 * 60 * 1000,
    queryFn: async () => {
      if (!path) return null;
      const { data, error } = await supabase.storage.from("company-logos").createSignedUrl(path, 3600);
      if (error) throw error;
      return data?.signedUrl ?? null;
    },
  });
}
