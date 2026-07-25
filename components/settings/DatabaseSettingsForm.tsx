"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowLeft01Icon,
  ViewIcon,
  ViewOffIcon,
} from "@hugeicons/core-free-icons";
import "./DatabaseSettingsForm.css";

interface DatabaseSettingsResponse {
  configured: boolean;
  user?: string;
  dsn?: string;
  passwordConfigured?: boolean;
  updatedAt?: string;
  databaseName?: string;
  error?: string;
}

type RequestState = "idle" | "loading" | "testing" | "saving";

export default function DatabaseSettingsForm() {
  const [showPassword, setShowPassword] = useState(false);
  const [user, setUser] = useState("");
  const [password, setPassword] = useState("");
  const [dsn, setDsn] = useState("");
  const [passwordConfigured, setPasswordConfigured] = useState(false);
  const [requestState, setRequestState] = useState<RequestState>("loading");
  const [message, setMessage] = useState<{
    kind: "success" | "error";
    text: string;
  } | null>(null);

  useEffect(() => {
    let active = true;

    async function loadSettings() {
      try {
        const response = await fetch("/api/settings/database", {
          cache: "no-store",
        });
        const body = (await response.json()) as DatabaseSettingsResponse;
        if (!response.ok) throw new Error(body.error ?? "Could not load settings.");
        if (!active) return;

        if (body.configured) {
          setUser(body.user ?? "");
          setDsn(body.dsn ?? "");
          setPasswordConfigured(Boolean(body.passwordConfigured));
        }
      } catch (error) {
        if (active) {
          setMessage({
            kind: "error",
            text:
              error instanceof Error
                ? error.message
                : "Could not load database settings.",
          });
        }
      } finally {
        if (active) setRequestState("idle");
      }
    }

    void loadSettings();
    return () => {
      active = false;
    };
  }, []);

  async function submitRequest(
    endpoint: string,
    method: "POST" | "PUT",
    state: "testing" | "saving",
  ) {
    setMessage(null);
    setRequestState(state);
    try {
      const response = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user, password, dsn }),
      });
      const body = (await response.json()) as DatabaseSettingsResponse;
      if (!response.ok) throw new Error(body.error ?? "The operation failed.");

      if (state === "saving") {
        setPassword("");
        setPasswordConfigured(true);
      }
      setMessage({
        kind: "success",
        text:
          state === "saving"
            ? "Connection tested and saved for all chats."
            : `Connection successful${body.databaseName ? ` (${body.databaseName})` : ""}.`,
      });
    } catch (error) {
      setMessage({
        kind: "error",
        text: error instanceof Error ? error.message : "The operation failed.",
      });
    } finally {
      setRequestState("idle");
    }
  }

  const busy = requestState !== "idle";
  const formReady = Boolean(user.trim() && dsn.trim() && (password || passwordConfigured));

  return (
    <div className="settings-page">
      <div className="settings-container">
        <Link href="/" className="settings-back-link">
          <HugeiconsIcon icon={ArrowLeft01Icon} size={16} />
          <span>Back to chat</span>
        </Link>

        <h1 className="settings-title">Settings</h1>
        <p className="settings-subtitle">
          Connect Caddie to your Oracle database so it can answer questions from
          your data.
        </p>

        <div className="settings-card">
          <h2 className="settings-section-title">Database connection</h2>
          <p className="settings-section-hint">
            This single connection is shared by every user and every chat.
          </p>

          <form
            className="settings-form"
            onSubmit={(event) => {
              event.preventDefault();
              void submitRequest("/api/settings/database", "PUT", "saving");
            }}
          >
            <div className="settings-field">
              <label className="settings-label" htmlFor="db-user">
                Username
              </label>
              <input
                id="db-user"
                name="user"
                type="text"
                className="settings-input"
                placeholder="Database username"
                autoComplete="off"
                spellCheck={false}
                value={user}
                onChange={(event) => setUser(event.target.value)}
                disabled={busy}
                required
              />
            </div>

            <div className="settings-field">
              <label className="settings-label" htmlFor="db-password">
                Password
              </label>
              <div className="settings-password-wrap">
                <input
                  id="db-password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  className="settings-input"
                  placeholder="Database password"
                  autoComplete="new-password"
                  spellCheck={false}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  disabled={busy}
                />
                <button
                  type="button"
                  className="settings-password-toggle"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  onClick={() => setShowPassword((current) => !current)}
                  disabled={busy}
                >
                  <HugeiconsIcon
                    icon={showPassword ? ViewOffIcon : ViewIcon}
                    size={18}
                  />
                </button>
              </div>
              {passwordConfigured && !password ? (
                <p className="settings-field-hint">
                  A password is saved. Leave this blank to keep it.
                </p>
              ) : null}
            </div>

            <div className="settings-field">
              <label className="settings-label" htmlFor="db-dsn">
                Connection string (DSN)
              </label>
              <textarea
                id="db-dsn"
                name="dsn"
                className="settings-input settings-textarea"
                placeholder="host:1521/service or a full Oracle connect descriptor"
                autoComplete="off"
                spellCheck={false}
                value={dsn}
                onChange={(event) => setDsn(event.target.value)}
                disabled={busy}
                required
              />
              <p className="settings-field-hint">
                Use an Easy Connect string or paste the full Oracle connect
                descriptor.
              </p>
            </div>

            {message ? (
              <p
                className={`settings-status settings-status-${message.kind}`}
                role={message.kind === "error" ? "alert" : "status"}
              >
                {message.text}
              </p>
            ) : null}

            <div className="settings-actions">
              <button
                type="submit"
                className="settings-submit-btn"
                disabled={busy || !formReady}
              >
                {requestState === "saving" ? "Saving…" : "Save"}
              </button>
              <button
                type="button"
                className="settings-secondary-btn"
                disabled={busy || !formReady}
                onClick={() =>
                  void submitRequest(
                    "/api/settings/database/test",
                    "POST",
                    "testing",
                  )
                }
              >
                {requestState === "testing" ? "Testing…" : "Test connection"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
