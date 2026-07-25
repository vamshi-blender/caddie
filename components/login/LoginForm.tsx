"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";
import { Loading03Icon, Moon02Icon, Sun03Icon, ViewIcon, ViewOffIcon } from "@hugeicons/core-free-icons";
import { applyTheme, getSavedTheme, saveTheme, type Theme } from "@/lib/theme";
import "./LoginForm.css";

export default function LoginForm() {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [theme, setTheme] = useState<Theme | null>(null);
  const [credentialFieldsReady, setCredentialFieldsReady] = useState(false);
  const emailInputRef = useRef<HTMLInputElement>(null);
  const passwordInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setTheme(getSavedTheme()));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  function onToggleTheme() {
    const next: Theme = theme === "light" ? "dark" : "light";
    setTheme(next);
    applyTheme(next);
    saveTheme(next);
  }

  function enableCredentialFields() {
    // Removing readonly before the browser focuses either field prevents
    // page-load autofill while preserving its saved-credential picker.
    emailInputRef.current?.removeAttribute("readonly");
    passwordInputRef.current?.removeAttribute("readonly");
    setCredentialFieldsReady(true);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const formData = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: formData.get("email"),
          password: formData.get("password"),
        }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: unknown;
        } | null;
        throw new Error(
          typeof body?.error === "string"
            ? body.error
            : "Login failed. Please try again.",
        );
      }

      router.replace("/");
      router.refresh();
    } catch (loginError) {
      setError(
        loginError instanceof Error
          ? loginError.message
          : "Login failed. Please try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="login-page">
      <button
        type="button"
        className="login-theme-toggle-btn"
        aria-pressed={theme === "light"}
        onClick={onToggleTheme}
        aria-label={theme === "light" ? "Switch to dark theme" : "Switch to light theme"}
      >
        <HugeiconsIcon icon={theme === "light" ? Moon02Icon : Sun03Icon} size={18} />
      </button>

      <div className="login-card">
        <div className="login-logo" aria-hidden="true" />

        <h1 className="login-title">Welcome back</h1>
        <p className="login-subtitle">Log in to continue to Caddie</p>

        {error && (
          <div className="login-error-banner" role="alert">
            {error}
          </div>
        )}

        <form
          className="login-form"
          method="post"
          onSubmit={handleSubmit}
          noValidate
        >
          <div className="login-field">
            <label className="login-label" htmlFor="login-email">
              Email address
            </label>
            <input
              ref={emailInputRef}
              id="login-email"
              name="email"
              type="email"
              className="login-input"
              placeholder="you@example.com"
              autoComplete="username"
              readOnly={!credentialFieldsReady}
              onPointerDown={enableCredentialFields}
              onFocus={enableCredentialFields}
              required
              disabled={isSubmitting}
            />
          </div>

          <div className="login-field">
            <div className="login-label-row">
              <label className="login-label" htmlFor="login-password">
                Password
              </label>
            </div>
            <div className="login-password-wrap">
              <input
                ref={passwordInputRef}
                id="login-password"
                name="password"
                type={showPassword ? "text" : "password"}
                className="login-input"
                placeholder="Enter your password"
                autoComplete="current-password"
                readOnly={!credentialFieldsReady}
                onPointerDown={enableCredentialFields}
                onFocus={enableCredentialFields}
                required
                disabled={isSubmitting}
              />
              <button
                type="button"
                className="login-password-toggle"
                aria-label={showPassword ? "Hide password" : "Show password"}
                onClick={() => setShowPassword((prev) => !prev)}
              >
                <HugeiconsIcon icon={showPassword ? ViewOffIcon : ViewIcon} size={18} />
              </button>
            </div>
          </div>

          <button type="submit" className="login-submit-btn" disabled={isSubmitting}>
            {isSubmitting ? (
              <span className="login-submit-loading" aria-hidden="true">
                <HugeiconsIcon icon={Loading03Icon} size={18} />
              </span>
            ) : (
              "Log in"
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
