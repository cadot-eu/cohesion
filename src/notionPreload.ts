import { ipcRenderer } from "electron";

function overrideNotification() {
  window.Notification = class extends Notification {
    constructor(title: string, options?: NotificationOptions) {
      super(title, options);
      this.onclick = _event => ipcRenderer.send("notification-click");
    }
  }
}

function handleChromeVersionBug() {
  window.addEventListener("DOMContentLoaded", () => {
    if (document.getElementsByClassName("landing-title version-title").length != 0)
      ipcRenderer.send("chrome-version-bug");
  });
}

function watchDOMChanges() {
  const STORAGE_KEY = "cohesion-last-modified";
  let notifiedText = "";

  function findLastModifiedElement(): Element | null {
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: (node) => {
          const text = node.textContent?.trim() ?? "";
          if (/^(Dernière modification|Last edited|Last modified|Dernière édition)\b/i.test(text)) {
            return NodeFilter.FILTER_ACCEPT;
          }
          return NodeFilter.FILTER_SKIP;
        }
      }
    );
    const textNode = walker.nextNode();
    return textNode?.parentElement ?? null;
  }

  function notifyIfChanged() {
    const el = findLastModifiedElement();
    const current = el?.textContent?.trim() ?? "";
    if (!current || current === notifiedText) return;
    notifiedText = current;

    const previous = localStorage.getItem(STORAGE_KEY);
    if (previous && current !== previous) {
      ipcRenderer.send("notion-content-changed", current);
    }
    localStorage.setItem(STORAGE_KEY, current);
  }

  function setupObserver() {
    const target = findLastModifiedElement();
    if (!target) {
      setTimeout(setupObserver, 3000);
      return;
    }

    notifyIfChanged();

    let timer: ReturnType<typeof setTimeout> | null = null;
    const observer = new MutationObserver(() => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(notifyIfChanged, 1000);
    });

    observer.observe(target, {
      characterData: true,
      childList: true,
      subtree: true,
    });
  }

  window.addEventListener("DOMContentLoaded", () => {
    setTimeout(setupObserver, 2000);
  });
}

overrideNotification();
handleChromeVersionBug();
watchDOMChanges();
