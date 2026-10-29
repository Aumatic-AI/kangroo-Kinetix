"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { createClient } from "@/lib/supabase/client";
import { Loader2, AlertCircle } from "lucide-react";

import { authService } from "../services/auth.service";

export function LoginPage() {
  const router = useRouter();
  const supabase = createClient();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!email || !password) {
      setError("Please enter both email and password.");
      return;
    }

    setIsLoading(true);

    // Call the Auth Service, passing the Client-Side Supabase instance to ensure cookies are set
    const result = await authService.login(supabase, email, password);

    if (!result.success) {
      setError(result.error || "Login failed");
      setIsLoading(false);
      return;
    }

    // Successful login, middleware will allow us into dashboard
    router.push("/dashboard");
    router.refresh();
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-text">Welcome back</h1>
        <p className="text-muted mt-1 text-sm">Sign in to your Kinetix account</p>
      </div>

      <form onSubmit={handleLogin} className="flex flex-col gap-4">
        {error && (
          <div className="flex items-center gap-2 p-3 pl-4 text-sm bg-danger-light rounded-md animate-fade-in">
            <AlertCircle size={16} className="flex-shrink-0" />
            <p>{error}</p>
          </div>
        )}

        <div className="flex flex-col gap-2">
          <label htmlFor="email" className="text-sm font-medium text-text">Email address</label>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
            disabled={isLoading}
          />
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="password" className="text-sm font-medium text-text">Password</label>
          <Input
            isPassword
            id="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            required
            disabled={isLoading}
          />
        </div>

        <Button type="submit" className="mt-2 w-full flex items-center justify-center gap-2" disabled={isLoading}>
          {isLoading && <Loader2 className="animate-spin" size={16} />}
          {isLoading ? "Signing in..." : "Sign in"}
        </Button>
      </form>

      <p className="text-center text-sm text-muted">
        Don&apos;t have an account?{" "}
        <Link href="/signup" className="text-text font-medium hover:underline">
          Sign up
        </Link>
      </p>
    </div>
  );
}
