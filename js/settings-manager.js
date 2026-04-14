/**
 * Spicy AMLL Player — Settings Manager
 * Manages the application settings state and persistence.
 */

export const LYRICS_SOURCE_PROVIDER_DEFINITIONS = {
  spicy: {
    label: "Spicy Lyrics API (currently unavailable due to the original developer not giving us access)",
    description: "Our high-quality TTML repository.",
    id: "spicy"
  },
  apple: {
    label: "Apple Music (currently unavailable due to the original developer not giving us access)",
    description: "Premium animated and time-synced lyrics.",
    id: "apple"
  },
  musixmatch: {
    label: "Musixmatch",
    description: "Extensive database with word-sync support.",
    id: "musixmatch"
  },
  netease: {
    label: "NetEase Cloud Music",
    description: "Great for regional and international tracks.",
    id: "netease"
  },
  lrclib: {
    label: "LRCLIB",
    description: "Simple, open-source synced lyrics community.",
    id: "lrclib"
  },
  genius: {
    label: "Genius",
    description: "Unsynced crowd-sourced meanings and lyrics.",
    id: "genius"
  }
};

export const DEFAULT_LYRICS_SOURCE_ORDER = ["musixmatch", "lrclib", "netease"];



class SettingsManager {
  constructor() {
    this.defaults = {
      viewControlsPosition: "Top",
      lockedMediaBox: false,
      settingsOnTop: true,
      lyricsRenderer: "Spicy",
      simpleLyricsMode: false,
      minimalLyricsMode: false,
      syllableRendering: "Default", // Default, Merge Words
      staticBackground: false,
      staticBackgroundType: "Auto",
      hide_npv_bg: false,
      coverArtAnimation: true,
      rightAlignLyrics: false,
      customFontEnabled: false,
      customFont: "",
      lyricsSourceOrder: [...DEFAULT_LYRICS_SOURCE_ORDER],
      disabledLyricsSources: [],
      musixmatchToken: "",
      ignoreMusixmatchWordSync: true,
      prioritizeAppleMusicQuality: true,
      language: "en-US",
      memeFormat: "Off", // Off, Gibberish, Weeb
      releaseYearPosition: "After Artist", // Off, Before Artist, After Artist
      videoExportOrientation: "Vertical", // Vertical, Horizontal
      videoExportResolution: "1080p", // 720p, 1080p
      forceWordSync: false,
      showSongwriters: true
    };

    this.settings = { ...this.defaults };
    this.load();
  }

  load() {
    const saved = localStorage.getItem("spicy_settings");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        this.settings = { ...this.defaults, ...parsed };
      } catch (e) {
        console.error("Failed to parse settings", e);
      }
    }
  }

  save() {
    localStorage.setItem("spicy_settings", JSON.stringify(this.settings));
    this.apply();
  }

  get(key) {
    return this.settings[key] ?? this.defaults[key];
  }

  set(key, value) {
    this.settings[key] = value;
    this.save();
  }

  apply() {
    const root = document.documentElement;
    const body = document.body;

    // Custom Font
    if (this.settings.customFontEnabled && this.settings.customFont) {
      root.style.setProperty("--spicy-custom-font", this.settings.customFont);
      body.style.fontFamily = `var(--spicy-custom-font), var(--font-family, 'Inter', sans-serif)`;
    } else {
      root.style.removeProperty("--spicy-custom-font");
      body.style.fontFamily = "";
    }

    // Alignment
    if (this.settings.rightAlignLyrics) {
      root.classList.add("sl-right-aligned");
    } else {
      root.classList.remove("sl-right-aligned");
    }

    // Minimal Mode
    if (this.settings.minimalLyricsMode) {
      body.classList.add("sl-minimal-mode");
    } else {
      body.classList.remove("sl-minimal-mode");
    }

    // Background Visibility
    const dynamicBg = document.getElementById("dynamic-bg");
    if (dynamicBg) {
      dynamicBg.style.display = this.settings.hide_npv_bg ? "none" : "block";
    }

    // Dispatch event for other modules (e.g., animated-art.js)
    window.dispatchEvent(new CustomEvent("spicy-settings-changed", { detail: this.settings }));
  }
}

export const settingsManager = new SettingsManager();
window.spicySettings = settingsManager; // Global access for debugging
