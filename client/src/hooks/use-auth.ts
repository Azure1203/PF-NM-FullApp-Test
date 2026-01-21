import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { User } from "@shared/models/auth";

type AuthResult = { user: User | null; notAllowed?: boolean };

async function fetchUser(): Promise<AuthResult> {
  const response = await fetch("/api/auth/user", {
    credentials: "include",
  });

  if (response.status === 401) {
    return { user: null };
  }

  if (response.status === 403) {
    // User is authenticated but not on the whitelist
    return { user: null, notAllowed: true };
  }

  if (!response.ok) {
    throw new Error(`${response.status}: ${response.statusText}`);
  }

  const user = await response.json();
  return { user };
}

async function logout(): Promise<void> {
  window.location.href = "/api/logout";
}

export function useAuth() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery<AuthResult>({
    queryKey: ["/api/auth/user"],
    queryFn: fetchUser,
    retry: false,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  const logoutMutation = useMutation({
    mutationFn: logout,
    onSuccess: () => {
      queryClient.setQueryData(["/api/auth/user"], { user: null });
    },
  });

  return {
    user: data?.user ?? null,
    isLoading,
    isAuthenticated: !!data?.user,
    isNotAllowed: data?.notAllowed ?? false,
    logout: logoutMutation.mutate,
    isLoggingOut: logoutMutation.isPending,
  };
}
