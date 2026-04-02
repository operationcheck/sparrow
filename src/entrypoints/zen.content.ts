import { defineContentScript } from "wxt/utils/define-content-script";

// WXT only injects `content.ts` and `*.content.ts` into the manifest; other names are "unlisted" and never run.

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
const MOVIE_TIME_ROOT_ID = "atlas-movie-time-root";
/** Course / monthly summary row (avoid duplicate id with chapter block). */
const MOVIE_TIME_SUMMARY_ID = "atlas-movie-time-summary";
const MOVIE_TIME_BADGE_CLASS = "atlas-movie-time-badge";
const STICKY_STYLE_ID = "atlas-modify-sticky-movie-style";
const REFERENCE_SELECTOR = "iframe[aria-label='補助テキスト']";
const MATHJAX_SELECTOR = "span.MathJax_CHTML";
/** Prefer nested player video (matches current ZEN DOM). */
const DEFAULT_VIDEO_SELECTOR = "#video-player video, #video-player, video";
const SECTION_LIST_SELECTOR =
  ":is([aria-label$='教材リスト'], [aria-label='レポートリスト']) > li > :nth-child(1) > div:nth-child(1)";

/** N-school list item: green icon or completion text (aligned with Atlas content.tsx / zen-study-plus). */
const RGB_COLOR_GREEN = "rgb(0, 197, 65)";
const TYPE_MOVIE_ROUNDED_PLUS = "movie-rounded-plus";

// Movie-time selectors (aligned with ZEN pages' aria-label structure)
const COURSE_CHAPTER_ANCHORS_SELECTOR = '[aria-label="チャプター一覧"] a:has(h4)';
const MONTHLY_REPORTS_CHAPTER_ANCHORS_SELECTOR = 'a:has([aria-label^="進捗度"])';
const MY_COURSES_COURSE_ANCHORS_SELECTOR = '[aria-label="コース一覧"] a:has(h4)';
const COURSE_SUMMARY_PARENT_SELECTOR = '[type="flow"] > [direction="column"] > [direction="row"]';
/** zen-study-plus fallback first; then stricter variants for DOM changes. */
const CHAPTER_PARENT_SELECTORS: string[] = [
  ':has(> [aria-label$="教材リスト"]) > div:nth-child(1):not(:has([aria-label="教材フィルタ"]))',
  ':has(> :is([aria-label$="教材リスト"], [aria-label="課外教材リスト"], [aria-label="必修教材リスト"])) > div:nth-child(1):not(:has([aria-label="教材フィルタ"]))',
];

const MATERIAL_LIST_SELECTOR =
  'ul[aria-label="必修教材リスト"], ul[aria-label="課外教材リスト"], ul[aria-label$="教材リスト"]';

/** Movie row: icon type prefix used on N-school ZEN pages. */
const MOVIE_ICON_SELECTOR = 'svg[type^="movie-rounded"], svg[type^="movie"]';

type TimeProgressGroup = {
  goal: number;
  current: number;
};

type TimeProgressGroupWithLabel = TimeProgressGroup & {
  label: string;
};

type TimeProgress = {
  primary: TimeProgressGroup;
  groups: TimeProgressGroupWithLabel[];
};

let currentSettings = { ...DEFAULT_SETTINGS };
let wordCountObserver: MutationObserver | null = null;
let movieTimeObserver: MutationObserver | null = null;
const timeCache = new Map<string, TimeProgress>();
let movieTimeRefreshToken = 0;
let movieTimeDebounceTimer: number | null = null;
let videoProgressCleanup: (() => void) | null = null;
let movieTimeUrlPollId: number | null = null;
let lastMovieTimeHref = "";
let movieTimeStorageCleanup: (() => void) | null = null;
const chapterPersistSignature = new Map<string, string>();

/** Persisted chapter progress (CSR: fetch(same URL) returns ~2KB shell without lists). */
const CHAPTER_PROGRESS_STORAGE_KEY = "atlasChapterTimeProgressV1";

type ChapterProgressMap = Record<string, TimeProgress>;

function normalizeChapterStoragePath(href: string): string {
  const u = new URL(href, location.origin);
  const m = u.pathname.match(/^(\/courses\/\d+\/chapters\/\d+)/);
  return m ? m[1] : u.pathname.replace(/\/$/, "") || "/";
}

function canonicalChapterUrl(href: string): string {
  const u = new URL(href, location.origin);
  return `${u.origin}${normalizeChapterStoragePath(href)}`;
}

async function loadChapterProgressMap(): Promise<ChapterProgressMap> {
  const r = await chrome.storage.local.get(CHAPTER_PROGRESS_STORAGE_KEY);
  const v = r[CHAPTER_PROGRESS_STORAGE_KEY];
  return v && typeof v === "object" ? (v as ChapterProgressMap) : {};
}

async function persistChapterTimeProgress(tp: TimeProgress): Promise<void> {
  const path = normalizeChapterStoragePath(location.href);
  const map = await loadChapterProgressMap();
  map[path] = tp;
  await chrome.storage.local.set({ [CHAPTER_PROGRESS_STORAGE_KEY]: map });
}

function isUsableTimeProgress(tp: TimeProgress): boolean {
  return tp.primary.goal > 0 || tp.groups.some((g) => g.goal > 0);
}

/** In-memory + extension storage only (no fetch: ZEN is client-rendered). */
async function resolveChapterTimeProgress(chapterUrl: string): Promise<TimeProgress | null> {
  const can = canonicalChapterUrl(chapterUrl);
  const cacheKey = `chapter-url:${can}`;
  const mem = timeCache.get(cacheKey);
  if (mem) {
    return mem;
  }

  const path = normalizeChapterStoragePath(chapterUrl);
  const map = await loadChapterProgressMap();
  const stored = map[path];
  if (stored && isUsableTimeProgress(stored)) {
    timeCache.set(cacheKey, stored);
    return stored;
  }
  return null;
}

function courseIdFromPath(pathname: string): number | null {
  const m = pathname.match(/^\/courses\/(\d+)/);
  return m ? Number(m[1]) : null;
}

/** My courses: sum all stored chapter rows for this course (user must have opened chapters). */
async function mergeStoredChaptersForCourse(courseUrl: string): Promise<TimeProgress | null> {
  const cid = courseIdFromPath(new URL(courseUrl, location.origin).pathname);
  if (cid == null) {
    return null;
  }
  const prefix = `/courses/${cid}/chapters/`;
  const map = await loadChapterProgressMap();
  const tps = Object.entries(map)
    .filter(([k]) => k.startsWith(prefix))
    .map(([, v]) => v)
    .filter((tp) => isUsableTimeProgress(tp));
  if (tps.length === 0) {
    return null;
  }
  const merged = mergeTimeProgressList(tps);
  return isUsableTimeProgress(merged) ? merged : null;
}

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
  const el = document.querySelector(DEFAULT_VIDEO_SELECTOR);
  return el instanceof HTMLVideoElement ? el : null;
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

/** Same shape as zen-study-plus `create-motie-time-component` `formatTime`. */
function formatTime(sourceSec: number): string {
  const hours = Math.floor(sourceSec / 3600);
  const minutes = Math.floor(sourceSec / 60) % 60;
  const hoursStr = hours ? `${hours}:` : "";
  const minutesStr = `${hours ? String(minutes).padStart(2, "0") : minutes}:`;
  const secondsStr = String(sourceSec % 60).padStart(2, "0");
  return `${hoursStr}${minutesStr}${secondsStr}`;
}

function formatDuration(totalSec: number): string {
  return formatTime(Math.max(0, totalSec));
}

function isMyCoursesPage(url: URL): boolean {
  return /^\/my_course\/?$/.test(url.pathname);
}

function isChapterUrl(url: URL): boolean {
  return /^\/courses\/\d+\/chapters\/\d+(?:\/[^/]+\/\d+)?\/?$/.test(url.pathname);
}

function isCourseUrl(url: URL): boolean {
  return /^\/courses\/\d+\/?$/.test(url.pathname);
}

function extractDurationFromText(text: string): number {
  const match = text.match(/\b(\d{1,2}:\d{2}(?::\d{2})?)\b/);
  return match ? parseDurationText(match[1]) : 0;
}

function isListItemActiveForMovie(item: HTMLLIElement): boolean {
  const marker = item.querySelector<HTMLElement>(":scope > :nth-child(1) > div:nth-child(1)");
  return marker != null && getComputedStyle(marker).boxShadow !== "none";
}

function isMovieItemPassed(item: HTMLLIElement): boolean {
  const icon = item.querySelector<HTMLElement>("div > svg") ?? item.querySelector("svg");
  const iconColor = icon ? getComputedStyle(icon).color : "";
  const text = item.textContent ?? "";
  return iconColor === RGB_COLOR_GREEN || text.includes("視聴済み") || text.includes("理解した");
}

function isSupplementMovieItem(item: HTMLLIElement): boolean {
  const icon = item.querySelector<HTMLElement>("div > svg") ?? item.querySelector("svg");
  return icon?.getAttribute("type") === TYPE_MOVIE_ROUNDED_PLUS;
}

/**
 * Build TimeProgress from rendered chapter HTML only (no API).
 * Mirrors zen-study-plus n_school grouping: primary = 必須(main), groups = 全動画 / 必須 / Nプラス.
 */
function extractTimeProgressFromRoot(root: ParentNode): TimeProgress {
  const lists = root.querySelectorAll<HTMLElement>(MATERIAL_LIST_SELECTOR);
  let allGoal = 0;
  let allCurrent = 0;
  let mainGoal = 0;
  let mainCurrent = 0;
  let supGoal = 0;
  let supCurrent = 0;

  lists.forEach((list) => {
    list.querySelectorAll<HTMLLIElement>("li").forEach((item) => {
      if (!item.querySelector(MOVIE_ICON_SELECTOR)) {
        return;
      }
      const durationSec = extractDurationFromText(item.textContent ?? "");
      if (durationSec <= 0) {
        return;
      }
      const passed = isMovieItemPassed(item);
      const supplement = isSupplementMovieItem(item);
      const watched = passed ? durationSec : 0;

      allGoal += durationSec;
      allCurrent += watched;
      if (supplement) {
        supGoal += durationSec;
        supCurrent += watched;
      } else {
        mainGoal += durationSec;
        mainCurrent += watched;
      }
    });
  });

  return {
    primary: { goal: mainGoal, current: mainCurrent },
    groups: [
      { label: "全動画", goal: allGoal, current: allCurrent },
      { label: "必須", goal: mainGoal, current: mainCurrent },
      { label: "Nプラス", goal: supGoal, current: supCurrent },
    ],
  };
}

function getGroupByLabel(tp: TimeProgress, label: string): TimeProgressGroupWithLabel {
  const g = tp.groups.find((x) => x.label === label);
  return g ?? { label, goal: 0, current: 0 };
}

/** Add in-progress seconds for the active, not-yet-completed movie row (live page only). */
function refineTimeProgressWithVideo(
  tp: TimeProgress,
  video: HTMLVideoElement | null,
): TimeProgress {
  if (!video || !Number.isFinite(video.duration) || video.duration <= 0) {
    return tp;
  }

  const allG = getGroupByLabel(tp, "全動画");
  const mainG = getGroupByLabel(tp, "必須");
  const supG = getGroupByLabel(tp, "Nプラス");

  for (const list of document.querySelectorAll<HTMLElement>(MATERIAL_LIST_SELECTOR)) {
    for (const item of list.querySelectorAll<HTMLLIElement>("li")) {
      if (!item.querySelector(MOVIE_ICON_SELECTOR)) {
        continue;
      }
      const durationSec = extractDurationFromText(item.textContent ?? "");
      if (durationSec <= 0) {
        continue;
      }
      if (isMovieItemPassed(item)) {
        continue;
      }
      if (!isListItemActiveForMovie(item)) {
        continue;
      }

      const partial = Math.min(Math.max(0, video.currentTime), durationSec);
      const supplement = isSupplementMovieItem(item);

      const nextAllCurrent = Math.min(allG.goal, allG.current + partial);
      const nextAll: TimeProgressGroupWithLabel = { ...allG, current: nextAllCurrent };

      if (supplement) {
        const nextSupCurrent = Math.min(supG.goal, supG.current + partial);
        return {
          // primary = 必須のみ（zen-study-plus と同じ）
          primary: { ...tp.primary },
          groups: [
            nextAll,
            { ...mainG, current: Math.min(mainG.goal, mainG.current) },
            { ...supG, current: nextSupCurrent },
          ],
        };
      }

      const nextMainCurrent = Math.min(mainG.goal, mainG.current + partial);
      const nextPrimaryCurrent = Math.min(tp.primary.goal, tp.primary.current + partial);
      return {
        primary: { goal: tp.primary.goal, current: nextPrimaryCurrent },
        groups: [
          nextAll,
          { ...mainG, current: nextMainCurrent },
          { ...supG, current: Math.min(supG.goal, supG.current) },
        ],
      };
    }
  }

  return tp;
}

function mergeTimeProgressList(list: TimeProgress[]): TimeProgress {
  if (list.length === 0) {
    return {
      primary: { goal: 0, current: 0 },
      groups: [],
    };
  }
  const merged = new Map<string, TimeProgressGroup>();
  let primaryGoal = 0;
  let primaryCurrent = 0;
  for (const tp of list) {
    primaryGoal += tp.primary.goal;
    primaryCurrent += tp.primary.current;
    for (const g of tp.groups) {
      const prev = merged.get(g.label) ?? { goal: 0, current: 0 };
      merged.set(g.label, {
        goal: prev.goal + g.goal,
        current: prev.current + g.current,
      });
    }
  }
  return {
    primary: { goal: primaryGoal, current: primaryCurrent },
    groups: [...merged.entries()].map(([label, x]) => ({ label, ...x })),
  };
}

function formatPrimaryLine(tp: TimeProgress): string {
  const { goal, current } = tp.primary;
  if (goal <= 0) {
    return "- / -";
  }
  return `${formatTime(current)} / ${formatTime(goal)}`;
}

function formatRemainingLine(tp: TimeProgress): string {
  const { goal, current } = tp.primary;
  if (goal > 0) {
    return `残り ${formatTime(Math.max(0, goal - current))}`;
  }
  const all = getGroupByLabel(tp, "全動画");
  if (all.goal > 0) {
    return `残り ${formatTime(Math.max(0, all.goal - all.current))}`;
  }
  return "";
}

/** Compact line for list badges when 必須 is empty but 全動画 exists. */
function formatBadgeLine(tp: TimeProgress): string {
  if (tp.primary.goal > 0) {
    return formatPrimaryLine(tp);
  }
  const all = getGroupByLabel(tp, "全動画");
  if (all.goal > 0) {
    return `${formatTime(all.current)} / ${formatTime(all.goal)}`;
  }
  return formatPrimaryLine(tp);
}

function serializeTimeProgress(tp: TimeProgress): string {
  return JSON.stringify({
    primary: tp.primary,
    groups: tp.groups.map((g) => ({ label: g.label, goal: g.goal, current: g.current })),
  });
}

function shouldIgnoreMovieTimeMutations(records: MutationRecord[]): boolean {
  if (records.length === 0) {
    return true;
  }
  return records.every((record) => {
    const target = record.target;
    if (!(target instanceof Element)) {
      return false;
    }
    if (
      target.closest(`#${MOVIE_TIME_ROOT_ID}`) ||
      target.closest(`#${MOVIE_TIME_SUMMARY_ID}`) ||
      target.closest(`.${MOVIE_TIME_BADGE_CLASS}`)
    ) {
      return true;
    }
    return false;
  });
}

function ensureMovieTimeStyles(): void {
  const id = "atlas-movie-time-style";
  if (document.getElementById(id)) {
    return;
  }
  const style = document.createElement("style");
  style.id = id;
  style.textContent = `
    .${MOVIE_TIME_BADGE_CLASS}{
      margin-left: 8px;
      padding: 2px 6px;
      border-radius: 999px;
      font-size: 12px;
      line-height: 1.4;
      background: rgba(0,0,0,0.06);
      color: rgba(0,0,0,0.75);
      white-space: nowrap;
    }
    .atlas-movie-time-root{
      position: absolute;
      top: 50%;
      right: var(--atlas-parent-padding-right, 0px);
      transform: translateY(-50%);
      display: flex;
      flex-direction: column;
      gap: 2px;
      margin: 0;
      z-index: 2147483646;
      font-size: 1.3rem;
      line-height: 1.3;
      color: #828282;
      white-space: nowrap;
    }
    .atlas-movie-time-root .atlas-movie-time-main{
      font-weight: 600;
      color: #555;
    }
    .atlas-movie-time-root .atlas-movie-time-remaining{
      font-size: 1.15rem;
      color: #828282;
    }
    .atlas-movie-time-root .atlas-movie-time-groups{
      display: none;
      position: absolute;
      z-index: 2147483647;
      left: 0;
      top: 100%;
      margin-top: 4px;
      padding: 8px 10px;
      font-size: 1.2rem;
      color: #222;
      white-space: nowrap;
      background: #fff;
      box-shadow: rgba(0,0,0,0.1) 0 0.2rem 0.2rem 0.1rem;
      border-radius: 4px;
      grid-template-columns: max-content 1fr;
      gap: 8px 6px;
    }
    .atlas-movie-time-root:hover .atlas-movie-time-groups{
      display: grid;
    }
    .atlas-movie-time-root .atlas-movie-time-groups dt{
      margin: 0;
      color: #828282;
    }
    .atlas-movie-time-root .atlas-movie-time-groups dd{
      margin: 0;
    }
  `;
  document.head.appendChild(style);
}

function renderGroupsDl(tp: TimeProgress): HTMLDListElement {
  const dl = document.createElement("dl");
  for (const g of tp.groups) {
    const dt = document.createElement("dt");
    dt.textContent = g.label;
    const dd = document.createElement("dd");
    if (g.goal > 0) {
      dd.textContent = `${formatTime(g.current)} / ${formatTime(g.goal)}`;
    } else {
      dd.textContent = "- / -";
      dd.style.color = "#b3b3b3";
    }
    dl.append(dt, dd);
  }
  return dl;
}

function upsertChapterMovieTimeBlock(parent: HTMLElement, tp: TimeProgress): void {
  ensureMovieTimeStyles();
  const parentStyle = window.getComputedStyle(parent);
  if (parentStyle.position === "static") {
    parent.style.position = "relative";
  }
  const parentPaddingRight = Number.parseFloat(parentStyle.paddingRight) || 0;
  let root = document.getElementById(MOVIE_TIME_ROOT_ID);
  if (!root) {
    root = document.createElement("div");
    root.id = MOVIE_TIME_ROOT_ID;
    root.className = "atlas-movie-time-root";
    parent.appendChild(root);
  } else if (root.parentElement !== parent) {
    parent.appendChild(root);
  }
  root.style.setProperty("--atlas-parent-padding-right", `${parentPaddingRight}px`);

  let main = root.querySelector<HTMLDivElement>(".atlas-movie-time-main");
  if (!main) {
    main = document.createElement("div");
    main.className = "atlas-movie-time-main";
    root.appendChild(main);
  }
  const mainText = formatPrimaryLine(tp);
  if (main.textContent !== mainText) {
    main.textContent = mainText;
  }

  let remaining = root.querySelector<HTMLDivElement>(".atlas-movie-time-remaining");
  if (!remaining) {
    remaining = document.createElement("div");
    remaining.className = "atlas-movie-time-remaining";
    root.appendChild(remaining);
  }
  const remText = formatRemainingLine(tp);
  if (remaining.textContent !== remText) {
    remaining.textContent = remText;
  }
  remaining.style.display = remText ? "" : "none";

  let groups = root.querySelector<HTMLDListElement>(".atlas-movie-time-groups");
  if (!groups) {
    groups = document.createElement("dl");
    groups.className = "atlas-movie-time-groups";
    root.appendChild(groups);
  }
  const groupsSignature = JSON.stringify(
    tp.groups.map((g) => ({ label: g.label, goal: g.goal, current: g.current })),
  );
  if (groups.dataset.signature !== groupsSignature) {
    groups.dataset.signature = groupsSignature;
    groups.replaceChildren(...renderGroupsDl(tp).childNodes);
  }
}

function appendBadgeToAnchor(anchor: Element, tp: TimeProgress): void {
  if (tp.primary.goal <= 0 && !tp.groups.some((g) => g.goal > 0)) {
    return;
  }
  ensureMovieTimeStyles();

  let badge = anchor.querySelector(`.${MOVIE_TIME_BADGE_CLASS}`);
  if (!badge) {
    badge = document.createElement("span");
    badge.className = MOVIE_TIME_BADGE_CLASS;
    anchor.appendChild(badge);
  }
  badge.textContent = formatBadgeLine(tp);
}

function upsertOverallSummary(parent: Element, tp: TimeProgress): void {
  ensureMovieTimeStyles();
  let summary = parent.querySelector<HTMLSpanElement>(`#${MOVIE_TIME_SUMMARY_ID}`);
  if (!summary) {
    summary = document.createElement("span");
    summary.id = MOVIE_TIME_SUMMARY_ID;
    summary.className = MOVIE_TIME_BADGE_CLASS;
    parent.appendChild(summary);
  }
  const rem = formatRemainingLine(tp);
  summary.textContent = rem ? `${formatBadgeLine(tp)} ・ ${rem}` : formatBadgeLine(tp);
}

function findChapterMovieTimeParent(): HTMLElement | null {
  for (const sel of CHAPTER_PARENT_SELECTORS) {
    try {
      const el = document.querySelector(sel);
      if (el instanceof HTMLElement) {
        return el;
      }
    } catch {
      // Invalid selector in older engines
    }
  }
  const list = document.querySelector(MATERIAL_LIST_SELECTOR);
  const fallback = list?.parentElement;
  return fallback instanceof HTMLElement ? fallback : null;
}

function scheduleMovieTimeUpdate(): void {
  if (movieTimeDebounceTimer !== null) {
    window.clearTimeout(movieTimeDebounceTimer);
  }
  movieTimeDebounceTimer = window.setTimeout(() => {
    movieTimeDebounceTimer = null;
    void updateMovieTimeSummary();
  }, 120);
}

function attachVideoProgressListeners(): void {
  videoProgressCleanup?.();
  videoProgressCleanup = null;
  const video = getVideoElement();
  if (!video) {
    return;
  }
  const onTick = () => {
    scheduleMovieTimeUpdate();
  };
  video.addEventListener("timeupdate", onTick);
  video.addEventListener("ended", onTick);
  video.addEventListener("loadedmetadata", onTick);
  videoProgressCleanup = () => {
    video.removeEventListener("timeupdate", onTick);
    video.removeEventListener("ended", onTick);
    video.removeEventListener("loadedmetadata", onTick);
  };
}

async function updateMovieTimeSummary(): Promise<void> {
  const myToken = ++movieTimeRefreshToken;
  const pageUrl = new URL(location.href);

  try {
    if (isChapterUrl(pageUrl)) {
      let tp = extractTimeProgressFromRoot(document);
      tp = refineTimeProgressWithVideo(tp, getVideoElement());
      if (myToken !== movieTimeRefreshToken) {
        return;
      }
      timeCache.set(`chapter-url:${canonicalChapterUrl(location.href)}`, tp);
      const chapterPath = normalizeChapterStoragePath(location.href);
      const signature = serializeTimeProgress(tp);
      if (chapterPersistSignature.get(chapterPath) !== signature) {
        chapterPersistSignature.set(chapterPath, signature);
        void persistChapterTimeProgress(tp);
      }
      const chapterParent = findChapterMovieTimeParent();
      if (chapterParent) {
        upsertChapterMovieTimeBlock(chapterParent, tp);
      }
      attachVideoProgressListeners();
    } else {
      videoProgressCleanup?.();
      videoProgressCleanup = null;
    }

    const courseAnchors = document.querySelectorAll<HTMLAnchorElement>(
      COURSE_CHAPTER_ANCHORS_SELECTOR,
    );
    if (courseAnchors.length > 0) {
      const items = await Promise.all(
        Array.from(courseAnchors).map(async (anchor) => {
          const chapterUrl = new URL(anchor.href, location.origin).toString();
          if (!isChapterUrl(new URL(chapterUrl))) {
            return { anchor, tp: null as TimeProgress | null };
          }
          const tp = await resolveChapterTimeProgress(chapterUrl);
          return { anchor, tp };
        }),
      );
      if (myToken !== movieTimeRefreshToken) {
        return;
      }
      const merged = mergeTimeProgressList(
        items.map((i) => i.tp).filter((x): x is TimeProgress => x != null),
      );
      items.forEach(({ anchor, tp }) => {
        if (tp) {
          appendBadgeToAnchor(anchor, tp);
        }
      });
      const summaryParent = document.querySelector(COURSE_SUMMARY_PARENT_SELECTOR);
      if (
        summaryParent &&
        (merged.primary.goal > 0 || getGroupByLabel(merged, "全動画").goal > 0)
      ) {
        upsertOverallSummary(summaryParent, merged);
      }
    }

    const monthlyAnchors = document.querySelectorAll<HTMLAnchorElement>(
      MONTHLY_REPORTS_CHAPTER_ANCHORS_SELECTOR,
    );
    if (monthlyAnchors.length > 0) {
      const items = await Promise.all(
        Array.from(monthlyAnchors).map(async (anchor) => {
          const chapterUrl = new URL(anchor.href, location.origin).toString();
          if (!isChapterUrl(new URL(chapterUrl))) {
            return { anchor, tp: null as TimeProgress | null };
          }
          const tp = await resolveChapterTimeProgress(chapterUrl);
          return { anchor, tp };
        }),
      );
      if (myToken !== movieTimeRefreshToken) {
        return;
      }
      const merged = mergeTimeProgressList(
        items.map((i) => i.tp).filter((x): x is TimeProgress => x != null),
      );
      const summaryParent = document.querySelector(COURSE_SUMMARY_PARENT_SELECTOR);
      if (
        summaryParent &&
        (merged.primary.goal > 0 || getGroupByLabel(merged, "全動画").goal > 0)
      ) {
        upsertOverallSummary(summaryParent, merged);
      }
      items.forEach(({ anchor, tp }) => {
        if (tp) {
          appendBadgeToAnchor(anchor, tp);
        }
      });
    }

    if (isMyCoursesPage(pageUrl)) {
      const myCourseAnchors = document.querySelectorAll<HTMLAnchorElement>(
        MY_COURSES_COURSE_ANCHORS_SELECTOR,
      );
      if (myCourseAnchors.length > 0) {
        const items = await Promise.all(
          Array.from(myCourseAnchors).map(async (anchor) => {
            const courseUrl = new URL(anchor.href, location.origin).toString();
            if (!isCourseUrl(new URL(courseUrl))) {
              return { anchor, tp: null as TimeProgress | null };
            }
            const tp = await mergeStoredChaptersForCourse(courseUrl);
            return { anchor, tp };
          }),
        );
        if (myToken !== movieTimeRefreshToken) {
          return;
        }
        items.forEach(({ anchor, tp }) => {
          if (tp) {
            appendBadgeToAnchor(anchor, tp);
          }
        });
      }
    }
  } catch {
    // Keep silent to avoid breaking the rest of the extension.
  }
}

function setupMovieTime(): void {
  if (movieTimeObserver) {
    movieTimeObserver.disconnect();
    movieTimeObserver = null;
  }
  videoProgressCleanup?.();
  videoProgressCleanup = null;
  if (movieTimeDebounceTimer !== null) {
    window.clearTimeout(movieTimeDebounceTimer);
    movieTimeDebounceTimer = null;
  }
  if (movieTimeUrlPollId !== null) {
    window.clearInterval(movieTimeUrlPollId);
    movieTimeUrlPollId = null;
  }
  const prevStorageCleanup = movieTimeStorageCleanup;
  movieTimeStorageCleanup = null;
  if (prevStorageCleanup !== null) {
    prevStorageCleanup();
  }

  if (!currentSettings.movieTimeEnabled) {
    document.getElementById(MOVIE_TIME_ROOT_ID)?.remove();
    document.getElementById(MOVIE_TIME_SUMMARY_ID)?.remove();
    return;
  }

  lastMovieTimeHref = location.href;
  if (movieTimeUrlPollId !== null) {
    window.clearInterval(movieTimeUrlPollId);
  }
  movieTimeUrlPollId = window.setInterval(() => {
    if (location.href !== lastMovieTimeHref) {
      lastMovieTimeHref = location.href;
      void updateMovieTimeSummary();
    }
  }, 800);

  void updateMovieTimeSummary();
  movieTimeObserver = new MutationObserver((records) => {
    if (shouldIgnoreMovieTimeMutations(records)) {
      return;
    }
    scheduleMovieTimeUpdate();
  });
  movieTimeObserver.observe(document.body, { childList: true, subtree: true });

  const onStorage = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
    if (area !== "local" || changes[CHAPTER_PROGRESS_STORAGE_KEY] === undefined) {
      return;
    }
    void updateMovieTimeSummary();
  };
  chrome.storage.onChanged.addListener(onStorage);
  movieTimeStorageCleanup = () => {
    chrome.storage.onChanged.removeListener(onStorage);
  };
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
      videoProgressCleanup?.();
      videoProgressCleanup = null;
      if (movieTimeDebounceTimer !== null) {
        window.clearTimeout(movieTimeDebounceTimer);
      }
      if (wordCountObserver) {
        wordCountObserver.disconnect();
      }
      if (movieTimeObserver) {
        movieTimeObserver.disconnect();
      }
      if (movieTimeUrlPollId !== null) {
        window.clearInterval(movieTimeUrlPollId);
      }
      if (movieTimeStorageCleanup !== null) {
        movieTimeStorageCleanup();
      }
      window.clearInterval(intervalId);
    };
  },
});
