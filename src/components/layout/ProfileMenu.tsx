"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { User, LogOut, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { authService } from "@/modules/auth/services/auth.service";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuGroup,
} from "@/components/ui/dropdown-menu";

export function ProfileMenu() {
  const router = useRouter();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [role, setRole] = useState<string>("Admin");

  useEffect(() => {
    async function loadUser() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setEmail(user.email ?? null);
        if (user.user_metadata?.role) {
          setRole(user.user_metadata.role);
        }
      }
    }
    loadUser();
  }, []);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    const supabase = createClient();
    await authService.logout(supabase);
    router.push("/login");
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 rounded-full outline-none">
        <div className="w-8 h-8 rounded-full bg-secondary text-text flex items-center justify-center font-semibold text-sm border border-border hover:bg-accent transition-colors">
          <User size={16} />
        </div>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="flex items-center gap-3 py-2 font-normal">
            <div className="w-8 h-8 rounded-full bg-secondary text-text flex items-center justify-center border border-border shrink-0">
              <User size={16} />
            </div>
            <div className="flex flex-col space-y-0.5 overflow-hidden">
              <p className="text-sm font-medium text-foreground truncate capitalize">{role}</p>
              <p className="text-xs text-muted truncate">{email || "Loading..."}</p>
            </div>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem 
          className="cursor-pointer text-destructive focus:text-destructive focus:bg-destructive/10 py-2" 
          onClick={handleLogout}
          disabled={isLoggingOut}
        >
          {isLoggingOut ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <LogOut className="mr-2 h-4 w-4" />
          )}
          <span>{isLoggingOut ? "Logging out..." : "Log out"}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
