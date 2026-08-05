"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Archive03Icon,
  Cancel01Icon,
  Delete02Icon,
  Edit03Icon,
  MoreHorizontalIcon,
  PanelLeftIcon,
  PencilEdit02Icon,
  PinIcon,
  PinOffIcon,
  Search01Icon,
} from "@hugeicons/core-free-icons";
import UserMenu from "./UserMenu";
import "./Sidebar.css";

const TRANSITION_MS = 220;

export interface SidebarChat {
  id: string;
  title: string;
  titlePending: boolean;
  pinned: boolean;
}

interface SidebarProps {
  open: boolean;
  // "overlay": fixed slide-in panel + backdrop, used on small viewports.
  // "docked": part of the normal layout flow, used on large viewports —
  // collapses to a slim icon rail instead of hiding entirely.
  variant: "overlay" | "docked";
  railCollapsed?: boolean;
  onToggleRail?: () => void;
  userName: string;
  userEmail: string;
  chats: SidebarChat[];
  activeChatId: string | null;
  busy: boolean;
  onClose: () => void;
  onSearchChats: (query: string) => string[];
  onNewChat: () => void;
  onSelectChat: (chatId: string) => void;
  onRenameChat: (chatId: string, title: string) => void;
  onTogglePinChat: (chatId: string) => void;
  onDeleteChat: (chatId: string) => Promise<boolean>;
  onLogout: () => void;
}

export default function Sidebar({
  open,
  variant,
  railCollapsed = false,
  onToggleRail,
  userName,
  userEmail,
  chats,
  activeChatId,
  busy,
  onClose,
  onSearchChats,
  onNewChat,
  onSelectChat,
  onRenameChat,
  onTogglePinChat,
  onDeleteChat,
  onLogout,
}: SidebarProps) {
  const [mounted, setMounted] = useState(open);
  const [visible, setVisible] = useState(false);
  const [menuOpenFor, setMenuOpenFor] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteErrorFor, setDeleteErrorFor] = useState<string | null>(null);
  const [searchValue, setSearchValue] = useState("");
  // null = no search ran yet (empty query); otherwise ranked chat ids.
  const [searchResultIds, setSearchResultIds] = useState<string[] | null>(null);
  const menuAnchorRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Docked sidebar is always mounted — it collapses to a rail instead of
    // unmounting, so none of the overlay's enter/exit bookkeeping applies.
    if (variant === "docked") return;

    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMounted(true);
      return;
    }

    setVisible(false);
    setMenuOpenFor(null);
    setRenamingId(null);
    setSearchValue("");
    setSearchResultIds(null);
    const timeout = setTimeout(() => setMounted(false), TRANSITION_MS);
    return () => clearTimeout(timeout);
  }, [open, variant]);

  // Debounced search-as-you-type.
  useEffect(() => {
    const query = searchValue.trim();
    if (!query) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSearchResultIds(null);
      return;
    }

    const timeout = setTimeout(() => setSearchResultIds(onSearchChats(query)), 250);
    return () => clearTimeout(timeout);
  }, [searchValue, onSearchChats]);

  function clearSearch() {
    setSearchValue("");
    setSearchResultIds(null);
  }

  function focusSearch() {
    // Deferred so it runs after the rail->expanded width transition starts
    // (and after onToggleRail's state update re-renders the full content),
    // otherwise focus lands on an input that's still mid fade-in/hidden.
    requestAnimationFrame(() => searchInputRef.current?.focus());
  }

  function openSidebarAndFocusSearch() {
    onToggleRail?.();
    focusSearch();
  }

  useEffect(() => {
    if (variant === "docked" || !open || !mounted) return;

    let enterFrame = 0;
    const mountedFrame = requestAnimationFrame(() => {
      enterFrame = requestAnimationFrame(() => setVisible(true));
    });

    return () => {
      cancelAnimationFrame(mountedFrame);
      cancelAnimationFrame(enterFrame);
    };
  }, [mounted, open, variant]);

  useEffect(() => {
    // Only the overlay variant behaves like a modal (Escape closes it, global
    // typing routes into its search box). The docked rail is just part of the
    // page, so none of that applies while it's showing.
    if (variant !== "overlay" || !open) return;

    function handleGlobalKeyDown(event: globalThis.KeyboardEvent) {
      if (event.defaultPrevented) return;
      const target = event.target;
      const isEditable =
        target instanceof HTMLElement &&
        target.closest('input, textarea, select, [contenteditable="true"], [role="textbox"]');

      if (event.key === "Escape") {
        if (!isEditable) {
          event.preventDefault();
          onClose();
        }
        return;
      }

      if (
        event.isComposing ||
        event.ctrlKey ||
        event.altKey ||
        event.metaKey ||
        Array.from(event.key).length !== 1 ||
        isEditable
      ) {
        return;
      }

      const input = searchInputRef.current;
      if (!input || input.disabled) return;

      event.preventDefault();
      const selectionStart = input.selectionStart ?? input.value.length;
      const selectionEnd = input.selectionEnd ?? input.value.length;
      input.setRangeText(event.key, selectionStart, selectionEnd, "end");
      setSearchValue(input.value);
      input.focus();
    }

    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, [onClose, open, variant]);

  useEffect(() => {
    if (!menuOpenFor) return;

    function handlePointerDown(event: PointerEvent) {
      if (!menuAnchorRef.current?.contains(event.target as Node)) {
        setMenuOpenFor(null);
        setDeleteErrorFor(null);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [menuOpenFor]);

  function startRename(chat: SidebarChat) {
    setRenameValue(chat.title);
    setRenamingId(chat.id);
    setMenuOpenFor(null);
  }

  function commitRename(chatId: string, cancelled = false) {
    if (cancelled) return;
    const title = renameValue.trim();
    if (title) onRenameChat(chatId, title);
    setRenamingId(null);
  }

  async function deleteChat(chat: SidebarChat) {
    setDeletingId(chat.id);
    setDeleteErrorFor(null);
    const deleted = await onDeleteChat(chat.id);
    setDeletingId(null);

    if (deleted) {
      setMenuOpenFor(null);
    } else {
      setDeleteErrorFor(chat.id);
    }
  }

  function renderChatList(sectionChats: SidebarChat[]) {
    return (
      <ul className="sidebar-chat-list">
        {sectionChats.map((chat) => {
          const active = chat.id === activeChatId;
          const renaming = chat.id === renamingId;

          return (
            <li
              key={chat.id}
              className={`sidebar-chat-item${
                active ? " sidebar-chat-item--active" : ""
              }`}
            >
              {renaming ? (
                <input
                  className="sidebar-chat-rename-input"
                  value={renameValue}
                  maxLength={56}
                  autoFocus
                  aria-label={`Rename ${chat.title}`}
                  onFocus={(event) => event.currentTarget.select()}
                  onChange={(event) => setRenameValue(event.target.value)}
                  onBlur={(event) => {
                    commitRename(chat.id, event.currentTarget.dataset.cancelled === "true");
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      commitRename(chat.id);
                    } else if (event.key === "Escape") {
                      event.preventDefault();
                      event.currentTarget.dataset.cancelled = "true";
                      setRenamingId(null);
                    }
                  }}
                />
              ) : (
                <button
                  type="button"
                  className="sidebar-chat-link"
                  aria-current={active ? "page" : undefined}
                  onClick={() => {
                    onSelectChat(chat.id);
                    onClose();
                  }}
                >
                  {chat.titlePending ? (
                    <span
                      className="sidebar-chat-title-loading"
                      role="status"
                      aria-label="Generating conversation title"
                    >
                      <span className="sidebar-chat-title-spinner" aria-hidden="true" />
                      <span>Generating title</span>
                    </span>
                  ) : (
                    <span className="sidebar-chat-title">{chat.title}</span>
                  )}
                </button>
              )}
              {!chat.titlePending && (
                <div
                  className="sidebar-chat-menu-anchor"
                  ref={menuOpenFor === chat.id ? menuAnchorRef : undefined}
                >
                  <button
                    type="button"
                    className="sidebar-chat-menu-btn"
                    aria-label={`Open conversation options for ${chat.title}`}
                    aria-expanded={menuOpenFor === chat.id}
                    onClick={() => {
                      setDeleteErrorFor(null);
                      setMenuOpenFor((current) =>
                        current === chat.id ? null : chat.id,
                      );
                    }}
                  >
                    <HugeiconsIcon icon={MoreHorizontalIcon} size={18} />
                  </button>
                  {menuOpenFor === chat.id && (
                    <div className="sidebar-chat-menu" role="menu">
                    <button
                      type="button"
                      role="menuitem"
                      className="sidebar-chat-menu-item"
                      onClick={() => startRename(chat)}
                    >
                      <HugeiconsIcon icon={Edit03Icon} size={18} />
                      <span>Rename</span>
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      className="sidebar-chat-menu-item"
                      onClick={() => {
                        onTogglePinChat(chat.id);
                        setMenuOpenFor(null);
                      }}
                    >
                      <HugeiconsIcon icon={chat.pinned ? PinOffIcon : PinIcon} size={18} />
                      <span>{chat.pinned ? "Unpin" : "Pin"}</span>
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      className="sidebar-chat-menu-item"
                      disabled
                      title="Archive will be available later"
                    >
                      <HugeiconsIcon icon={Archive03Icon} size={18} />
                      <span>Archive</span>
                      <span className="sidebar-coming-soon">Later</span>
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      className="sidebar-chat-menu-item sidebar-chat-menu-item--danger"
                      disabled={deletingId === chat.id || (busy && active)}
                      title={busy && active ? "Stop the response before deleting" : undefined}
                      onClick={() => void deleteChat(chat)}
                    >
                      <HugeiconsIcon icon={Delete02Icon} size={18} />
                      <span>{deletingId === chat.id ? "Deleting…" : "Delete"}</span>
                    </button>
                    {deleteErrorFor === chat.id && (
                      <p className="sidebar-chat-menu-error" role="alert">
                        Could not delete this chat. Try again.
                      </p>
                    )}
                    </div>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    );
  }

  if (variant === "overlay" && !mounted) return null;

  const pinnedChats = chats.filter((chat) => chat.pinned);
  const recentChats = chats.filter((chat) => !chat.pinned);
  const searching = searchValue.trim().length > 0;
  const searchResults = (searchResultIds ?? [])
    .map((id) => chats.find((chat) => chat.id === id))
    .filter((chat): chat is SidebarChat => chat !== undefined);

  const docked = variant === "docked";
  const panelClassName = docked
    ? `sidebar-panel sidebar-panel--docked${
        railCollapsed ? " sidebar-panel--rail" : ""
      }`
    : `sidebar-panel ${visible ? "sidebar-panel--visible" : ""}`;

  return (
    <>
      {variant === "overlay" && (
        <div
          className={`sidebar-backdrop ${visible ? "sidebar-backdrop--visible" : ""}`}
          onClick={onClose}
        />
      )}
      <aside className={panelClassName} aria-label="Conversation history">
        {/* Animating the <aside>'s own width (below) keeps this a single
            persistent element rather than swapping subtrees, so the
            expand/collapse transition actually has something to animate.
            Content fades out early in the collapse so it isn't visible
            being squeezed narrower than the sidebar itself. */}
        <div className="sidebar-panel-content">
          <div className="sidebar-header">
            <span className="sidebar-brand">
              <Image
                className="sidebar-brand-logo"
                src="/Caddie_Logo_Full.svg"
                alt="Caddie"
                width={98}
                height={28}
                priority
              />
            </span>
            <button
              type="button"
              className="sidebar-icon-btn"
              onClick={docked ? onToggleRail : onClose}
              aria-label="Close sidebar"
            >
              <HugeiconsIcon icon={docked ? PanelLeftIcon : Cancel01Icon} size={20} />
            </button>
          </div>

          <nav className="sidebar-primary-nav">
          <button
            type="button"
            className={`sidebar-nav-row${
              activeChatId === null ? " sidebar-nav-row--active" : ""
            }`}
            aria-current={activeChatId === null ? "page" : undefined}
            onClick={() => {
              onNewChat();
              onClose();
            }}
          >
            <HugeiconsIcon icon={PencilEdit02Icon} size={18} />
            <span>New chat</span>
          </button>
          <div className="sidebar-search-row">
            <HugeiconsIcon icon={Search01Icon} size={18} />
            <input
              ref={searchInputRef}
              className="sidebar-search-input"
              value={searchValue}
              placeholder="Search"
              aria-label="Search chats"
              spellCheck={false}
              onChange={(event) => setSearchValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  clearSearch();
                  event.currentTarget.blur();
                }
              }}
            />
            {searchValue.length > 0 && (
              <button
                type="button"
                className="sidebar-search-clear"
                aria-label="Clear search"
                onClick={clearSearch}
              >
                <HugeiconsIcon icon={Cancel01Icon} size={14} />
              </button>
            )}
          </div>
        </nav>

        <div className="sidebar-history">
          {searching ? (
            <section className="sidebar-history-section" aria-labelledby="results-heading">
              <h2 className="sidebar-section-heading" id="results-heading">
                Results
              </h2>
              {searchResultIds === null ? null : searchResults.length > 0 ? (
                renderChatList(searchResults)
              ) : (
                <p className="sidebar-empty-state">No chats match your search.</p>
              )}
            </section>
          ) : chats.length === 0 ? (
            <>
              <h2 className="sidebar-section-heading">Recents</h2>
              <p className="sidebar-empty-state">Your conversations will appear here.</p>
            </>
          ) : (
            <>
              {pinnedChats.length > 0 && (
                <section className="sidebar-history-section" aria-labelledby="pinned-heading">
                  <h2 className="sidebar-section-heading" id="pinned-heading">
                    Pinned
                  </h2>
                  {renderChatList(pinnedChats)}
                </section>
              )}
              {recentChats.length > 0 && (
                <section className="sidebar-history-section" aria-labelledby="recents-heading">
                  <h2 className="sidebar-section-heading" id="recents-heading">
                    Recents
                  </h2>
                  {renderChatList(recentChats)}
                </section>
              )}
            </>
          )}
        </div>

        <div className="sidebar-footer">
          <UserMenu variant="expanded" userName={userName} userEmail={userEmail} onLogout={onLogout} />
        </div>
        </div>

        {docked && (
          <div className="sidebar-rail-buttons" aria-hidden={!railCollapsed}>
            <button
              type="button"
              className="sidebar-icon-btn"
              onClick={onToggleRail}
              aria-label="Open sidebar"
              tabIndex={railCollapsed ? 0 : -1}
            >
              <HugeiconsIcon icon={PanelLeftIcon} size={20} />
            </button>
            <button
              type="button"
              className="sidebar-icon-btn"
              onClick={onNewChat}
              aria-label="New chat"
              tabIndex={railCollapsed ? 0 : -1}
            >
              <HugeiconsIcon icon={PencilEdit02Icon} size={18} />
            </button>
            <button
              type="button"
              className="sidebar-icon-btn"
              onClick={openSidebarAndFocusSearch}
              aria-label="Search chats"
              tabIndex={railCollapsed ? 0 : -1}
            >
              <HugeiconsIcon icon={Search01Icon} size={18} />
            </button>

            <UserMenu variant="rail" userName={userName} userEmail={userEmail} onLogout={onLogout} />
          </div>
        )}
      </aside>
    </>
  );
}
