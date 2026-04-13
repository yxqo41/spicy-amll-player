/**
 * Spicy AMLL Player — Lyrics Applyer
 * Builds DOM elements from parsed TTML data.
 * Port of Applyer/Synced/Syllable.ts + Line.ts
 */

import isRtl from './is-rtl.js';
import { settingsManager } from './settings-manager.js';
import { gibberishify, weebify } from './text-transformers.js';

const LYRICS_BETWEEN_SHOW = 3;
const INTERLUDE_EARLIER_BY = 0;
const IDLE_LYRICS_SCALE = 0.95;

function transformText(text) {
  const format = settingsManager.get("memeFormat");
  if (format === "Gibberish (Wenomechainsama)") return gibberishify(text);
  if (format === "Weeb (・`ω´・)") return weebify(text);
  return text;
}

/**
 * Convert time from seconds to milliseconds.
 */
function convertTime(t) {
  return t * 1000;
}

/**
 * Global lyrics object tracking all line/word references.
 */
export const LyricsObject = {
  Types: {
    Syllable: { Lines: [] },
    Line: { Lines: [] },
    Static: { Lines: [] },
  },
};

let currentLineIndex = -1;

function setWordArrayInCurrentLine() {
  currentLineIndex = LyricsObject.Types.Syllable.Lines.length - 1;
  if (currentLineIndex >= 0) {
    LyricsObject.Types.Syllable.Lines[currentLineIndex].Syllables = { Lead: [] };
  }
}

function setWordArrayInCurrentLine_LINE() {
  currentLineIndex = LyricsObject.Types.Line.Lines.length - 1;
  if (currentLineIndex >= 0) {
    LyricsObject.Types.Line.Lines[currentLineIndex].Syllables = { Lead: [] };
  }
}

export function clearLyricsArrays() {
  LyricsObject.Types.Syllable.Lines = [];
  LyricsObject.Types.Line.Lines = [];
  LyricsObject.Types.Static.Lines = [];
  currentLineIndex = -1;
}

/**
 * Apply Syllable-synced lyrics to the DOM.
 * @param {object} data - Parsed TTML data with Type="Syllable"
 * @param {HTMLElement} lyricsContentEl - The .LyricsContent element
 * @returns {HTMLElement} The scroll container element
 */
export function applySyllableLyrics(data, lyricsContentEl) {
  clearLyricsArrays();

  const container = document.createElement("div");
  container.classList.add("SpicyLyricsScrollContainer");
  container.setAttribute("data-lyrics-type", "Syllable");
  if (settingsManager.get("simpleLyricsMode")) {
    container.classList.add("sl-simple-mode");
  }

  // Leading interlude dots
  if (data.StartTime >= LYRICS_BETWEEN_SHOW) {
    createMusicalLine(container, 0, convertTime(data.StartTime + INTERLUDE_EARLIER_BY),
      data.Content[0]?.OppositeAligned, "Syllable");
  }

  data.Content.forEach((line, index, arr) => {
    const lineElem = document.createElement("div");
    lineElem.classList.add("line");

    const nextLineStartTime = arr[index + 1]?.Lead.StartTime ?? 0;
    const lineEndTimeAndNextDist = nextLineStartTime !== 0 ? nextLineStartTime - line.Lead.EndTime : 0;
    const lineEndTime = line.Lead.EndTime;

    LyricsObject.Types.Syllable.Lines.push({
      HTMLElement: lineElem,
      StartTime: convertTime(line.Lead.StartTime),
      EndTime: convertTime(lineEndTime),
      TotalTime: convertTime(lineEndTime) - convertTime(line.Lead.StartTime),
    });
    setWordArrayInCurrentLine();

    if (line.OppositeAligned) lineElem.classList.add("OppositeAligned");

    container.appendChild(lineElem);

    let currentWordGroup = null;

    // Build words/syllables
    line.Lead.Syllables.forEach((lead, iL, aL) => {
      const word = document.createElement("span");

      if (isRtl(lead.Text) && !lineElem.classList.contains("rtl")) {
        lineElem.classList.add("rtl");
      }

      const totalDuration = convertTime(lead.EndTime) - convertTime(lead.StartTime);

      word.textContent = transformText(lead.Text);
      if (!settingsManager.get("simpleLyricsMode")) {
        word.style.setProperty("--gradient-position", "-20%");
        word.style.setProperty("--text-shadow-opacity", "0%");
        word.style.setProperty("--text-shadow-blur-radius", "4px");
        word.style.scale = IDLE_LYRICS_SCALE.toString();
        word.style.transform = "translateY(calc(var(--DefaultLyricsSize) * 0.01))";
      }
      word.classList.add("word");

      if (iL === aL.length - 1) {
        word.classList.add("LastWordInLine");
      } else if (lead.IsPartOfWord) {
        word.classList.add("PartOfWord");
      }

      const ci = LyricsObject.Types.Syllable.Lines.length - 1;
      if (LyricsObject.Types.Syllable.Lines[ci]?.Syllables?.Lead) {
        LyricsObject.Types.Syllable.Lines[ci].Syllables.Lead.push({
          HTMLElement: word,
          Text: lead.Text,
          StartTime: convertTime(lead.StartTime),
          EndTime: convertTime(lead.EndTime),
          TotalTime: totalDuration,
        });
      }

      const mergeWords = settingsManager.get("syllableRendering") === "Merge Words";

      if (mergeWords && lead.IsPartOfWord) {
        if (!currentWordGroup) {
          currentWordGroup = document.createElement("span");
          currentWordGroup.classList.add("word-group");
          lineElem.appendChild(currentWordGroup);
        }
        currentWordGroup.appendChild(word);
      } else {
        currentWordGroup = null;
        lineElem.appendChild(word);
      }
    });

    // Background vocals
    if (line.Background) {
      line.Background.forEach(bg => {
        const bgLine = document.createElement("div");
        bgLine.classList.add("line", "bg-line");

        LyricsObject.Types.Syllable.Lines.push({
          HTMLElement: bgLine,
          StartTime: convertTime(bg.StartTime),
          EndTime: convertTime(bg.EndTime),
          TotalTime: convertTime(bg.EndTime) - convertTime(bg.StartTime),
          BGLine: true,
        });
        setWordArrayInCurrentLine();

        if (line.OppositeAligned) bgLine.classList.add("OppositeAligned");
        container.appendChild(bgLine);

        let currentBGWordGroup = null;

        bg.Syllables.forEach((bw, bI, bA) => {
          const bwE = document.createElement("span");

          if (isRtl(bw.Text) && !bgLine.classList.contains("rtl")) {
            bgLine.classList.add("rtl");
          }

          bwE.textContent = transformText(bw.Text);
          if (!settingsManager.get("simpleLyricsMode")) {
            bwE.style.setProperty("--gradient-position", "0%");
            bwE.style.setProperty("--text-shadow-opacity", "0%");
            bwE.style.setProperty("--text-shadow-blur-radius", "4px");
            bwE.style.scale = IDLE_LYRICS_SCALE.toString();
            bwE.style.transform = "translateY(calc(var(--font-size) * 0.01))";
          }

          const ci = LyricsObject.Types.Syllable.Lines.length - 1;
          if (LyricsObject.Types.Syllable.Lines[ci]?.Syllables?.Lead) {
            LyricsObject.Types.Syllable.Lines[ci].Syllables.Lead.push({
              HTMLElement: bwE,
              Text: bw.Text,
              StartTime: convertTime(bw.StartTime),
              EndTime: convertTime(bw.EndTime),
              TotalTime: convertTime(bw.EndTime) - convertTime(bw.StartTime),
              BGWord: true,
            });
          }

          bwE.classList.add("bg-word", "word");

          if (bI === bA.length - 1) {
            bwE.classList.add("LastWordInLine");
          } else if (bw.IsPartOfWord) {
            bwE.classList.add("PartOfWord");
          }

          const prevBG = bA[bI - 1];
          if (bw.IsPartOfWord || (prevBG?.IsPartOfWord && currentBGWordGroup)) {
            if (!currentBGWordGroup) {
              const group = document.createElement("span");
              group.classList.add("word-group");
              bgLine.appendChild(group);
              currentBGWordGroup = group;
            }
            currentBGWordGroup.appendChild(bwE);
            if (!bw.IsPartOfWord && prevBG?.IsPartOfWord) currentBGWordGroup = null;
          } else {
            currentBGWordGroup = null;
            bgLine.appendChild(bwE);
          }
        });
      });
    }

    // Interlude dots between lines
    if (arr[index + 1] && arr[index + 1].Lead.StartTime - line.Lead.EndTime >= LYRICS_BETWEEN_SHOW) {
      createMusicalLine(container,
        convertTime(line.Lead.EndTime),
        convertTime(arr[index + 1].Lead.StartTime + INTERLUDE_EARLIER_BY),
        arr[index + 1].OppositeAligned, "Syllable");
    }
  });

  // Credits
  if (data.SongWriters && data.SongWriters.length > 0) {
    const credits = document.createElement("div");
    credits.classList.add("Credits");
    credits.textContent = "Written by: " + data.SongWriters.join(", ");
    container.appendChild(credits);
  }

  // Add spacer for centering
  const spacer = document.createElement("div");
  spacer.classList.add("lyrics-spacer");
  container.appendChild(spacer);

  lyricsContentEl.innerHTML = "";
  lyricsContentEl.appendChild(container);

  return container;
}


/**
 * Estimates the 'rhythmic weight' of a word based on character count,
 * ignoring punctuation to provide more natural timing.
 */
function getTextWeight(text) {
  const compact = text.replace(/[.,!?;:'"()[\]{}\-—–…@#$%^&*~`]/g, "").replace(/\s/g, "");
  return Math.max(1, compact.length || text.trim().length);
}

/**
 * Converts Line-synced lyrics to Syllable-synced by estimating word durations.
 * Distributes line duration proportionally based on character weight.
 */
export function convertToSyllable(data) {
  const syllableData = {
    ...data,
    Type: "Syllable",
    Content: data.Content.map(line => {
      const wordsText = line.Text.split(/\s+/).filter(Boolean);
      if (wordsText.length === 0) return null;

      const totalDuration = (line.EndTime && line.EndTime > line.StartTime) 
        ? line.EndTime - line.StartTime 
        : 1.5; // Fallback duration for lines without EndTime
      
      const weights = wordsText.map(w => getTextWeight(w));
      const totalWeight = weights.reduce((sum, w) => sum + w, 0);

      let currentCursor = line.StartTime;
      let currentPosInLine = 0;

      const syllables = wordsText.map((wordText, i) => {
        const weight = weights[i];
        const wordDuration = (weight / totalWeight) * totalDuration;
        
        const start = currentCursor;
        const end = currentCursor + wordDuration;
        currentCursor = end;

        // Try to find the exact text in the line for spacing/punctuation accuracy
        const foundIdx = line.Text.indexOf(wordText, currentPosInLine);
        if (foundIdx !== -1) currentPosInLine = foundIdx + wordText.length;

        return {
          Text: wordText,
          StartTime: start,
          EndTime: end,
          IsPartOfWord: false
        };
      });

      return {
        OppositeAligned: line.OppositeAligned,
        Lead: {
          StartTime: line.StartTime,
          EndTime: line.EndTime,
          Syllables: syllables
        }
      };
    }).filter(Boolean)
  };
  return syllableData;
}

/**
 * Apply Line-synced lyrics to the DOM.
 */
export function applyLineLyrics(data, lyricsContentEl) {
  if (settingsManager.get("forceWordSync")) {
    return applySyllableLyrics(convertToSyllable(data), lyricsContentEl);
  }

  clearLyricsArrays();

  const container = document.createElement("div");
  container.classList.add("SpicyLyricsScrollContainer");
  container.setAttribute("data-lyrics-type", "Line");
  if (settingsManager.get("simpleLyricsMode")) {
    container.classList.add("sl-simple-mode");
  }

  if (data.StartTime >= LYRICS_BETWEEN_SHOW) {
    createMusicalLine(container, 0, convertTime(data.StartTime + INTERLUDE_EARLIER_BY),
      data.Content[0]?.OppositeAligned, "Line");
  }

  data.Content.forEach((line, index, arr) => {
    const lineElem = document.createElement("div");
    lineElem.classList.add("line");

    LyricsObject.Types.Line.Lines.push({
      HTMLElement: lineElem,
      StartTime: convertTime(line.StartTime),
      EndTime: convertTime(line.EndTime),
      TotalTime: convertTime(line.EndTime) - convertTime(line.StartTime),
    });
    setWordArrayInCurrentLine_LINE();

    if (line.OppositeAligned) lineElem.classList.add("OppositeAligned");
    if (isRtl(line.Text)) lineElem.classList.add("rtl");

    // For line-synced, text is a single word element
    const wordElem = document.createElement("span");
    wordElem.classList.add("word");
    wordElem.textContent = transformText(line.Text);
    lineElem.appendChild(wordElem);

    container.appendChild(lineElem);

    // Interlude dots
    if (arr[index + 1] && arr[index + 1].StartTime - line.EndTime >= LYRICS_BETWEEN_SHOW) {
      createMusicalLine(container,
        convertTime(line.EndTime),
        convertTime(arr[index + 1].StartTime + INTERLUDE_EARLIER_BY),
        arr[index + 1].OppositeAligned, "Line");
    }
  });

  if (data.SongWriters && data.SongWriters.length > 0) {
    const credits = document.createElement("div");
    credits.classList.add("Credits");
    credits.textContent = "Written by: " + data.SongWriters.join(", ");
    container.appendChild(credits);
  }

  // Add spacer for centering
  const spacer = document.createElement("div");
  spacer.classList.add("lyrics-spacer");
  container.appendChild(spacer);

  lyricsContentEl.innerHTML = "";
  lyricsContentEl.appendChild(container);
  return container;
}


/**
 * Apply Static lyrics to the DOM.
 */
export function applyStaticLyrics(data, lyricsContentEl) {
  clearLyricsArrays();

  const container = document.createElement("div");
  container.classList.add("SpicyLyricsScrollContainer");
  container.setAttribute("data-lyrics-type", "Static");

  data.Lines.forEach(line => {
    const lineElem = document.createElement("div");
    lineElem.classList.add("line", "static");
    if (isRtl(line.Text)) lineElem.classList.add("rtl");

    const wordElem = document.createElement("span");
    wordElem.classList.add("word");
    wordElem.textContent = transformText(line.Text);
    lineElem.appendChild(wordElem);

    LyricsObject.Types.Static.Lines.push({ HTMLElement: lineElem });
    container.appendChild(lineElem);
  });

  if (data.SongWriters && data.SongWriters.length > 0) {
    const credits = document.createElement("div");
    credits.classList.add("Credits");
    credits.textContent = "Written by: " + data.SongWriters.join(", ");
    container.appendChild(credits);
  }

  // Add spacer for centering
  const spacer = document.createElement("div");
  spacer.classList.add("lyrics-spacer");
  container.appendChild(spacer);

  lyricsContentEl.innerHTML = "";
  lyricsContentEl.appendChild(container);
  return container;
}

/**
 * Creates musical interlude dots.
 */
function createMusicalLine(container, startTime, endTime, oppositeAligned, lyricsType) {
  const musicalLine = document.createElement("div");
  musicalLine.classList.add("line", "musical-line");

  const totalTime = endTime - startTime;
  const lineData = {
    HTMLElement: musicalLine,
    StartTime: startTime,
    EndTime: endTime,
    TotalTime: totalTime,
    DotLine: true,
  };

  if (lyricsType === "Syllable") {
    LyricsObject.Types.Syllable.Lines.push(lineData);
    setWordArrayInCurrentLine();
  } else {
    LyricsObject.Types.Line.Lines.push(lineData);
    setWordArrayInCurrentLine_LINE();
  }

  if (oppositeAligned) musicalLine.classList.add("OppositeAligned");

  const dotGroup = document.createElement("div");
  dotGroup.classList.add("dotGroup");

  const dotTime = totalTime / 3;
  const ci = lyricsType === "Syllable"
    ? LyricsObject.Types.Syllable.Lines.length - 1
    : LyricsObject.Types.Line.Lines.length - 1;
  const targetLines = lyricsType === "Syllable"
    ? LyricsObject.Types.Syllable.Lines
    : LyricsObject.Types.Line.Lines;

  for (let d = 0; d < 3; d++) {
    const dot = document.createElement("span");
    dot.classList.add("word", "dot");
    dot.textContent = "•";

    if (targetLines[ci]?.Syllables?.Lead) {
      targetLines[ci].Syllables.Lead.push({
        HTMLElement: dot,
        StartTime: startTime + dotTime * d,
        EndTime: d === 2 ? endTime - 400 : startTime + dotTime * (d + 1),
        TotalTime: dotTime,
        Dot: true,
      });
    }
    dotGroup.appendChild(dot);
  }

  musicalLine.appendChild(dotGroup);
  container.appendChild(musicalLine);
}
