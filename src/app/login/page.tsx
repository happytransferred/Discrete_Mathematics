"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Mode = "login" | "register";
type Role = "TEACHER" | "STUDENT";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("login");
  const [role, setRole] = useState<Role>("STUDENT");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me").then((res) => {
      if (res.ok) {
        router.replace("/dashboard");
      }
    });
  }, [router]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setPending(true);
    try {
      const endpoint = mode === "login" ? "/api/auth/login" : "/api/auth/register";
      const payload = mode === "login" ? { email, password } : { name, email, password, role };

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Request failed");
        return;
      }

      router.replace("/dashboard");
    } catch {
      setError("Network error");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="min-h-screen grid place-items-center p-4">
      <section className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold mb-2">Discrete Math Homework Platform</h1>
        <p className="text-sm text-slate-600 mb-4">MVP Login / Register</p>

        <div className="flex gap-2 mb-4">
          <button
            type="button"
            className={mode === "login" ? "bg-slate-900 text-white" : "bg-slate-100"}
            onClick={() => setMode("login")}
          >
            Login
          </button>
          <button
            type="button"
            className={mode === "register" ? "bg-slate-900 text-white" : "bg-slate-100"}
            onClick={() => setMode("register")}
          >
            Register
          </button>
        </div>

        <form onSubmit={onSubmit} className="space-y-3">
          {mode === "register" ? (
            <>
              <input
                placeholder="Name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
              <select value={role} onChange={(e) => setRole(e.target.value as Role)}>
                <option value="STUDENT">Student</option>
                <option value="TEACHER">Teacher</option>
              </select>
            </>
          ) : null}

          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />

          {error ? <p className="text-sm text-red-600">{error}</p> : null}

          <button type="submit" className="w-full bg-blue-600 text-white disabled:opacity-50" disabled={pending}>
            {pending ? "Processing..." : mode === "login" ? "Login" : "Register and Login"}
          </button>
        </form>
      </section>
    </main>
  );
}
