"use client";

import { Children, isValidElement, useEffect, useId, useRef, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  AlertDiamondIcon,
  CableIcon,
  ChevronDownIcon,
  Copy01Icon,
  Tick01Icon,
  Upload01Icon,
} from "@hugeicons/core-free-icons";
import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import type { ToolApprovalRequest } from "@/lib/agents/protocol";
import "katex/dist/katex.min.css";
import "./MessageList.css";

export type AgentToolStatus =
  | "running"
  | "awaiting_approval"
  | "completed"
  | "rejected"
  | "failed";

export interface CommentaryWorkItem {
  id: string;
  type: "commentary";
  content: string;
}

export interface ToolWorkItem {
  id: string;
  type: "tool";
  callId: string;
  name: string;
  executor: "client" | "server";
  arguments: Record<string, unknown>;
  status: AgentToolStatus;
  output?: string;
  startedAt: number;
  completedAt?: number;
}

export type AgentWorkItem = CommentaryWorkItem | ToolWorkItem;

export interface AgentWorkLog {
  startedAt: number;
  pausedAt?: number;
  completedAt?: number;
  items: AgentWorkItem[];
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  status?: "pending" | "streaming" | "approval" | "done" | "error";
  error?: string;
  toolRequest?: ToolApprovalRequest;
  work?: AgentWorkLog;
}

interface MessageListProps {
  messages: ChatMessage[];
  onApproveTool?: (messageId: string) => void;
  onRejectTool?: (messageId: string) => void;
  onInstructTool?: (messageId: string, instruction: string) => void;
  onRetry?: (messageId: string) => void;
}

const COPIED_RESET_MS = 2000;

interface MarkdownMessageProps {
  content: string;
  renderMermaid?: boolean;
}

type MermaidTheme = "default" | "dark";

interface HastNode {
  tagName?: string;
  value?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
}

const safeInlineStyleProperties = new Set([
  "align-content",
  "align-items",
  "background-color",
  "border",
  "border-bottom",
  "border-color",
  "border-left",
  "border-radius",
  "border-right",
  "border-style",
  "border-top",
  "border-width",
  "box-sizing",
  "column-gap",
  "color",
  "display",
  "flex",
  "flex-direction",
  "flex-wrap",
  "font-family",
  "font-size",
  "font-style",
  "font-weight",
  "gap",
  "grid-template-columns",
  "grid-template-rows",
  "height",
  "justify-content",
  "letter-spacing",
  "line-height",
  "list-style-type",
  "margin",
  "margin-bottom",
  "margin-left",
  "margin-right",
  "margin-top",
  "max-height",
  "max-width",
  "min-height",
  "min-width",
  "object-fit",
  "opacity",
  "overflow",
  "overflow-wrap",
  "overflow-x",
  "overflow-y",
  "padding",
  "padding-bottom",
  "padding-left",
  "padding-right",
  "padding-top",
  "row-gap",
  "text-align",
  "text-decoration",
  "text-indent",
  "text-transform",
  "vertical-align",
  "white-space",
  "width",
  "word-break",
]);

const safeInlineStyleValue = /^[a-z0-9#(),.%+\-\s]+$/i;
const unsafeInlineStyleFunction = /(?:url|expression|var|attr)\s*\(/i;

function sanitizeInlineStyle(style: string): string {
  return style
    .split(";")
    .slice(0, 64)
    .map((declaration) => declaration.trim())
    .filter(Boolean)
    .flatMap((declaration) => {
      const separator = declaration.indexOf(":");
      if (separator === -1) return [];

      const property = declaration.slice(0, separator).trim().toLowerCase();
      const value = declaration.slice(separator + 1).trim();
      if (
        !safeInlineStyleProperties.has(property) ||
        !value ||
        value.length > 100 ||
        !safeInlineStyleValue.test(value) ||
        unsafeInlineStyleFunction.test(value)
      ) {
        return [];
      }

      return [`${property}: ${value}`];
    })
    .join("; ");
}

const safeHtmlTagNames = [
  "address",
  "article",
  "aside",
  "audio",
  "bdi",
  "bdo",
  "button",
  "center",
  "data",
  "datalist",
  "fieldset",
  "figcaption",
  "figure",
  "footer",
  "form",
  "header",
  "hgroup",
  "iframe",
  "label",
  "legend",
  "main",
  "map",
  "mark",
  "menu",
  "meter",
  "nav",
  "optgroup",
  "option",
  "output",
  "picture",
  "progress",
  "search",
  "section",
  "select",
  "slot",
  "textarea",
  "time",
  "track",
  "u",
  "video",
  "wbr",
];

function rehypeSafeInlineStyles() {
  return (tree: HastNode) => {
    function visit(node: HastNode) {
      const style = node.properties?.style;
      if (typeof style === "string") {
        const sanitizedStyle = sanitizeInlineStyle(style);
        if (sanitizedStyle) {
          node.properties!.style = sanitizedStyle;
        } else {
          delete node.properties!.style;
        }
      }
      node.children?.forEach(visit);
    }

    visit(tree);
  };
}

const youtubeEmbedHosts = new Set([
  "youtube.com",
  "www.youtube.com",
  "www.youtube-nocookie.com",
]);

function getSafeHttpsEmbedUrl(src: unknown): URL | null {
  if (typeof src !== "string") return null;

  try {
    const url = new URL(src);
    return (
      url.protocol === "https:" &&
      (url.port === "" || url.port === "443") &&
      !url.username &&
      !url.password
        ? url
        : null
    );
  } catch {
    return null;
  }
}

function isSafeYouTubeEmbed(src: unknown): src is string {
  const url = getSafeHttpsEmbedUrl(src);
  const videoId = url?.pathname.match(/^\/embed\/([a-zA-Z0-9_-]+)$/)?.[1];
  return Boolean(url && youtubeEmbedHosts.has(url.hostname) && videoId);
}

function rehypeSafeEmbeds() {
  return (tree: HastNode) => {
    function visit(node: HastNode) {
      if (!node.children) return;

      node.children = node.children.filter((child) => {
        if (child.tagName === "iframe" && !getSafeHttpsEmbedUrl(child.properties?.src)) {
          return false;
        }
        visit(child);
        return true;
      });
    }

    visit(tree);
  };
}

const markdownSanitizeSchema = {
  ...defaultSchema,
  tagNames: [...new Set([...(defaultSchema.tagNames ?? []), ...safeHtmlTagNames])],
  attributes: {
    ...defaultSchema.attributes,
    "*": [
      ...(defaultSchema.attributes?.["*"] ?? []),
      "ariaAtomic",
      "ariaBusy",
      "ariaControls",
      "ariaCurrent",
      "ariaDescribedBy",
      "ariaDetails",
      "ariaDisabled",
      "ariaExpanded",
      "ariaHasPopup",
      "ariaHidden",
      "ariaLabel",
      "ariaLabelledBy",
      "ariaLive",
      "ariaPressed",
      "ariaRoleDescription",
      "role",
      "style",
    ],
    div: [
      ...(defaultSchema.attributes?.div ?? []),
      ["className", "math", "math-display"],
    ],
    span: [
      ...(defaultSchema.attributes?.span ?? []),
      ["className", "math", "math-inline"],
    ],
    input: [
      "accept",
      "autoComplete",
      "checked",
      "disabled",
      "list",
      "max",
      "maxLength",
      "min",
      "minLength",
      "multiple",
      "name",
      "pattern",
      "placeholder",
      "readOnly",
      "required",
      "size",
      "step",
      [
        "type",
        "button",
        "checkbox",
        "color",
        "date",
        "datetime-local",
        "email",
        "month",
        "number",
        "password",
        "radio",
        "range",
        "search",
        "tel",
        "text",
        "time",
        "url",
        "week",
      ],
      "value",
    ],
    button: ["disabled", "name", ["type", "button"], "value"],
    form: ["autoComplete", "name"],
    fieldset: ["disabled", "name"],
    label: ["htmlFor"],
    select: ["autoComplete", "disabled", "multiple", "name", "required", "size"],
    optgroup: ["disabled", "label"],
    option: ["disabled", "label", "selected", "value"],
    textarea: [
      "autoComplete",
      "cols",
      "disabled",
      "maxLength",
      "minLength",
      "name",
      "placeholder",
      "readOnly",
      "required",
      "rows",
      ["wrap", "hard", "soft"],
    ],
    output: ["htmlFor", "name", "value"],
    data: ["value"],
    time: ["dateTime"],
    progress: ["max", "value"],
    meter: ["high", "low", "max", "min", "optimum", "value"],
    audio: [["controls", true], "loop", "muted", ["preload", "auto", "metadata", "none"], "src"],
    video: [
      ["controls", true],
      "height",
      "loop",
      "muted",
      "playsInline",
      "poster",
      ["preload", "auto", "metadata", "none"],
      "src",
      "width",
    ],
    source: [
      "media",
      "sizes",
      "src",
      "srcSet",
      ["type", /^(?:audio|image|video)\/[a-z0-9.+-]+$/i],
    ],
    track: ["default", ["kind", "captions", "chapters", "descriptions", "metadata", "subtitles"], "label", "src", "srcLang"],
    iframe: [
      "allowFullScreen",
      [
        "allow",
        /^(?:(?:accelerometer|autoplay|clipboard-write|encrypted-media|gyroscope|picture-in-picture|web-share)(?:;\s*|$))+$/,
      ],
      ["frameBorder", "0"],
      "height",
      ["referrerPolicy", "strict-origin-when-cross-origin"],
      "src",
      "title",
      "width",
    ],
  },
  required: {
    ...defaultSchema.required,
    // The default schema coerces every input into a disabled task-list checkbox.
    // Raw form controls need to retain their explicitly sanitized type instead.
    input: {},
  },
  // Active documents and executable/plug-in content are never exposed.
  // Inline styles and the one allowed iframe provider are filtered first.
  strip: [...new Set([...(defaultSchema.strip ?? []), "base", "embed", "object", "style"])] ,
};

function getMermaidTheme(): MermaidTheme {
  return document.documentElement.dataset.theme === "light" ? "default" : "dark";
}

function MermaidDiagram({ source }: { source: string }) {
  const reactId = useId();
  const diagramId = `mermaid-${reactId.replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const [theme, setTheme] = useState<MermaidTheme>(getMermaidTheme);
  const [svg, setSvg] = useState<string | null>(null);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    const observer = new MutationObserver(() => setTheme(getMermaidTheme()));
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;
    // Reset the derived render result when the diagram source or theme changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSvg(null);
    setHasError(false);

    async function renderDiagram() {
      try {
        const { default: mermaid } = await import("mermaid");
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          theme,
        });
        const result = await mermaid.render(diagramId, source);
        if (!cancelled) setSvg(result.svg);
      } catch {
        if (!cancelled) setHasError(true);
      }
    }

    void renderDiagram();
    return () => {
      cancelled = true;
    };
  }, [diagramId, source, theme]);

  if (hasError) {
    return (
      <div className="message-mermaid-error">
        <span>Unable to render this Mermaid diagram.</span>
        <pre>
          <code className="language-mermaid">{source}</code>
        </pre>
      </div>
    );
  }

  if (!svg) {
    return <div className="message-mermaid-loading">Rendering diagram…</div>;
  }

  return (
    <div
      className="message-mermaid-diagram"
      role="img"
      aria-label="Mermaid diagram"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

function getMermaidSource(children: React.ReactNode): string | null {
  const child = Children.toArray(children)[0];
  if (!isValidElement<{ className?: string; children?: React.ReactNode }>(child)) return null;
  if (!child.props.className?.split(" ").includes("language-mermaid")) return null;
  return String(child.props.children ?? "").replace(/\n$/, "");
}

function getNodeText(node: HastNode): string {
  if (typeof node.value === "string") return node.value;
  return node.children?.map(getNodeText).join("") ?? "";
}

function getSelectedOptionValues(node: HastNode): string[] {
  const values: string[] = [];

  function visit(child: HastNode) {
    if (child.tagName === "option" && child.properties?.selected === true) {
      const value = child.properties.value;
      values.push(typeof value === "string" ? value : getNodeText(child));
    }
    child.children?.forEach(visit);
  }

  node.children?.forEach(visit);
  return values;
}

function MarkdownMessage({ content, renderMermaid = true }: MarkdownMessageProps) {
  return (
    <div className="message-markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[
          rehypeRaw,
          rehypeSafeInlineStyles,
          rehypeSafeEmbeds,
          [rehypeSanitize, markdownSanitizeSchema],
          rehypeKatex,
        ]}
        components={{
          pre: ({ children }) => {
            const mermaidSource = getMermaidSource(children);
            if (renderMermaid && mermaidSource !== null) {
              return <MermaidDiagram source={mermaidSource} />;
            }
            return <pre>{children}</pre>;
          },
          table: ({ children }) => (
            <div className="message-markdown-table-wrap">
              <table>{children}</table>
            </div>
          ),
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer">
              {children}
            </a>
          ),
          input: ({ node: _node, checked, ...props }) => (
            <input
              {...props}
              checked={checked}
              readOnly={checked !== undefined || props.readOnly}
            />
          ),
          button: ({ node: _node, ...props }) => <button {...props} type="button" />,
          form: ({ node: _node, action: _action, method: _method, target: _target, ...props }) => (
            <form {...props} onSubmit={(event) => event.preventDefault()} />
          ),
          select: ({ node, children, multiple, ...props }) => {
            const selectedValues = getSelectedOptionValues(node as unknown as HastNode);
            return (
              <select
                {...props}
                multiple={multiple}
                defaultValue={multiple ? selectedValues : selectedValues[0]}
              >
                {children}
              </select>
            );
          },
          option: ({ node: _node, selected: _selected, ...props }) => <option {...props} />,
          textarea: ({ node: _node, children, value, ...props }) => (
            <textarea
              {...props}
              defaultValue={value ?? Children.toArray(children).join("")}
            />
          ),
          iframe: ({ node: _node, allow, allowFullScreen, src, title, ...props }) => {
            const isYouTube = isSafeYouTubeEmbed(src);
            return (
              <iframe
                {...props}
                src={src}
                title={title || (isYouTube ? "Embedded YouTube video" : "Embedded content")}
                loading="lazy"
                referrerPolicy="strict-origin-when-cross-origin"
                sandbox={isYouTube ? undefined : ""}
                allow={isYouTube ? allow : undefined}
                allowFullScreen={isYouTube ? allowFullScreen : undefined}
              />
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

function formatElapsed(milliseconds: number): string {
  const seconds = Math.max(1, Math.round(milliseconds / 1000));
  if (seconds < 60) return `${seconds} sec`;

  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return remainder ? `${minutes} min ${remainder} sec` : `${minutes} min`;
}

function humanizeToolName(name: string): string {
  return name
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function prettyToolData(value: string): string {
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
}

function isToolFailure(status: AgentToolStatus): boolean {
  return status === "failed" || status === "rejected";
}

function ToolLineContent({ item }: { item: ToolWorkItem }) {
  const failed = isToolFailure(item.status);
  return (
    <>
      <HugeiconsIcon
        icon={failed ? AlertDiamondIcon : CableIcon}
        size={16}
        className={`agent-work-tool-icon${failed ? " agent-work-tool-icon--failed" : ""}`}
      />
      <span
        className={`agent-work-tool-name${
          item.status === "running" ? " agent-work-shimmer" : ""
        }`}
      >
        {humanizeToolName(item.name)}
      </span>
    </>
  );
}

function AgentWorkLogView({
  work,
  status,
  hasFinalAnswer,
}: {
  work: AgentWorkLog;
  status: ChatMessage["status"];
  hasFinalAnswer: boolean;
}) {
  const unsettled = !work.completedAt && status !== "done" && status !== "error";
  const ticking = unsettled && !work.pausedAt;
  // While the agent is still working (no final answer yet) the section is
  // locked open; it auto-collapses the moment the final answer starts.
  const working = unsettled && !hasFinalAnswer;
  const [expanded, setExpanded] = useState(working);
  const wasWorking = useRef(working);
  const [now, setNow] = useState(work.startedAt);

  useEffect(() => {
    if (wasWorking.current && !working) setExpanded(false);
    wasWorking.current = working;
  }, [working]);

  useEffect(() => {
    if (!ticking) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [ticking]);

  if (work.items.length === 0) return null;

  const elapsed = (work.completedAt ?? work.pausedAt ?? now) - work.startedAt;
  const summary = unsettled
    ? status === "approval"
      ? `Waiting for approval · ${formatElapsed(elapsed)}`
      : `Working for ${formatElapsed(elapsed)}`
    : `Worked for ${formatElapsed(elapsed)}`;

  return (
    <section className={`agent-work${unsettled ? " agent-work--active" : ""}`}>
      <button
        type="button"
        className={`agent-work-toggle${working ? " agent-work-toggle--locked" : ""}`}
        aria-expanded={expanded}
        onClick={() => {
          if (!working) setExpanded((current) => !current);
        }}
      >
        <span className={`agent-work-label${working ? " agent-work-shimmer" : ""}`}>
          {summary}
        </span>
        {!working && (
          <HugeiconsIcon
            icon={ChevronDownIcon}
            size={15}
            className={`agent-work-chevron${expanded ? " agent-work-chevron--open" : ""}`}
          />
        )}
      </button>

      <div
        className={`agent-work-collapse${expanded ? " agent-work-collapse--open" : ""}`}
        inert={!expanded}
      >
        <div className="agent-work-items" aria-live={unsettled ? "polite" : "off"}>
          {work.items.map((item) =>
            item.type === "commentary" ? (
              <div key={item.id} className="agent-work-item agent-work-commentary">
                <div className="agent-work-commentary-text">
                  <MarkdownMessage content={item.content} renderMermaid={false} />
                </div>
              </div>
            ) : Object.keys(item.arguments).length > 0 || item.output ? (
              <details key={item.id} className="agent-work-item agent-work-tool">
                <summary className="agent-work-tool-line">
                  <ToolLineContent item={item} />
                </summary>
                <div className="agent-work-tool-details">
                  {Object.keys(item.arguments).length > 0 && (
                    <div>
                      <span>Arguments</span>
                      <pre>{JSON.stringify(item.arguments, null, 2)}</pre>
                    </div>
                  )}
                  {item.output && (
                    <div>
                      <span>Result</span>
                      <pre>{prettyToolData(item.output)}</pre>
                    </div>
                  )}
                </div>
              </details>
            ) : (
              <div key={item.id} className="agent-work-item agent-work-tool">
                <div className="agent-work-tool-line agent-work-tool-line--static">
                  <ToolLineContent item={item} />
                </div>
              </div>
            ),
          )}
        </div>
      </div>
    </section>
  );
}

export default function MessageList({
  messages,
  onApproveTool,
  onRejectTool,
  onInstructTool,
  onRetry,
}: MessageListProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [instructingId, setInstructingId] = useState<string | null>(null);
  const [instructionValue, setInstructionValue] = useState("");
  const resetTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  function closeInstruction() {
    setInstructingId(null);
    setInstructionValue("");
  }

  function submitInstruction(messageId: string) {
    const instruction = instructionValue.trim();
    if (!instruction) return;
    closeInstruction();
    onInstructTool?.(messageId, instruction);
  }

  async function handleCopy(message: ChatMessage) {
    await navigator.clipboard.writeText(message.content);
    setCopiedId(message.id);
    clearTimeout(resetTimeout.current);
    resetTimeout.current = setTimeout(() => setCopiedId(null), COPIED_RESET_MS);
  }

  return (
    <div className="message-list">
      {messages.map((message) => {
        const hasWork = Boolean(message.work?.items.length);

        return (
          <div key={message.id} className={`message-row message-row--${message.role}`}>
          {message.role === "user" ? (
            <div className="message-bubble message-bubble--user">
              <MarkdownMessage content={message.content} />
            </div>
          ) : message.status === "pending" && !message.content && !hasWork ? (
            <span className="message-pending-dot" aria-label="Waiting for response" />
          ) : (
            <div className="message-column">
              {message.work && hasWork && (
                <AgentWorkLogView
                  work={message.work}
                  status={message.status}
                  hasFinalAnswer={Boolean(message.content)}
                />
              )}
              {message.content && (
                <div
                  className={`message-bubble message-bubble--assistant${
                    message.status === "streaming" || message.status === "pending"
                      ? " message-bubble--streaming"
                      : ""
                  }`}
                >
                  <MarkdownMessage
                    content={message.content}
                    renderMermaid={
                      message.status !== "streaming" && message.status !== "pending"
                    }
                  />
                  {(message.status === "streaming" || message.status === "pending") && (
                    <span className="message-cursor" />
                  )}
                </div>
              )}
              {message.status === "approval" && message.toolRequest && (
                <div className="tool-approval" role="group" aria-label={message.toolRequest.title}>
                  <div className="tool-approval-eyebrow">Approval needed</div>
                  <strong>{message.toolRequest.title}</strong>
                  <p>{message.toolRequest.description}</p>
                  <div className="tool-approval-actions">
                    <button
                      type="button"
                      aria-expanded={instructingId === message.id}
                      onClick={() => {
                        if (instructingId === message.id) {
                          closeInstruction();
                        } else {
                          setInstructionValue("");
                          setInstructingId(message.id);
                        }
                      }}
                    >
                      Do this instead
                    </button>
                    <button type="button" onClick={() => onRejectTool?.(message.id)}>
                      Not now
                    </button>
                    <button
                      type="button"
                      className="tool-approval-allow"
                      onClick={() => onApproveTool?.(message.id)}
                    >
                      {message.toolRequest.confirmLabel || "Allow"}
                    </button>
                  </div>
                  {instructingId === message.id && (
                    <input
                      className="tool-approval-instruction"
                      autoFocus
                      maxLength={2000}
                      placeholder="Tell Caddie what to do instead"
                      aria-label="Tell Caddie what to do instead"
                      value={instructionValue}
                      onChange={(event) => setInstructionValue(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          submitInstruction(message.id);
                        } else if (event.key === "Escape") {
                          event.preventDefault();
                          closeInstruction();
                        }
                      }}
                    />
                  )}
                </div>
              )}
              {message.status === "error" && (
                <div className="message-error" role="alert">
                  <span>{message.error ?? "Something went wrong."}</span>
                  <button type="button" onClick={() => onRetry?.(message.id)}>
                    Try again
                  </button>
                </div>
              )}
              {message.status === "done" && message.content && (
                <div className="message-actions">
                  <button
                    type="button"
                    className="message-action-btn"
                    aria-label="Copy response"
                    onClick={() => handleCopy(message)}
                  >
                    <HugeiconsIcon icon={copiedId === message.id ? Tick01Icon : Copy01Icon} size={18} />
                  </button>
                  <button type="button" className="message-action-btn" aria-label="Share">
                    <HugeiconsIcon icon={Upload01Icon} size={18} />
                  </button>
                </div>
              )}
            </div>
          )}
          </div>
        );
      })}
    </div>
  );
}
