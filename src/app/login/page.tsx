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
        setError(data.error || "请求失败，请稍后重试。");
        return;
      }

      router.replace("/dashboard");
    } catch {
      setError("网络异常，请检查网络后重试。");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="portal-shell grid min-h-screen place-items-center">
      <section className="portal-card grid w-full max-w-5xl overflow-hidden lg:grid-cols-[1.15fr_0.85fr]">
        <div className="bg-slate-950 px-8 py-10 text-white">
          <span className="portal-chip border-white/20 bg-white/10 text-white">课程门户</span>
          <h1 className="mt-5 text-4xl font-semibold leading-tight">离散数学课程平台</h1>
          <p className="mt-4 max-w-md text-sm leading-7 text-slate-200">
            支持教师发布课程任务、学生加入班级、上传作业并查看学习反馈。第一阶段聚焦课程门户化与教学入口统一。
          </p>
          <div className="mt-8 space-y-3 text-sm text-slate-200">
            <p>1. 教师可创建授课班级并发布作业。</p>
            <p>2. 学生通过班级码加入课程空间。</p>
            <p>3. 所有账号与作业数据已部署到云端，可跨设备访问。</p>
          </div>
        </div>

        <div className="p-6 sm:p-8">
          <h2 className="text-2xl font-semibold text-slate-950">登录与注册</h2>
          <p className="mt-2 text-sm text-slate-600">请选择身份并进入课程平台。</p>

          <div className="mt-6 flex gap-2">
            <button
              type="button"
              className={mode === "login" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700"}
              onClick={() => setMode("login")}
            >
              登录
            </button>
            <button
              type="button"
              className={mode === "register" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700"}
              onClick={() => setMode("register")}
            >
              注册
            </button>
          </div>

          <form onSubmit={onSubmit} className="mt-6 space-y-3">
            {mode === "register" ? (
              <>
                <input
                  placeholder="姓名"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
                <select value={role} onChange={(e) => setRole(e.target.value as Role)}>
                  <option value="STUDENT">学生</option>
                  <option value="TEACHER">教师</option>
                </select>
              </>
            ) : null}

            <input
              type="email"
              placeholder="邮箱"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <input
              type="password"
              placeholder="密码"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />

            {error ? <p className="text-sm text-red-600">{error}</p> : null}

            <button type="submit" className="w-full bg-teal-700 text-white disabled:opacity-50" disabled={pending}>
              {pending ? "提交中..." : mode === "login" ? "登录课程平台" : "注册并进入平台"}
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}
