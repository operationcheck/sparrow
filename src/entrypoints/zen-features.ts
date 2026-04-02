import { defineContentScript } from "wxt/utils/define-content-script";

type StickyMovieMode = "original_modified" | "disable";

type ShortcutConfig = {
  playOrPause: string;
  seekBackward: string;
  seekForward: string;
  mute: string;
  fullscreen: string;
  pictureInPicture: string;
  theaterMode: string;
  expandSection: string;
  previousSection: string;
  nextSection: string;
  seekSeconds: number;
};

type FeatureSettings = {
  movieTimeEnabled: boolean;
  wordCountEnabled: boolean;
  keyboardShortcutsEnabled: boolean;
  disableMathJaxFocusEnabled: boolean;
  referenceSizeAdjustmentEnabled: boolean;
  referenceAdditionalHeight: number;
  modifyStickyMovieEnabled: boolean;
  modifyStickyMovieMode: StickyMovieMode;
  shortcuts: ShortcutConfig;
};

const DEFAULT_SETTINGS: FeatureSettings = {
  movieTimeEnabled: true,
  wordCountEnabled: true,
  keyboardShortcutsEnabled: true,
  disableMathJaxFocusEnabled: true,
  referenceSizeAdjustmentEnabled: true,
  referenceAdditionalHeight: 0,
  modifyStickyMovieEnabled: true,
  modifyStickyMovieMode: "original_modified",
  shortcuts: {
    playOrPause: "K",
    seekBackward: "J",
    seekForward: "L",
    mute: "M",
    fullscreen: "F",
    pictureInPicture: "P",
    theaterMode: "T",
    expandSection: "Ctrl+B",
    previousSection: "Ctrl+Shift+ArrowUp",
    nextSection: "Ctrl+Shift+ArrowDown",
    seekSeconds: 10,
  },
};

const INPUT_SELECTOR = "input, textarea, [contenteditable='true']";
const WORD_COUNT_CLASS = "atlas-word-count";
const MOVIE_TIME_ID = "atlas-movie-time-total";
const STICKY_STYLE_ID = "atlas-modify-sticky-movie-style";
const REFERENCE_SELECTOR = "iframe[aria-label='補助テキスト']";
const MATHJAX_SELECTOR = "span.MathJax_CHTML";
const DEFAULT_VIDEO_SELECTOR = "#video-player, video";
const SECTION_LIST_SELECTOR =
  ":is([aria-label$='教材リスト'], [aria-label='レポートリスト']) > li > :nth-child(1) > div:nth-child(1)";

let currentSettings = { ...DEFAULT_SETTINGS };
let wordCountObserver: MutationObserver | null = null;
let movieTimeObserver: MutationObserver | null = null;

function parseStorage(data: Record<string, unknown>): FeatureSettings {
  return {
    movieTimeEnabled: Boolean(data.movieTimeEnabled ?? DEFAULT_SETTINGS.movieTimeEnabled),
    wordCountEnabled: Boolean(data.wordCountEnabled ?? DEFAULT_SETTINGS.wordCountEnabled),
    keyboardShortcutsEnabled: Boolean(
      data.keyboardShortcutsEnabled ?? DEFAULT_SETTINGS.keyboardShortcutsEnabled,
    ),
    disableMathJaxFocusEnabled: Boolean(
      data.disableMathJaxFocusEnabled ?? DEFAULT_SETTINGS.disableMathJaxFocusEnabled,
    ),
    referenceSizeAdjustmentEnabled: Boolean(
      data.referenceSizeAdjustmentEnabled ?? DEFAULT_SETTINGS.referenceSizeAdjustmentEnabled,
    ),
    referenceAdditionalHeight: Number(
      data.referenceAdditionalHeight ?? DEFAULT_SETTINGS.referenceAdditionalHeight,
    ),
    modifyStickyMovieEnabled: Boolean(
      data.modifyStickyMovieEnabled ?? DEFAULT_SETTINGS.modifyStickyMovieEnabled,
    ),
    modifyStickyMovieMode:
      data.modifyStickyMovieMode === "disable" ? "disable" : DEFAULT_SETTINGS.modifyStickyMovieMode,
    shortcuts: {
      playOrPause: String(data.shortcutPlayOrPause ?? DEFAULT_SETTINGS.shortcuts.playOrPause),
      seekBackward: String(data.shortcutSeekBackward ?? DEFAULT_SETTINGS.shortcuts.seekBackward),
      seekForward: String(data.shortcutSeekForward ?? DEFAULT_SETTINGS.shortcuts.seekForward),
      mute: String(data.shortcutMute ?? DEFAULT_SETTINGS.shortcuts.mute),
      fullscreen: String(data.shortcutFullscreen ?? DEFAULT_SETTINGS.shortcuts.fullscreen),
      pictureInPicture: String(
        data.shortcutPictureInPicture ?? DEFAULT_SETTINGS.shortcuts.pictureInPicture,
      ),
      theaterMode: String(data.shortcutTheaterMode ?? DEFAULT_SETTINGS.shortcuts.theaterMode),
      expandSection: String(data.shortcutExpandSection ?? DEFAULT_SETTINGS.shortcuts.expandSection),
      previousSection: String(
        data.shortcutPreviousSection ?? DEFAULT_SETTINGS.shortcuts.previousSection,
      ),
      nextSection: String(data.shortcutNextSection ?? DEFAULT_SETTINGS.shortcuts.nextSection),
      seekSeconds: Number(data.shortcutSeekSeconds ?? DEFAULT_SETTINGS.shortcuts.seekSeconds),
    },
  };
}

function normalizeShortcut(shortcut: string): string {
  return shortcut.replace(/\s+/g, "").toLowerCase();
}

function matchShortcut(event: KeyboardEvent, shortcut: string): boolean {
  const normalized = normalizeShortcut(shortcut);
  if (!normalized) {
    return false;
  }

  const parts = normalized.split("+");
  const keyToken = parts[parts.length - 1];
  const modifiers = new Set(parts.slice(0, -1));

  const ctrl = modifiers.has("ctrl");
  const shift = modifiers.has("shift");
  const alt = modifiers.has("alt");
  const meta = modifiers.has("meta") || modifiers.has("cmd") || modifiers.has("command");

  if (event.ctrlKey !== ctrl) {
    return false;
  }
  if (event.shiftKey !== shift) {
    return false;
  }
  if (event.altKey !== alt) {
    return false;
  }
  if (event.metaKey !== meta) {
    return false;
  }

  const rawKey = event.key.toLowerCase();
  const normalizedRawKey = rawKey === " " ? "space" : rawKey;
  const code = event.code.toLowerCase();
  return normalizedRawKey === keyToken || code === keyToken.toLowerCase();
}

function getVideoElement(): HTMLVideoElement | null {
  const video = document.querySelector(DEFAULT_VIDEO_SELECTOR);
  return video instanceof HTMLVideoElement ? video : null;
}

function executeVideoShortcut(name: keyof ShortcutConfig): boolean {
  const video = getVideoElement();
  if (!video) {
    return false;
  }

  switch (name) {
    case "playOrPause":
      if (video.paused) {
        void video.play();
      } else {
        video.pause();
      }
      return true;
    case "seekBackward":
      video.currentTime = Math.max(0, video.currentTime - currentSettings.shortcuts.seekSeconds);
      return true;
    case "seekForward":
      video.currentTime = video.currentTime + currentSettings.shortcuts.seekSeconds;
      return true;
    case "mute":
      video.muted = !video.muted;
      return true;
    case "fullscreen":
      if (document.fullscreenElement) {
        void document.exitFullscreen();
      } else {
        void video.requestFullscreen();
      }
      return true;
    case "pictureInPicture":
      if (!document.pictureInPictureEnabled) {
        return false;
      }
      if (document.pictureInPictureElement === video) {
        void document.exitPictureInPicture();
      } else {
        void video.requestPictureInPicture();
      }
      return true;
    default:
      return false;
  }
}

function executeSectionShortcut(
  name: "expandSection" | "previousSection" | "nextSection",
): boolean {
  if (name === "expandSection") {
    const button = document.querySelector(
      "[aria-label='教材モーダル'] :where([aria-label='縮小する'], [aria-label='拡大する'])",
    );
    if (button instanceof HTMLElement) {
      button.click();
      return true;
    }
    return false;
  }

  const sectionItems = Array.from(document.querySelectorAll<HTMLElement>(SECTION_LIST_SELECTOR));
  if (sectionItems.length === 0) {
    return false;
  }

  const currentIndex = sectionItems.findIndex(
    (item) => getComputedStyle(item).boxShadow !== "none",
  );
  const delta = name === "previousSection" ? -1 : 1;

  const targetIndex =
    currentIndex === -1
      ? name === "previousSection"
        ? sectionItems.length - 1
        : 0
      : Math.max(0, Math.min(sectionItems.length - 1, currentIndex + delta));

  if (targetIndex !== currentIndex && sectionItems[targetIndex]) {
    sectionItems[targetIndex].click();
    return true;
  }
  return false;
}

function executeTheaterModeShortcut(): boolean {
  const theaterButton = document.querySelector("a:has([type^='theater-mode'])");
  if (theaterButton instanceof HTMLElement) {
    theaterButton.click();
    return true;
  }
  return false;
}

function runKeyboardShortcut(event: KeyboardEvent): boolean {
  const shortcuts = currentSettings.shortcuts;
  const videoShortcutNames: Array<
    "playOrPause" | "seekBackward" | "seekForward" | "mute" | "fullscreen" | "pictureInPicture"
  > = ["playOrPause", "seekBackward", "seekForward", "mute", "fullscreen", "pictureInPicture"];

  for (const key of videoShortcutNames) {
    if (matchShortcut(event, shortcuts[key])) {
      return executeVideoShortcut(key);
    }
  }

  if (matchShortcut(event, shortcuts.theaterMode)) {
    return executeTheaterModeShortcut();
  }
  if (matchShortcut(event, shortcuts.expandSection)) {
    return executeSectionShortcut("expandSection");
  }
  if (matchShortcut(event, shortcuts.previousSection)) {
    return executeSectionShortcut("previousSection");
  }
  if (matchShortcut(event, shortcuts.nextSection)) {
    return executeSectionShortcut("nextSection");
  }
  return false;
}

function countWords(value: string): number {
  const segmenter = new Intl.Segmenter(undefined, { granularity: "word" });
  return Array.from(segmenter.segment(value)).filter((segment) => segment.isWordLike).length;
}

function attachWordCount(field: HTMLInputElement | HTMLTextAreaElement): void {
  const indicators = field.parentElement?.querySelector(".indicators div.counter");
  if (!(indicators instanceof HTMLElement)) {
    return;
  }
  if (indicators.querySelector(`.${WORD_COUNT_CLASS}`)) {
    return;
  }

  const node = document.createElement("span");
  node.className = WORD_COUNT_CLASS;
  node.style.marginLeft = "4px";
  indicators.appendChild(node);

  const update = () => {
    node.textContent = `${countWords(field.value)} words`;
  };
  field.addEventListener("input", update);
  update();
}

function setupWordCount(): void {
  if (wordCountObserver) {
    wordCountObserver.disconnect();
    wordCountObserver = null;
  }

  if (!currentSettings.wordCountEnabled) {
    return;
  }

  const apply = () => {
    const fields = document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
      "input, textarea",
    );
    fields.forEach(attachWordCount);
  };

  apply();
  wordCountObserver = new MutationObserver(apply);
  wordCountObserver.observe(document.body, { childList: true, subtree: true });
}

function parseDurationText(input: string): number {
  const parts = input.split(":").map((part) => Number(part));
  if (parts.some((part) => Number.isNaN(part))) {
    return 0;
  }
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }
  return 0;
}

function formatDuration(totalSec: number): string {
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${m}:${String(s).padStart(2, "0")}`;
}

function updateMovieTimeSummary(): void {
  const lists = document.querySelectorAll<HTMLElement>(
    "ul[aria-label='必修教材リスト'], ul[aria-label='課外教材リスト']",
  );

  const matches = Array.from(lists)
    .map((list) => list.textContent ?? "")
    .join("\n")
    .match(/\b(\d{1,2}:\d{2}(?::\d{2})?)\b/g);

  const total = (matches ?? []).reduce((acc, text) => acc + parseDurationText(text), 0);
  const listParent = lists[0]?.parentElement;
  if (!listParent || total <= 0) {
    return;
  }

  let summary = document.getElementById(MOVIE_TIME_ID);
  if (!summary) {
    summary = document.createElement("div");
    summary.id = MOVIE_TIME_ID;
    summary.style.margin = "8px 0";
    summary.style.fontWeight = "600";
    listParent.prepend(summary);
  }
  summary.textContent = `Atlas: Total video time ${formatDuration(total)}`;
}

function setupMovieTime(): void {
  if (movieTimeObserver) {
    movieTimeObserver.disconnect();
    movieTimeObserver = null;
  }

  const existing = document.getElementById(MOVIE_TIME_ID);
  if (existing && !currentSettings.movieTimeEnabled) {
    existing.remove();
  }
  if (!currentSettings.movieTimeEnabled) {
    return;
  }

  updateMovieTimeSummary();
  movieTimeObserver = new MutationObserver(updateMovieTimeSummary);
  movieTimeObserver.observe(document.body, { childList: true, subtree: true });
}

function applyMathJaxFocusSetting(): void {
  if (!currentSettings.disableMathJaxFocusEnabled) {
    return;
  }
  const nodes = document.querySelectorAll<HTMLElement>(MATHJAX_SELECTOR);
  nodes.forEach((node) => {
    node.tabIndex = -1;
  });
}

function applyReferenceSizeAdjustment(): void {
  if (!currentSettings.referenceSizeAdjustmentEnabled) {
    return;
  }
  const frame = document.querySelector<HTMLIFrameElement>(REFERENCE_SELECTOR);
  if (!frame) {
    return;
  }
  frame.style.height = `${frame.clientHeight + currentSettings.referenceAdditionalHeight}px`;
}

function applyStickyMovieStyle(): void {
  const existing = document.getElementById(STICKY_STYLE_ID);
  if (existing) {
    existing.remove();
  }
  if (!currentSettings.modifyStickyMovieEnabled) {
    return;
  }

  const style = document.createElement("style");
  style.id = STICKY_STYLE_ID;
  if (currentSettings.modifyStickyMovieMode === "disable") {
    style.textContent = `
      [aria-label="動画プレイヤーレイアウト"]:not(:has([type="theater-mode-on"])) {
        position: relative !important;
        inset: 0 !important;
      }
    `;
  } else {
    style.textContent = `
      #video-player {
        aspect-ratio: 16 / 9;
      }
    `;
  }
  document.head.appendChild(style);
}

function applyAllFeatures(): void {
  setupWordCount();
  setupMovieTime();
  applyMathJaxFocusSetting();
  applyReferenceSizeAdjustment();
  applyStickyMovieStyle();
}

export default defineContentScript({
  matches: ["https://www.nnn.ed.nico/*"],
  runAt: "document_idle",
  main() {
    const handleKeydown = (event: KeyboardEvent) => {
      const target = event.target;
      if (target instanceof Element && target.matches(INPUT_SELECTOR)) {
        return;
      }
      if (!currentSettings.keyboardShortcutsEnabled) {
        return;
      }
      if (runKeyboardShortcut(event)) {
        event.preventDefault();
      }
    };

    document.addEventListener("keydown", handleKeydown);

    const load = async () => {
      const data = await chrome.storage.local.get();
      currentSettings = parseStorage(data);
      applyAllFeatures();
    };

    void load();
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== "local" || Object.keys(changes).length === 0) {
        return;
      }
      void load();
    });

    const intervalId = window.setInterval(() => {
      applyMathJaxFocusSetting();
      applyReferenceSizeAdjustment();
    }, 2000);

    return () => {
      document.removeEventListener("keydown", handleKeydown);
      if (wordCountObserver) {
        wordCountObserver.disconnect();
      }
      if (movieTimeObserver) {
        movieTimeObserver.disconnect();
      }
      window.clearInterval(intervalId);
    };
  },
});
