"use client";

const TOKEN_KEY = "scic_token";
const USER_KEY = "scic_user";

export type AuthUser = {
  username: string;
  role: "admin" | "saisie" | "lecture";
  nom_affichage: string;
};

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function getUser(): AuthUser | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch {
    return null;
  }
}

export function setAuth(token: string, user: AuthUser): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  // notifier les composants d'auth
  window.dispatchEvent(new Event("scic:auth-change"));
}

export function clearAuth(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  window.dispatchEvent(new Event("scic:auth-change"));
}

export async function login(username: string, password: string): Promise<AuthUser> {
  const form = new URLSearchParams({ username, password });
  const base =
    typeof window === "undefined"
      ? process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"
      : "";
  const res = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(detail || "Identifiants invalides");
  }
  const data: { access_token: string; user: AuthUser } = await res.json();
  setAuth(data.access_token, data.user);
  return data.user;
}
