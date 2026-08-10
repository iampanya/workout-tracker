"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { UserPlus } from "@phosphor-icons/react/ssr";
import { signup } from "@/lib/actions/auth";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";

export default function SignupPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const result = await signup({ username, email, password, inviteCode });
    if (result.error) {
      setError(result.error);
      setLoading(false);
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <form onSubmit={handleSubmit} className="space-y-4">
          <h1 className="text-2xl font-semibold">Create account</h1>
          <Input
            label="Username"
            required
            autoCapitalize="none"
            autoCorrect="off"
            autoComplete="username"
            placeholder="yourname"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
          <Input
            type="email"
            label="Email"
            required
            autoCapitalize="none"
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Input
            type="password"
            label="Password"
            required
            autoComplete="new-password"
            placeholder="At least 6 characters"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <Input
            label="Invite code"
            required
            autoCapitalize="none"
            autoCorrect="off"
            placeholder="Your invite code"
            value={inviteCode}
            onChange={(e) => setInviteCode(e.target.value)}
          />
          {error && <p className="text-sm text-danger">{error}</p>}
          <Button
            type="submit"
            variant="primary"
            icon={<UserPlus className="h-4 w-4" />}
            loading={loading}
            className="w-full"
          >
            Create account
          </Button>
        </form>
        <p className="mt-4 text-center text-sm text-muted">
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-accent hover:underline">
            Log in
          </Link>
        </p>
      </Card>
    </main>
  );
}
