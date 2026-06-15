import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import browser from "webextension-polyfill";
import { Button } from "../../components/Button";

type ShortcutFieldKey =
  | "shortcutPlayOrPause"
  | "shortcutSeekBackward"
  | "shortcutSeekForward"
  | "shortcutMute"
  | "shortcutFullscreen"
  | "shortcutPictureInPicture"
  | "shortcutTheaterMode"
  | "shortcutExpandSection"
  | "shortcutPreviousSection"
  | "shortcutNextSection";

function formatShortcutFromKeyboardEvent(event: KeyboardEvent): string | null {
  const key = event.key;
  const modifierKeys = new Set(["Control", "Shift", "Alt", "Meta"]);
  if (modifierKeys.has(key)) {
    return null;
  }

  const parts: string[] = [];
  if (event.ctrlKey) {
    parts.push("Ctrl");
  }
  if (event.shiftKey) {
    parts.push("Shift");
  }
  if (event.altKey) {
    parts.push("Alt");
  }
  if (event.metaKey) {
    parts.push("Meta");
  }

  if (key === " ") {
    parts.push("Space");
  } else if (key.length === 1) {
    parts.push(key.toUpperCase());
  } else {
    parts.push(key);
  }

  return parts.join("+");
}

function Options() {
  // Sparrow settings
  const [enabled, setEnabled] = useState(true);
  const [autoPlayEnabled, setAutoPlayEnabled] = useState(true);
  const [backgroundAutoPlay, setBackgroundAutoPlay] = useState(false);
  const [returnToChapter, setReturnToChapter] = useState(true);
  const [hideUI, setHideUI] = useState(false);

  // UI settings
  const [buttonPosition, setButtonPosition] = useState<
    "right-top" | "right-bottom" | "left-top" | "left-bottom"
  >("right-top");
  const [minimalMode, setMinimalMode] = useState(false);

  // Notification settings
  const [notifyVideoCompleted, setNotifyVideoCompleted] = useState(false);
  const [notifyAllVideosCompleted, setNotifyAllVideosCompleted] = useState(false);
  const [notifyTestDetected, setNotifyTestDetected] = useState(true);
  const [movieTimeEnabled, setMovieTimeEnabled] = useState(true);
  const [wordCountEnabled, setWordCountEnabled] = useState(true);
  const [keyboardShortcutsEnabled, setKeyboardShortcutsEnabled] = useState(true);
  const [disableMathJaxFocusEnabled, setDisableMathJaxFocusEnabled] = useState(true);
  const [referenceSizeAdjustmentEnabled, setReferenceSizeAdjustmentEnabled] = useState(true);
  const [referenceAdditionalHeight, setReferenceAdditionalHeight] = useState(0);
  const [modifyStickyMovieEnabled, setModifyStickyMovieEnabled] = useState(true);
  const [modifyStickyMovieMode, setModifyStickyMovieMode] = useState<
    "original_modified" | "disable"
  >("original_modified");
  const [shortcutPlayOrPause, setShortcutPlayOrPause] = useState("K");
  const [shortcutSeekBackward, setShortcutSeekBackward] = useState("J");
  const [shortcutSeekForward, setShortcutSeekForward] = useState("L");
  const [shortcutMute, setShortcutMute] = useState("M");
  const [shortcutFullscreen, setShortcutFullscreen] = useState("F");
  const [shortcutPictureInPicture, setShortcutPictureInPicture] = useState("P");
  const [shortcutTheaterMode, setShortcutTheaterMode] = useState("T");
  const [shortcutExpandSection, setShortcutExpandSection] = useState("Ctrl+B");
  const [shortcutPreviousSection, setShortcutPreviousSection] = useState("Ctrl+Shift+ArrowUp");
  const [shortcutNextSection, setShortcutNextSection] = useState("Ctrl+Shift+ArrowDown");
  const [shortcutSeekSeconds, setShortcutSeekSeconds] = useState(10);
  const [recordingShortcutField, setRecordingShortcutField] = useState<ShortcutFieldKey | null>(
    null,
  );

  useEffect(() => {
    if (!recordingShortcutField) {
      return;
    }

    const handleKeydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setRecordingShortcutField(null);
        return;
      }

      const formatted = formatShortcutFromKeyboardEvent(event);
      if (!formatted) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      switch (recordingShortcutField) {
        case "shortcutPlayOrPause":
          setShortcutPlayOrPause(formatted);
          break;
        case "shortcutSeekBackward":
          setShortcutSeekBackward(formatted);
          break;
        case "shortcutSeekForward":
          setShortcutSeekForward(formatted);
          break;
        case "shortcutMute":
          setShortcutMute(formatted);
          break;
        case "shortcutFullscreen":
          setShortcutFullscreen(formatted);
          break;
        case "shortcutPictureInPicture":
          setShortcutPictureInPicture(formatted);
          break;
        case "shortcutTheaterMode":
          setShortcutTheaterMode(formatted);
          break;
        case "shortcutExpandSection":
          setShortcutExpandSection(formatted);
          break;
        case "shortcutPreviousSection":
          setShortcutPreviousSection(formatted);
          break;
        case "shortcutNextSection":
          setShortcutNextSection(formatted);
          break;
      }

      setRecordingShortcutField(null);
    };

    window.addEventListener("keydown", handleKeydown, true);
    return () => {
      window.removeEventListener("keydown", handleKeydown, true);
    };
  }, [recordingShortcutField]);

  useEffect(() => {
    // Listen for changes in storage
    const handleStorageChange = (
      changes: { [key: string]: browser.Storage.StorageChange },
      areaName: string,
    ) => {
      if (areaName !== "local") return;

      if (changes.enabled !== undefined) {
        setEnabled(changes.enabled.newValue as boolean);
      }
      if (changes.autoPlayEnabled !== undefined) {
        setAutoPlayEnabled(changes.autoPlayEnabled.newValue as boolean);
      }
      if (changes.backgroundAutoPlay !== undefined) {
        setBackgroundAutoPlay(changes.backgroundAutoPlay.newValue as boolean);
      }
      if (changes.returnToChapter !== undefined) {
        setReturnToChapter(changes.returnToChapter.newValue as boolean);
      }
      if (changes.hideUI !== undefined) {
        setHideUI(changes.hideUI.newValue as boolean);
      }
      if (changes.buttonPosition) {
        setButtonPosition(
          changes.buttonPosition.newValue as
            | "right-top"
            | "right-bottom"
            | "left-top"
            | "left-bottom",
        );
      }
      if (changes.minimalMode !== undefined) {
        setMinimalMode(changes.minimalMode.newValue as boolean);
      }
      if (changes.notifyVideoCompleted !== undefined) {
        setNotifyVideoCompleted(changes.notifyVideoCompleted.newValue as boolean);
      }
      if (changes.notifyAllVideosCompleted !== undefined) {
        setNotifyAllVideosCompleted(changes.notifyAllVideosCompleted.newValue as boolean);
      }
      if (changes.notifyTestDetected !== undefined) {
        setNotifyTestDetected(changes.notifyTestDetected.newValue as boolean);
      }
      if (changes.movieTimeEnabled !== undefined) {
        setMovieTimeEnabled(changes.movieTimeEnabled.newValue as boolean);
      }
      if (changes.wordCountEnabled !== undefined) {
        setWordCountEnabled(changes.wordCountEnabled.newValue as boolean);
      }
      if (changes.keyboardShortcutsEnabled !== undefined) {
        setKeyboardShortcutsEnabled(changes.keyboardShortcutsEnabled.newValue as boolean);
      }
      if (changes.disableMathJaxFocusEnabled !== undefined) {
        setDisableMathJaxFocusEnabled(changes.disableMathJaxFocusEnabled.newValue as boolean);
      }
      if (changes.referenceSizeAdjustmentEnabled !== undefined) {
        setReferenceSizeAdjustmentEnabled(
          changes.referenceSizeAdjustmentEnabled.newValue as boolean,
        );
      }
      if (changes.referenceAdditionalHeight !== undefined) {
        setReferenceAdditionalHeight(changes.referenceAdditionalHeight.newValue as number);
      }
      if (changes.modifyStickyMovieEnabled !== undefined) {
        setModifyStickyMovieEnabled(changes.modifyStickyMovieEnabled.newValue as boolean);
      }
      if (changes.modifyStickyMovieMode !== undefined) {
        setModifyStickyMovieMode(
          (changes.modifyStickyMovieMode.newValue as "original_modified" | "disable") ??
            "original_modified",
        );
      }
      if (changes.shortcutPlayOrPause !== undefined) {
        setShortcutPlayOrPause(changes.shortcutPlayOrPause.newValue as string);
      }
      if (changes.shortcutSeekBackward !== undefined) {
        setShortcutSeekBackward(changes.shortcutSeekBackward.newValue as string);
      }
      if (changes.shortcutSeekForward !== undefined) {
        setShortcutSeekForward(changes.shortcutSeekForward.newValue as string);
      }
      if (changes.shortcutMute !== undefined) {
        setShortcutMute(changes.shortcutMute.newValue as string);
      }
      if (changes.shortcutFullscreen !== undefined) {
        setShortcutFullscreen(changes.shortcutFullscreen.newValue as string);
      }
      if (changes.shortcutPictureInPicture !== undefined) {
        setShortcutPictureInPicture(changes.shortcutPictureInPicture.newValue as string);
      }
      if (changes.shortcutTheaterMode !== undefined) {
        setShortcutTheaterMode(changes.shortcutTheaterMode.newValue as string);
      }
      if (changes.shortcutExpandSection !== undefined) {
        setShortcutExpandSection(changes.shortcutExpandSection.newValue as string);
      }
      if (changes.shortcutPreviousSection !== undefined) {
        setShortcutPreviousSection(changes.shortcutPreviousSection.newValue as string);
      }
      if (changes.shortcutNextSection !== undefined) {
        setShortcutNextSection(changes.shortcutNextSection.newValue as string);
      }
      if (changes.shortcutSeekSeconds !== undefined) {
        setShortcutSeekSeconds(changes.shortcutSeekSeconds.newValue as number);
      }
    };

    browser.storage.onChanged.addListener(handleStorageChange);

    // Load saved settings
    (async () => {
      const result = await browser.storage.local.get([
        "enabled",
        "autoPlayEnabled",
        "backgroundAutoPlay",
        "returnToChapter",
        "hideUI",
        "buttonPosition",
        "minimalMode",
        "notifyVideoCompleted",
        "notifyAllVideosCompleted",
        "notifyTestDetected",
        "movieTimeEnabled",
        "wordCountEnabled",
        "keyboardShortcutsEnabled",
        "disableMathJaxFocusEnabled",
        "referenceSizeAdjustmentEnabled",
        "referenceAdditionalHeight",
        "modifyStickyMovieEnabled",
        "modifyStickyMovieMode",
        "shortcutPlayOrPause",
        "shortcutSeekBackward",
        "shortcutSeekForward",
        "shortcutMute",
        "shortcutFullscreen",
        "shortcutPictureInPicture",
        "shortcutTheaterMode",
        "shortcutExpandSection",
        "shortcutPreviousSection",
        "shortcutNextSection",
        "shortcutSeekSeconds",
      ]);

      if (result.enabled !== undefined) {
        setEnabled(result.enabled as boolean);
      }
      if (result.autoPlayEnabled !== undefined) {
        setAutoPlayEnabled(result.autoPlayEnabled as boolean);
      }
      if (result.backgroundAutoPlay !== undefined) {
        setBackgroundAutoPlay(result.backgroundAutoPlay as boolean);
      }
      if (result.returnToChapter !== undefined) {
        setReturnToChapter(result.returnToChapter as boolean);
      }
      if (result.hideUI !== undefined) {
        setHideUI(result.hideUI as boolean);
      }
      if (result.buttonPosition) {
        setButtonPosition(
          result.buttonPosition as "right-top" | "right-bottom" | "left-top" | "left-bottom",
        );
      }
      if (result.minimalMode !== undefined) {
        setMinimalMode(result.minimalMode as boolean);
      }
      if (result.notifyVideoCompleted !== undefined) {
        setNotifyVideoCompleted(result.notifyVideoCompleted as boolean);
      }
      if (result.notifyAllVideosCompleted !== undefined) {
        setNotifyAllVideosCompleted(result.notifyAllVideosCompleted as boolean);
      }
      if (result.notifyTestDetected !== undefined) {
        setNotifyTestDetected(result.notifyTestDetected as boolean);
      }
      if (result.movieTimeEnabled !== undefined) {
        setMovieTimeEnabled(result.movieTimeEnabled as boolean);
      }
      if (result.wordCountEnabled !== undefined) {
        setWordCountEnabled(result.wordCountEnabled as boolean);
      }
      if (result.keyboardShortcutsEnabled !== undefined) {
        setKeyboardShortcutsEnabled(result.keyboardShortcutsEnabled as boolean);
      }
      if (result.disableMathJaxFocusEnabled !== undefined) {
        setDisableMathJaxFocusEnabled(result.disableMathJaxFocusEnabled as boolean);
      }
      if (result.referenceSizeAdjustmentEnabled !== undefined) {
        setReferenceSizeAdjustmentEnabled(result.referenceSizeAdjustmentEnabled as boolean);
      }
      if (result.referenceAdditionalHeight !== undefined) {
        setReferenceAdditionalHeight(result.referenceAdditionalHeight as number);
      }
      if (result.modifyStickyMovieEnabled !== undefined) {
        setModifyStickyMovieEnabled(result.modifyStickyMovieEnabled as boolean);
      }
      if (result.modifyStickyMovieMode !== undefined) {
        setModifyStickyMovieMode(result.modifyStickyMovieMode as "original_modified" | "disable");
      }
      if (result.shortcutPlayOrPause !== undefined) {
        setShortcutPlayOrPause(result.shortcutPlayOrPause as string);
      }
      if (result.shortcutSeekBackward !== undefined) {
        setShortcutSeekBackward(result.shortcutSeekBackward as string);
      }
      if (result.shortcutSeekForward !== undefined) {
        setShortcutSeekForward(result.shortcutSeekForward as string);
      }
      if (result.shortcutMute !== undefined) {
        setShortcutMute(result.shortcutMute as string);
      }
      if (result.shortcutFullscreen !== undefined) {
        setShortcutFullscreen(result.shortcutFullscreen as string);
      }
      if (result.shortcutPictureInPicture !== undefined) {
        setShortcutPictureInPicture(result.shortcutPictureInPicture as string);
      }
      if (result.shortcutTheaterMode !== undefined) {
        setShortcutTheaterMode(result.shortcutTheaterMode as string);
      }
      if (result.shortcutExpandSection !== undefined) {
        setShortcutExpandSection(result.shortcutExpandSection as string);
      }
      if (result.shortcutPreviousSection !== undefined) {
        setShortcutPreviousSection(result.shortcutPreviousSection as string);
      }
      if (result.shortcutNextSection !== undefined) {
        setShortcutNextSection(result.shortcutNextSection as string);
      }
      if (result.shortcutSeekSeconds !== undefined) {
        setShortcutSeekSeconds(result.shortcutSeekSeconds as number);
      }
    })();
    return () => {
      browser.storage.onChanged.removeListener(handleStorageChange);
    };
  }, []);

  const handleSave = async () => {
    await browser.storage.local
      .set({
        enabled,
        autoPlayEnabled,
        backgroundAutoPlay,
        returnToChapter,
        hideUI,
        buttonPosition,
        minimalMode,
        notifyVideoCompleted,
        notifyAllVideosCompleted,
        notifyTestDetected,
        movieTimeEnabled,
        wordCountEnabled,
        keyboardShortcutsEnabled,
        disableMathJaxFocusEnabled,
        referenceSizeAdjustmentEnabled,
        referenceAdditionalHeight,
        modifyStickyMovieEnabled,
        modifyStickyMovieMode,
        shortcutPlayOrPause,
        shortcutSeekBackward,
        shortcutSeekForward,
        shortcutMute,
        shortcutFullscreen,
        shortcutPictureInPicture,
        shortcutTheaterMode,
        shortcutExpandSection,
        shortcutPreviousSection,
        shortcutNextSection,
        shortcutSeekSeconds,
      })
      .then(() => {
        alert("Settings have been saved");
      });
  };

  const startRecordingShortcut = (field: ShortcutFieldKey) => {
    setRecordingShortcutField(field);
  };

  const stopRecordingShortcut = () => {
    setRecordingShortcutField(null);
  };

  const renderShortcutInput = (
    field: ShortcutFieldKey,
    value: string,
    setValue: (newValue: string) => void,
    placeholder: string,
  ) => {
    const isRecording = recordingShortcutField === field;

    return (
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "8px" }}>
        <input value={value} onChange={(e) => setValue(e.target.value)} placeholder={placeholder} />
        <Button
          onClick={() => {
            if (isRecording) {
              stopRecordingShortcut();
            } else {
              startRecordingShortcut(field);
            }
          }}
          variant={isRecording ? "danger" : "other"}
        >
          {isRecording ? "Recording..." : "Record"}
        </Button>
      </div>
    );
  };

  return (
    <div style={{ padding: "20px", maxWidth: "600px", margin: "0 auto" }}>
      <h1>Sparrow - Settings</h1>
      <div style={{ marginBottom: "20px" }}>
        <h2>Video Playback Settings</h2>
        <div style={{ marginBottom: "10px" }}>
          <label style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
            />
            Enable extension
          </label>
        </div>
        <div style={{ marginBottom: "10px" }}>
          <label style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <input
              type="checkbox"
              checked={autoPlayEnabled}
              onChange={(e) => setAutoPlayEnabled(e.target.checked)}
              disabled={!enabled}
            />
            Enable auto-play for videos
          </label>
        </div>
        <div style={{ marginBottom: "10px" }}>
          <label style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <input
              type="checkbox"
              checked={backgroundAutoPlay}
              onChange={(e) => setBackgroundAutoPlay(e.target.checked)}
              disabled={!enabled}
            />
            Enable background auto-play
          </label>
        </div>
        <div style={{ marginBottom: "10px" }}>
          <label style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <input
              type="checkbox"
              checked={returnToChapter}
              onChange={(e) => setReturnToChapter(e.target.checked)}
              disabled={!enabled}
            />
            Return to chapter after completion
          </label>
        </div>
        <div style={{ marginBottom: "20px" }}>
          <label style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <input
              type="checkbox"
              checked={hideUI}
              onChange={(e) => setHideUI(e.target.checked)}
              disabled={!enabled}
            />
            Hide UI buttons on video pages
          </label>
        </div>
      </div>
      <div style={{ marginBottom: "20px" }}>
        <h2>UI Settings</h2>
        <div style={{ marginBottom: "20px" }}>
          <label htmlFor="buttonPosition" style={{ display: "block", marginBottom: "8px" }}>
            Button Position
          </label>
          <select
            id="buttonPosition"
            value={buttonPosition}
            onChange={(e) =>
              setButtonPosition(
                e.target.value as "right-top" | "right-bottom" | "left-top" | "left-bottom",
              )
            }
            style={{
              width: "100%",
              height: "32px",
              padding: "0 8px",
              borderRadius: "4px",
              border: "1px solid #ccc",
              boxSizing: "border-box",
            }}
          >
            <option value="right-top">Right Top</option>
            <option value="right-bottom">Right Bottom</option>
            <option value="left-top">Left Top</option>
            <option value="left-bottom">Left Bottom</option>
          </select>
        </div>
        <div style={{ marginBottom: "20px" }}>
          <label style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <input
              type="checkbox"
              checked={minimalMode}
              onChange={(e) => setMinimalMode(e.target.checked)}
            />
            Use minimal button mode (icon only)
          </label>
        </div>
      </div>
      <div style={{ marginBottom: "20px" }}>
        <h2>Notification Settings</h2>
        <div style={{ marginBottom: "10px" }}>
          <label style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <input
              type="checkbox"
              checked={notifyVideoCompleted}
              onChange={(e) => setNotifyVideoCompleted(e.target.checked)}
            />
            Notify when a video is completed
          </label>
        </div>
        <div style={{ marginBottom: "10px" }}>
          <label style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <input
              type="checkbox"
              checked={notifyAllVideosCompleted}
              onChange={(e) => setNotifyAllVideosCompleted(e.target.checked)}
            />
            Notify when all videos in a chapter are completed
          </label>
        </div>
        <div style={{ marginBottom: "20px" }}>
          <label style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <input
              type="checkbox"
              checked={notifyTestDetected}
              onChange={(e) => setNotifyTestDetected(e.target.checked)}
            />
            Notify when a test is detected (default: ON)
          </label>
        </div>
      </div>
      <div style={{ marginBottom: "20px" }}>
        <h2>Plus content–style features</h2>
        <div style={{ marginBottom: "10px" }}>
          <label style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <input
              type="checkbox"
              checked={movieTimeEnabled}
              onChange={(e) => setMovieTimeEnabled(e.target.checked)}
            />
            Show total video time on chapter lists
          </label>
        </div>
        <div style={{ marginBottom: "10px" }}>
          <label style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <input
              type="checkbox"
              checked={wordCountEnabled}
              onChange={(e) => setWordCountEnabled(e.target.checked)}
            />
            Show word count while typing
          </label>
        </div>
        <div style={{ marginBottom: "10px" }}>
          <label style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <input
              type="checkbox"
              checked={keyboardShortcutsEnabled}
              onChange={(e) => setKeyboardShortcutsEnabled(e.target.checked)}
            />
            Enable custom keyboard shortcuts
          </label>
        </div>
        <div style={{ marginBottom: "10px" }}>
          <label style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <input
              type="checkbox"
              checked={disableMathJaxFocusEnabled}
              onChange={(e) => setDisableMathJaxFocusEnabled(e.target.checked)}
            />
            Disable MathJax focus by Tab key
          </label>
        </div>
        <div style={{ marginBottom: "10px" }}>
          <label style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <input
              type="checkbox"
              checked={referenceSizeAdjustmentEnabled}
              onChange={(e) => setReferenceSizeAdjustmentEnabled(e.target.checked)}
            />
            Enable reference/subtitle size adjustment
          </label>
        </div>
        <div style={{ marginBottom: "10px" }}>
          <label style={{ display: "block", marginBottom: "8px" }}>
            Reference additional height
          </label>
          <input
            type="number"
            value={referenceAdditionalHeight}
            onChange={(e) => setReferenceAdditionalHeight(Number(e.target.value))}
            style={{ width: "100%", height: "32px", padding: "0 8px", boxSizing: "border-box" }}
          />
        </div>
        <div style={{ marginBottom: "10px" }}>
          <label style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <input
              type="checkbox"
              checked={modifyStickyMovieEnabled}
              onChange={(e) => setModifyStickyMovieEnabled(e.target.checked)}
            />
            Enable sticky movie behavior fix
          </label>
        </div>
        <div style={{ marginBottom: "20px" }}>
          <label htmlFor="stickyMovieMode" style={{ display: "block", marginBottom: "8px" }}>
            Sticky movie mode
          </label>
          <select
            id="stickyMovieMode"
            value={modifyStickyMovieMode}
            onChange={(e) =>
              setModifyStickyMovieMode(e.target.value as "original_modified" | "disable")
            }
            style={{
              width: "100%",
              height: "32px",
              padding: "0 8px",
              borderRadius: "4px",
              border: "1px solid #ccc",
              boxSizing: "border-box",
            }}
          >
            <option value="original_modified">Original modified</option>
            <option value="disable">Disable sticky outside theater mode</option>
          </select>
        </div>
      </div>
      <div style={{ marginBottom: "20px" }}>
        <h2>Shortcut Settings</h2>
        <p style={{ marginTop: 0 }}>
          Examples: K, Ctrl+B, Ctrl+Shift+ArrowUp. Click "Record" and press keys.
        </p>
        <div style={{ display: "grid", gap: "10px" }}>
          {renderShortcutInput(
            "shortcutPlayOrPause",
            shortcutPlayOrPause,
            setShortcutPlayOrPause,
            "Play/Pause",
          )}
          {renderShortcutInput(
            "shortcutSeekBackward",
            shortcutSeekBackward,
            setShortcutSeekBackward,
            "Seek backward",
          )}
          {renderShortcutInput(
            "shortcutSeekForward",
            shortcutSeekForward,
            setShortcutSeekForward,
            "Seek forward",
          )}
          {renderShortcutInput("shortcutMute", shortcutMute, setShortcutMute, "Mute")}
          {renderShortcutInput(
            "shortcutFullscreen",
            shortcutFullscreen,
            setShortcutFullscreen,
            "Fullscreen",
          )}
          {renderShortcutInput(
            "shortcutPictureInPicture",
            shortcutPictureInPicture,
            setShortcutPictureInPicture,
            "Picture in picture",
          )}
          {renderShortcutInput(
            "shortcutTheaterMode",
            shortcutTheaterMode,
            setShortcutTheaterMode,
            "Theater mode",
          )}
          {renderShortcutInput(
            "shortcutExpandSection",
            shortcutExpandSection,
            setShortcutExpandSection,
            "Expand section",
          )}
          {renderShortcutInput(
            "shortcutPreviousSection",
            shortcutPreviousSection,
            setShortcutPreviousSection,
            "Previous section",
          )}
          {renderShortcutInput(
            "shortcutNextSection",
            shortcutNextSection,
            setShortcutNextSection,
            "Next section",
          )}
          <input
            type="number"
            value={shortcutSeekSeconds}
            onChange={(e) => setShortcutSeekSeconds(Number(e.target.value))}
            placeholder="Seek seconds"
          />
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center" }}>
        <Button onClick={handleSave} variant="other">
          Save
        </Button>
        <div style={{ marginLeft: "auto", paddingLeft: "40px" }}>
          Please check{" "}
          <a
            href="https://github.com/operationcheck/sparrow/"
            target="_blank"
            rel="noopener noreferrer"
          >
            GitHub
          </a>{" "}
          for inquiries.
        </div>
      </div>
    </div>
  );
}

const root = document.createElement("div");
document.body.appendChild(root);
createRoot(root).render(<Options />);
