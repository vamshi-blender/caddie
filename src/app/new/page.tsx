import AgentChat from "./AgentChat";

type NewPageProps = {
  searchParams: Promise<{ prompt?: string | string[] }>;
};

export default async function NewPage({ searchParams }: NewPageProps) {
  const params = await searchParams;
  const prompt = Array.isArray(params.prompt) ? params.prompt[0] : params.prompt;

  return (
    <>
      <AgentChat initialPrompt={prompt ?? ""} />
      <script
        dangerouslySetInnerHTML={{
          __html: `
(() => {
  const setupSidebar = () => {
    const sidebar = document.querySelector('[data-caddie-sidebar="true"]');
    const section = document.querySelector('[data-caddie-main-section="true"]');
    const topbar = document.querySelector('[data-caddie-topbar="true"]');
    const inner = document.querySelector('[data-caddie-sidebar-inner="true"]');
    const toggle = document.querySelector('[data-caddie-sidebar-toggle="true"]');
    const logo = document.querySelector('[data-caddie-logo-mark="true"]');
    const fixedComposer = document.querySelector('[data-caddie-fixed-composer="true"]');
    const searchBox = document.querySelector('[data-caddie-search-box="true"]');
    const navButton = document.querySelector('[data-caddie-nav-button="true"]');
    const collapsedOnly = document.querySelector('[data-caddie-collapsed-only="true"]');
    const extendedOnly = document.querySelector('[data-caddie-extended-only="true"]');
    if (!sidebar || !section || !topbar || !inner || !toggle || !logo) return;

    let collapsed = false;

    const setCollapsed = (next) => {
      collapsed = next;
      const width = collapsed ? '48px' : '228px';
      sidebar.style.width = width;
      section.style.left = width;
      topbar.style.left = width;
      inner.style.alignItems = collapsed ? 'center' : 'flex-start';
      fixedComposer && (fixedComposer.style.left = width);
      logo.style.width = collapsed ? '24px' : '';
      logo.style.height = collapsed ? '24px' : '';
      logo.style.fontSize = collapsed ? '14px' : '';

      document.querySelectorAll('[data-caddie-sidebar-text="true"]').forEach((node) => {
        node.toggleAttribute('hidden', collapsed);
      });

      if (searchBox) {
        searchBox.style.width = collapsed ? '26px' : '';
        searchBox.style.height = collapsed ? '26px' : '';
        searchBox.style.border = collapsed ? '0' : '';
        searchBox.style.background = collapsed ? 'transparent' : '';
        searchBox.style.justifyContent = collapsed ? 'center' : '';
        searchBox.style.padding = collapsed ? '4px' : '';
      }

      if (navButton) {
        navButton.style.width = collapsed ? '26px' : '';
        navButton.style.justifyContent = collapsed ? 'center' : '';
        navButton.style.padding = collapsed ? '4px' : '';
      }

      collapsedOnly?.toggleAttribute('hidden', !collapsed);
      extendedOnly?.toggleAttribute('hidden', collapsed);
      toggle.toggleAttribute('hidden', collapsed);
      logo.setAttribute('title', collapsed ? 'Expand sidebar' : '');
      logo.style.cursor = collapsed ? 'pointer' : '';
    };

    toggle.addEventListener('click', () => setCollapsed(true));
    logo.addEventListener('click', () => {
      if (collapsed) setCollapsed(false);
    });
  };

  const setup = () => {
    const panel = document.querySelector('[data-caddie-process-panel="true"]');
    const toggle = document.querySelector('[data-caddie-process-toggle="true"]');
    const label = document.querySelector('[data-caddie-process-label="true"]');
    const chevron = document.querySelector('[data-caddie-process-chevron="true"]');
    if (!panel || !toggle || !label || !chevron) return;

    let isProcessing = label.textContent?.trim().startsWith('Thinking') ?? false;
    let isOpen = panel.getAttribute('data-caddie-process-open') !== 'false';

    const apply = () => {
      panel.style.transition = 'grid-template-rows 300ms ease, opacity 300ms ease, transform 300ms ease';
      panel.style.gridTemplateRows = isOpen ? '1fr' : '0fr';
      panel.style.opacity = isOpen ? '1' : '0';
      panel.style.transform = isOpen ? 'translateY(0)' : 'translateY(-4px)';
      panel.setAttribute('data-caddie-process-open', isOpen ? 'true' : 'false');
      chevron.style.transition = 'transform 300ms ease';
      chevron.style.transform = isOpen ? 'rotate(0deg)' : 'rotate(-90deg)';
    };

    const revealResponses = () => {
      document.querySelectorAll('[data-caddie-response="true"]').forEach((node) => {
        node.removeAttribute('hidden');
        node.setAttribute('data-visible', 'true');
      });
    };

    toggle.addEventListener('click', () => {
      if (isProcessing) {
        isOpen = true;
      } else {
        isOpen = !isOpen;
      }
      apply();
    });

    if (isProcessing) {
      isOpen = true;
      apply();

      window.setTimeout(() => {
        isProcessing = false;
        isOpen = false;
        label.textContent = 'Process details';
        document.querySelectorAll('[data-caddie-running-only="true"]').forEach((node) => {
          node.setAttribute('hidden', 'true');
        });
        document.querySelectorAll('[data-caddie-processing-only="true"]').forEach((node) => {
          node.setAttribute('hidden', 'true');
        });
        revealResponses();
        apply();
      }, 5200);
    } else {
      revealResponses();
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      setupSidebar();
      setup();
    }, { once: true });
  } else {
    setupSidebar();
    setup();
  }
})();
          `,
        }}
      />
    </>
  );
}
