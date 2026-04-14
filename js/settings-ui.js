import { settingsManager, LYRICS_SOURCE_PROVIDER_DEFINITIONS } from "./settings-manager.js";
import { EQ_BANDS, EQ_PRESETS } from "./equalizer-presets.js";

/**
 * settings-ui.js
 * Handles the creation and management of the settings modal.
 */

class SettingsUI {
  constructor() {
    this.modal = null;
    this.overlay = null;
  }

  show() {
    if (document.querySelector(".SpicyLyricsSettingsOverlay")) return;

    this.overlay = document.createElement("div");
    this.overlay.className = "SpicyLyricsSettingsOverlay";
    this.overlay.onclick = () => this.hide();

    this.modal = document.createElement("div");
    this.modal.className = "SpicyLyricsSettingsContainer";
    this.modal.onclick = (e) => e.stopPropagation();

    // Header
    const header = document.createElement("div");
    header.className = "SpicyLyricsSettingsHeader";
    header.innerHTML = `
      <span>Spicy AMLL Player Settings</span>
      <button class="SpicyLyricsSettingsHeaderClose">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    `;
    header.querySelector(".SpicyLyricsSettingsHeaderClose").onclick = () => this.hide();
    this.modal.appendChild(header);

    // Scroll Area
    const scrollArea = document.createElement("div");
    scrollArea.className = "SpicyLyricsSettingsScroll";
    this.modal.appendChild(scrollArea);

    this.renderSettings(scrollArea);

    this.overlay.appendChild(this.modal);
    document.body.appendChild(this.overlay);

    // Trigger open animation
    setTimeout(() => {
        this.overlay.classList.add("active");
        this.modal.classList.add("active");
    }, 10);
  }

  hide() {
    if (!this.overlay) return;
    this.overlay.classList.remove("active");
    this.modal.classList.remove("active");
    setTimeout(() => {
      if (this.overlay) {
        this.overlay.remove();
        this.overlay = null;
        this.modal = null;
      }
    }, 300);
  }

  renderSettings(container) {
    // --- Appearance ---
    this.addGroup(container, "Appearance");

    this.addToggle(container, "Custom Font", "customFontEnabled", (val) => {
        const fontInputRow = container.querySelector(".font-input-row");
        if (fontInputRow) fontInputRow.style.display = val ? "flex" : "none";
    });

    this.addInput(container, "Font name / URL", "customFont", "font-input-row", !settingsManager.get("customFontEnabled"));
    
    this.addToggle(container, "Right Align Lyrics", "rightAlignLyrics");
    this.addToggle(container, "Minimal Mode (Fullscreen only)", "minimalLyricsMode");
    
    this.addDropdown(container, "Syllable Rendering", "syllableRendering", ["Default", "Merge Words", "Reduce Splits"]);
    this.addDropdown(container, "Meme Format", "memeFormat", ["Off", "Weeb (・`ω´・)", "Gibberish (Wenomechainsama)"]);
    this.addToggle(container, "Simple Lyrics", "simpleLyricsMode");
    this.addDropdown(container, "Release Year Position", "releaseYearPosition", ["Off", "Before Artist", "After Artist"]);
    this.addToggle(container, "Show Songwriters", "showSongwriters");
    this.addToggle(container, "Force Word Sync", "forceWordSync");

    // --- Background ---
    this.addGroup(container, "Background");
    this.addToggle(container, "Hide Dynamic Background", "hide_npv_bg");
    this.addDropdown(container, "Static Background Type", "staticBackgroundType", ["Auto", "Album Art", "Blurred Video"]);
    this.addToggle(container, "Animated Art Video", "coverArtAnimation");

    // --- Video Export ---
    this.addGroup(container, "Video Export (Beta)");
    
    const exportBtn = document.createElement("button");
    exportBtn.className = "sl-btn";
    exportBtn.textContent = "Start Video Render";
    exportBtn.style.marginTop = "10px";
    exportBtn.style.background = "#30d15833";
    exportBtn.style.borderColor = "#30d15866";
    exportBtn.onclick = () => {
        this.hide();
        window.dispatchEvent(new CustomEvent("spicy-export-video"));
    };
    
    this.addRow(container, "Export Movie", exportBtn);

    // --- Lyrics & Providers ---
    this.addGroup(container, "Lyrics Providers");

    this.addDropdown(container, "Preferred Language", "language", ["en-US", "zh-CN", "ja-JP", "es-ES", "ko-KR", "fr-FR"]);
    
    const providerBtn = document.createElement("button");
    providerBtn.className = "sl-btn";
    providerBtn.textContent = "Manage Provider Order";
    providerBtn.style.marginTop = "10px";
    providerBtn.onclick = () => this.showProviderManager();
    
    this.addRow(container, "Lyrics Sources", providerBtn);

    this.addToggle(container, "Ignore Musixmatch Word Sync", "ignoreMusixmatchWordSync");
    this.addToggle(container, "Prioritize Apple Music Quality", "prioritizeAppleMusicQuality");
    
    this.addInput(container, "Musixmatch Token", "musixmatchToken");
    const tokenRow = container.querySelector(".sl-settings-row:last-child");
    if (tokenRow) {
        tokenRow.querySelector("input").disabled = true;
        tokenRow.querySelector("input").style.opacity = "0.6";
    }

    // --- Audio Engine ---
    this.addGroup(container, "Audio Engine");
    
    const eqBtn = document.createElement("button");
    eqBtn.className = "sl-btn";
    eqBtn.textContent = "Open Mixing Board (EQ)";
    eqBtn.style.marginTop = "10px";
    eqBtn.onclick = () => this.showMixingBoard();
    this.addRow(container, "Equalizer", eqBtn);
  }

  addGroup(container, title) {
    const h = document.createElement("h3");
    h.className = "sl-settings-group";
    h.textContent = title;
    container.appendChild(h);
  }

  addRow(container, label, control, extraClass = "", hidden = false) {
    const row = document.createElement("div");
    row.className = `sl-settings-row ${extraClass}`;
    if (hidden) row.style.display = "none";
    
    const lbl = document.createElement("span");
    lbl.className = "sl-settings-label";
    lbl.textContent = label;
    
    row.appendChild(lbl);
    row.appendChild(control);
    container.appendChild(row);
    return row;
  }

  addToggle(container, label, key, callback) {
    const wrap = document.createElement("label");
    wrap.className = "sl-toggle";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = settingsManager.get(key);
    input.onchange = () => {
      settingsManager.set(key, input.checked);
      if (callback) callback(input.checked);
    };
    const knob = document.createElement("span");
    wrap.appendChild(input);
    wrap.appendChild(knob);
    this.addRow(container, label, wrap);
  }

  addInput(container, label, key, extraClass = "", hidden = false) {
    const input = document.createElement("input");
    input.type = "text";
    input.className = "sl-input";
    input.value = settingsManager.get(key);
    input.oninput = () => {
      settingsManager.set(key, input.value);
    };
    this.addRow(container, label, input, extraClass, hidden);
  }

  addDropdown(container, label, key, options) {
    const sel = document.createElement("select");
    sel.className = "sl-select";
    options.forEach(opt => {
      const o = document.createElement("option");
      o.value = opt;
      o.textContent = opt;
      if (opt === settingsManager.get(key)) o.selected = true;
      sel.appendChild(o);
    });
    sel.onchange = () => {
      settingsManager.set(key, sel.value);
    };
    this.addRow(container, label, sel);
  }

  showProviderManager() {
    const pmOverlay = document.createElement("div");
    pmOverlay.className = "SpicyLyricsSettingsOverlay active";
    pmOverlay.style.zIndex = "10001";
    pmOverlay.onclick = () => pmOverlay.remove();
    
    const pmModal = document.createElement("div");
    pmModal.className = "SpicyLyricsSettingsContainer active";
    pmModal.style.width = "90%";
    pmModal.style.maxWidth = "500px";
    pmModal.onclick = (e) => e.stopPropagation();

    const header = document.createElement("div");
    header.className = "SpicyLyricsSettingsHeader";
    header.innerHTML = `<span>Manage Providers</span><button class="pm-close" style="background:none; border:none; color:inherit; cursor:pointer; font-size:20px;">✕</button>`;
    header.querySelector(".pm-close").onclick = () => pmOverlay.remove();
    pmModal.appendChild(header);

    const scroll = document.createElement("div");
    scroll.className = "SpicyLyricsSettingsScroll";
    pmModal.appendChild(scroll);

    const renderList = () => {
      scroll.innerHTML = "";
      const order = settingsManager.get("lyricsSourceOrder");
      const disabled = settingsManager.get("disabledLyricsSources");

      order.forEach((id, index) => {
        const def = LYRICS_SOURCE_PROVIDER_DEFINITIONS[id];
        const row = document.createElement("div");
        row.className = "sl-settings-row";
        row.style.padding = "10px 15px";
        row.style.background = "rgba(255,255,255,0.05)";
        row.style.borderRadius = "8px";
        row.style.marginBottom = "8px";
        row.style.display = "flex";
        row.style.justifyContent = "space-between";
        row.style.alignItems = "center";

        const labelWrap = document.createElement("div");
        labelWrap.style.display = "flex";
        labelWrap.style.flexDirection = "column";
        labelWrap.innerHTML = `
          <span style="font-weight:600; font-size: 14px;">${index + 1}. ${def.label}</span>
          <span style="font-size: 11px; opacity: 0.6;">${def.description}</span>
        `;

        const actions = document.createElement("div");
        actions.style.display = "flex";
        actions.style.gap = "8px";
        actions.style.alignItems = "center";

        // Up/Down Buttons
        const createBtn = (text, disabled, cb) => {
          const b = document.createElement("button");
          b.className = "sl-btn-small";
          b.style.padding = "4px 8px";
          b.style.fontSize = "12px";
          b.textContent = text;
          b.disabled = disabled;
          b.onclick = cb;
          return b;
        };

        const upBtn = createBtn("↑", index === 0, () => {
          const newOrder = [...order];
          [newOrder[index], newOrder[index - 1]] = [newOrder[index - 1], newOrder[index]];
          settingsManager.set("lyricsSourceOrder", newOrder);
          renderList();
        });

        const downBtn = createBtn("↓", index === order.length - 1, () => {
          const newOrder = [...order];
          [newOrder[index], newOrder[index + 1]] = [newOrder[index + 1], newOrder[index]];
          settingsManager.set("lyricsSourceOrder", newOrder);
          renderList();
        });

        const isOff = disabled.includes(id);
        const toggle = createBtn(isOff ? "Off" : "On", false, () => {
          let newDisabled = [...disabled];
          if (isOff) {
            newDisabled = newDisabled.filter(d => d !== id);
          } else {
            newDisabled.push(id);
          }
          settingsManager.set("disabledLyricsSources", newDisabled);
          renderList();
        });
        if (isOff) toggle.style.opacity = "0.5";

        actions.appendChild(upBtn);
        actions.appendChild(downBtn);
        actions.appendChild(toggle);

        row.appendChild(labelWrap);
        row.appendChild(actions);
        scroll.appendChild(row);
      });
    };

    renderList();
    pmOverlay.appendChild(pmModal);
    document.body.appendChild(pmOverlay);
  }

  showMixingBoard() {
    const overlay = document.createElement("div");
    overlay.className = "SpicyLyricsSettingsOverlay active";
    overlay.style.zIndex = "10002";
    overlay.onclick = () => overlay.remove();

    const modal = document.createElement("div");
    modal.className = "SpicyLyricsSettingsContainer active";
    modal.style.maxWidth = "600px";
    modal.style.width = "95vw";
    modal.onclick = (e) => e.stopPropagation();

    const header = document.createElement("div");
    header.className = "SpicyLyricsSettingsHeader";
    header.innerHTML = `<span>Spicy Mixing Board (EQ)</span><button class="pm-close" style="background:none; border:none; color:inherit; cursor:pointer; font-size:20px;">✕</button>`;
    header.querySelector(".pm-close").onclick = () => overlay.remove();
    modal.appendChild(header);

    const scrollArea = document.createElement("div");
    scrollArea.className = "SpicyLyricsSettingsScroll";
    scrollArea.style.padding = "20px";
    modal.appendChild(scrollArea);

    // Presets Row
    const presetRow = document.createElement("div");
    presetRow.style.marginBottom = "20px";
    presetRow.innerHTML = `<span style="font-size: 13px; opacity: 0.6; margin-right: 10px;">Preset:</span>`;
    const sel = document.createElement("select");
    sel.className = "sl-select";
    sel.style.width = "auto";
    Object.keys(EQ_PRESETS).forEach(p => {
      const o = document.createElement("option");
      o.value = p; o.textContent = p;
      sel.appendChild(o);
    });
    presetRow.appendChild(sel);
    scrollArea.appendChild(presetRow);

    // Sliders Container
    const slidersContainer = document.createElement("div");
    slidersContainer.style.display = "flex";
    slidersContainer.style.justifyContent = "space-between";
    slidersContainer.style.height = "250px";
    slidersContainer.style.gap = "8px";
    scrollArea.appendChild(slidersContainer);

    const currentGains = settingsManager.get("eqGains");
    const sliders = [];

    EQ_BANDS.forEach((freq, i) => {
      const col = document.createElement("div");
      col.style.display = "flex";
      col.style.flexDirection = "column";
      col.style.alignItems = "center";
      col.style.flex = "1";

      const valLabel = document.createElement("span");
      valLabel.style.fontSize = "10px";
      valLabel.style.marginBottom = "8px";
      valLabel.textContent = currentGains[i] > 0 ? `+${currentGains[i]}` : currentGains[i];

      const slider = document.createElement("input");
      slider.type = "range";
      slider.className = "sl-eq-slider";
      slider.setAttribute("orient", "vertical"); // For some browsers
      slider.style.appearance = "slider-vertical";
      slider.style.width = "10px";
      slider.style.height = "180px";
      slider.min = "-12";
      slider.max = "12";
      slider.step = "1";
      slider.value = currentGains[i];

      const freqLabel = document.createElement("span");
      freqLabel.style.fontSize = "9px";
      freqLabel.style.marginTop = "8px";
      freqLabel.style.opacity = "0.6";
      freqLabel.textContent = freq >= 1000 ? `${freq/1000}k` : freq;

      slider.oninput = () => {
        valLabel.textContent = slider.value > 0 ? `+${slider.value}` : slider.value;
        const newGains = [...settingsManager.get("eqGains")];
        newGains[i] = parseInt(slider.value);
        settingsManager.set("eqGains", newGains);
      };

      sliders.push(slider);
      col.appendChild(valLabel);
      col.appendChild(slider);
      col.appendChild(freqLabel);
      slidersContainer.appendChild(col);
    });

    sel.onchange = () => {
      const preset = EQ_PRESETS[sel.value];
      if (preset) {
        settingsManager.set("eqGains", [...preset]);
        preset.forEach((gain, i) => {
          sliders[i].value = gain;
          const label = sliders[i].previousSibling;
          if (label) label.textContent = gain > 0 ? `+${gain}` : gain;
        });
      }
    };

    overlay.appendChild(modal);
    document.body.appendChild(overlay);
  }
}

export const settingsUI = new SettingsUI();
