import { useQuery } from "@tanstack/react-query";

export function useIsAdmin() {
  return useQuery<{ isAdmin: boolean }>({
    queryKey: ['/api/admin/is-admin'],
    queryFn: async () => {
      const res = await fetch('/api/admin/is-admin', { credentials: 'include' });
      if (!res.ok) {
        return { isAdmin: false };
      }
      return res.json();
    },
  });
}
