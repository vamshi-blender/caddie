"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Logout01Icon,
  Moon02Icon,
  Settings01Icon,
  Sun03Icon,
} from "@hugeicons/core-free-icons";
import { applyTheme, getSavedTheme, saveTheme, type Theme } from "@/lib/theme";
import "./UserMenu.css";

interface UserMenuProps {
  userName: string;
  userEmail: string;
  onLogout: () => void;
  variant: "expanded" | "rail";
}

export default function UserMenu({ userName, userEmail, onLogout, variant }: UserMenuProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState<Theme | null>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
    }

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;

    function updatePosition() {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;

      if (variant === "rail") {
        setPosition({ top: rect.bottom, left: rect.right + 8 });
      } else {
        setPosition({ top: rect.top, left: rect.left });
      }
    }

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open, variant]);

  const menu = open && position && typeof document !== "undefined"
    ? createPortal(
        <div
          ref={menuRef}
          className={`user-menu-popover user-menu-popover--${variant}`}
          style={{ top: position.top, left: position.left }}
          role="menu"
        >
          <div className="user-menu-header">
            <span className="user-menu-avatar" aria-hidden="true">
              {userName.charAt(0)}
            </span>
            <span className="user-menu-info">
              <span className="user-menu-name">{userName}</span>
              <span className="user-menu-email" title={userEmail}>
                {userEmail}
              </span>
            </span>
          </div>

          <button
            type="button"
            role="menuitem"
            className="user-menu-item"
            onClick={() => {
              setOpen(false);
              router.push("/settings");
            }}
          >
            <HugeiconsIcon icon={Settings01Icon} size={18} />
            <span>Settings</span>
          </button>

          <button type="button" role="menuitem" className="user-menu-item" onClick={onToggleTheme}>
            <HugeiconsIcon icon={theme === "light" ? Moon02Icon : Sun03Icon} size={18} />
            <span>{theme === "light" ? "Switch to dark theme" : "Switch to light theme"}</span>
          </button>

          <button
            type="button"
            role="menuitem"
            className="user-menu-item user-menu-item--danger"
            onClick={() => {
              setOpen(false);
              onLogout();
            }}
          >
            <HugeiconsIcon icon={Logout01Icon} size={18} />
            <span>Log out</span>
          </button>
        </div>,
        document.body,
      )
    : null;

  if (variant === "rail") {
    return (
      <>
        <button
          ref={triggerRef}
          type="button"
          className="user-menu-rail-avatar"
          aria-label={`${userName}, open profile menu`}
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => setOpen((current) => !current)}
        >
          {userName.charAt(0)}
        </button>
        {menu}
      </>
    );
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="user-menu-row"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="user-menu-avatar" aria-hidden="true">
          {userName.charAt(0)}
        </span>
        <span className="user-menu-info">
          <span className="user-menu-name">{userName}</span>
          <span className="user-menu-email" title={userEmail}>
            {userEmail}
          </span>
        </span>
      </button>
      {menu}
    </>
  );
}
