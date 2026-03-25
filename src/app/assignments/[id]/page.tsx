"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { GradingResult } from "@/types/grading";

type User = {
  id: string;
  role: "TEACHER" | "STUDENT";
  name: string;
};

type Assignment = {
  id: string;
  title: string;
  description: string | null;
  dueDate: string | null;
  classId: string;
  class: { id: string; name: string };
};

type Submission = {
  id: string;
  studentId: string;
  imagePath: string;
  gradingResult: GradingResult;
  createdAt: string;
  student?: { name: string; email: string };
};

export default function AssignmentPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const assignmentId = params.id;

  const [user, setUser] = useState<User | null>(null);
  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [loading, setLoading] = useState(true);

  async function loadData() {
    setLoading(true);
    setError("");
    try {
      const [meRes, assignmentRes] = await Promise.all([
        fetch("/api/auth/me"),
        fetch(`/api/assignments/${assignmentId}`)
      ]);

      if (!meRes.ok) {
        router.replace("/login");
        return;
      }

      const meData = await meRes.json();
      setUser(meData);

      const assignmentData = await assignmentRes.json();
      if (!assignmentRes.ok) {
        setError(assignmentData.error || "Failed to load assignment");
        return;
      }
      setAssignment(assignmentData.assignment);

      const submissionsRes = await fetch(`/api/submissions?assignmentId=${assignmentId}`);
      const submissionsData = await submissionsRes.json();
      if (!submissionsRes.ok) {
        setError(submissionsData.error || "Failed to load submissions");
        return;
      }

      if (meData.role === "TEACHER") {
        setSubmissions(submissionsData.submissions || []);
      } else {
        setSubmission(submissionsData.submission || null);
      }
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (assignmentId) {
      loadData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignmentId]);

  async function uploadSubmission(e: FormEvent) {
    e.preventDefault();
    if (!file) {
      setError("Please choose an image");
      return;
    }

    setPending(true);
    setError("");
    const formData = new FormData();
    formData.set("assignmentId", assignmentId);
    formData.set("image", file);

    try {
      const res = await fetch("/api/submissions", {
        method: "POST",
        body: formData
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Submit failed");
        return;
      }
      setSubmission(data.submission);
      setFile(null);
    } catch {
      setError("Network error");
    } finally {
      setPending(false);
    }
  }

  if (loading) {
    return <main className="p-6">Loading...</main>;
  }

  return (
    <main className="max-w-5xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{assignment?.title}</h1>
          <p className="text-sm text-slate-600">
            Class: {assignment?.class.name} | Due:{" "}
            {assignment?.dueDate ? new Date(assignment.dueDate).toLocaleString() : "Not set"}
          </p>
        </div>
        <Link href={assignment ? `/classes/${assignment.classId}` : "/dashboard"} className="text-blue-600">
          Back to Class
        </Link>
      </div>

      {assignment?.description ? (
        <section className="rounded-xl border bg-white p-4">
          <h2 className="font-semibold mb-2">Assignment Description</h2>
          <p className="text-sm whitespace-pre-wrap">{assignment.description}</p>
        </section>
      ) : null}

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {user?.role === "STUDENT" ? (
        <>
          <section className="rounded-xl border bg-white p-4">
            <h2 className="font-semibold mb-3">Upload Homework Image</h2>
            <form onSubmit={uploadSubmission} className="space-y-2">
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                required={!submission}
              />
              <button type="submit" className="bg-blue-600 text-white disabled:opacity-50" disabled={pending}>
                {pending ? "Uploading..." : submission ? "Resubmit and Regrade" : "Upload and Grade"}
              </button>
            </form>
          </section>

          {submission ? (
            <section className="rounded-xl border bg-white p-4 space-y-3">
              <h2 className="font-semibold">My Grading Result</h2>
              <img src={submission.imagePath} alt="submission" className="max-h-64 rounded border" />
              <p className="font-medium">
                Score: {submission.gradingResult.overallScore}/{submission.gradingResult.maxScore}
              </p>
              <p className="text-sm">{submission.gradingResult.summary}</p>
              <div className="space-y-2">
                {submission.gradingResult.checks.map((check) => (
                  <div key={check.item} className="rounded border p-2 text-sm">
                    <p className="font-medium">
                      {check.item}: {check.score}/{check.maxScore}
                    </p>
                    <p>{check.comment}</p>
                  </div>
                ))}
              </div>
              <div>
                <p className="font-medium text-sm">Suggestions</p>
                <ul className="list-disc ml-5 text-sm">
                  {submission.gradingResult.suggestions.map((tip) => (
                    <li key={tip}>{tip}</li>
                  ))}
                </ul>
              </div>
            </section>
          ) : null}
        </>
      ) : null}

      {user?.role === "TEACHER" ? (
        <section className="rounded-xl border bg-white p-4">
          <h2 className="font-semibold mb-3">Class Submissions</h2>
          <div className="space-y-3">
            {submissions.length === 0 ? <p className="text-sm text-slate-500">No submissions yet</p> : null}
            {submissions.map((item) => (
              <article key={item.id} className="rounded border p-3">
                <p className="font-medium">
                  {item.student?.name} ({item.student?.email})
                </p>
                <p className="text-sm mb-2">
                  Score: {item.gradingResult.overallScore}/{item.gradingResult.maxScore} | Submitted at:{" "}
                  {new Date(item.createdAt).toLocaleString()}
                </p>
                <img src={item.imagePath} alt="submission" className="max-h-56 rounded border mb-2" />
                <p className="text-sm">{item.gradingResult.summary}</p>
              </article>
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}
