"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => {
        if (res.ok) {
          router.replace("/dashboard");
        } else {
          router.replace("/login");
        }
      })
      .catch(() => router.replace("/login"));
  }, [router]);

  return <main className="min-h-screen grid place-items-center">Loading...</main>;
}
