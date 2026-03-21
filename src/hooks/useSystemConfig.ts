import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useSystemConfig() {
  return useQuery({
    queryKey: ["system-config"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("system_config")
        .select("config_key, config_value");
      if (error) throw error;
      const map: Record<string, string> = {};
      data?.forEach((row) => { map[row.config_key] = row.config_value; });
      return map;
    },
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });
}

export function useModuleLicenses() {
  return useQuery({
    queryKey: ["module-licenses"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("module_licenses")
        .select("*")
        .order("module_code");
      if (error) throw error;
      return data;
    },
    staleTime: 1000 * 60 * 10,
  });
}
