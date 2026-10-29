"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { createClient } from "@/lib/supabase/client";
import { Loader2, AlertCircle, MailCheck } from "lucide-react";

import { authService } from "../services/auth.service";

export function SignupPage() {
  const router = useRouter();
  const supabase = createClient();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!fullName || !email || !password) {
      setError("Please fill in your name, email, and password.");
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }

    setIsLoading(true);

    const result = await authService.signUp(supabase, email, password, fullName);

    if (!result.success) {
      setError(result.error || "Sign up failed");
      setIsLoading(false);
      return;
    }

    if (result.needsEmailConfirmation) {
      setAwaitingConfirmation(true);
      setIsLoading(false);
      return;
    }

    // Already has a session (email confirmation disabled) — straight into the app.
    router.push("/dashboard");
    router.refresh();
  };

  if (awaitingConfirmation) {
    return (
      <div className="flex flex-col items-center gap-4 text-center">
        <MailCheck size={40} className="text-primary" />
        <h1 className="text-2xl font-bold text-text">Check your email</h1>
        <p className="text-muted text-sm">
          We sent a confirmation link to <span className="font-medium text-text">{email}</span>. Click it to activate your account, then sign in.
        </p>
        <Link href="/login" className="text-sm font-medium text-text hover:underline mt-2">
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-text">Create your account</h1>
        <p className="text-muted mt-1 text-sm">Get started with Kinetix</p>
      </div>

      <form onSubmit={handleSignup} className="flex flex-col gap-4">
        {error && (
          <div className="flex items-center gap-2 p-3 pl-4 text-sm bg-danger-light rounded-md animate-fade-in">
            <AlertCircle size={16} className="flex-shrink-0" />
            <p>{error}</p>
          </div>
        )}

        <div className="flex flex-col gap-2">
          <label htmlFor="fullName" className="text-sm font-medium text-text">Full name</label>
          <Input
            id="fullName"
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Jane Doe"
            required
            disabled={isLoading}
          />
        </div>

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
            placeholder="At least 8 characters"
            required
            disabled={isLoading}
          />
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="confirmPassword" className="text-sm font-medium text-text">Confirm password</label>
          <Input
            isPassword
            id="confirmPassword"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="••••••••"
            required
            disabled={isLoading}
          />
        </div>

        <Button type="submit" className="mt-2 w-full flex items-center justify-center gap-2" disabled={isLoading}>
          {isLoading && <Loader2 className="animate-spin" size={16} />}
          {isLoading ? "Creating account..." : "Create account"}
        </Button>
      </form>

      <p className="text-center text-sm text-muted">
        Already have an account?{" "}
        <Link href="/login" className="text-text font-medium hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
