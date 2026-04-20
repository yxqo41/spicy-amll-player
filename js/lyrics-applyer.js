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
 * Checks if a word is eligible for letter-by-letter emphasis.
 * Restricted to LTR languages and depends on character length vs duration.
 */
function isLetterCapable(text, duration) {
  const isSimpleMode = settingsManager.get("simpleLyricsMode");
  const letterLength = text.split("").length;

  if (isSimpleMode) return false; // FUCKKKK
  
  if (isRtl(text)) return false;

  // New sensitivity: 0.9s and 8+ letters
  if (duration >= 900 && letterLength >= 8) {
    return true;
  }

  // Fallback to complex duration formula for other words
  const baseMinDuration = isSimpleMode ? 1050 : 1000;
  const complexMinDuration = baseMinDuration + ((letterLength - 1) * 25);
  
  return duration >= complexMinDuration;
}

/**
 * Splits a word into individual letters and sets up timing for each.
 */
function applyEmphasis(letters, wordElem, lead, isBgWord = false) {
  const isSimpleMode = settingsManager.get("simpleLyricsMode");
  
  // Official subtractions from Emphasize.ts
  // In simple mode: shift start 21ms earlier and trim less off the end (40ms vs 250ms)
  const subStart = isSimpleMode ? 21 : 0;
  const subEnd = isSimpleMode ? 40 : 250;

  const startTime = convertTime(lead.StartTime) - subStart;
  const endTime = convertTime(lead.EndTime) - subEnd;
  const totalDuration = endTime - startTime;
  const letterDuration = totalDuration / letters.length;
  
  const letterDataArr = [];

  letters.forEach((letter, index) => {
    const letterElem = document.createElement("span");
    letterElem.textContent = letter;
    letterElem.classList.add("letter", "Emphasis");
    
    const letterStartTime = startTime + (index * letterDuration);
    const letterEndTime = letterStartTime + letterDuration;

    if (index === letters.length - 1) {
      letterElem.classList.add("LastLetterInWord");
    }

    if (!settingsManager.get("simpleLyricsMode")) {
      letterElem.style.setProperty("--gradient-position", "-20%");
    }
    letterElem.style.setProperty("--text-shadow-opacity", "0%");
    letterElem.style.setProperty("--text-shadow-blur-radius", "4px");
    letterElem.style.scale = IDLE_LYRICS_SCALE.toString();
    letterElem.style.transform = `translateY(calc(var(--DefaultLyricsSize) * 0.02))`;

    letterDataArr.push({
      HTMLElement: letterElem,
      StartTime: letterStartTime,
      EndTime: letterEndTime,
      TotalTime: letterDuration,
      Emphasis: true,
      BGLetter: isBgWord
    });

    wordElem.appendChild(letterElem);
  });

  wordElem.classList.add("letterGroup");
  return letterDataArr;
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
  RawData: null, // Stores the original parsed data
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
  const showRomanized = settingsManager.get("showRomanized");
  const showTranslation = settingsManager.get("showTranslation");
  LyricsObject.RawData = data;
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
    lineElem.setAttribute("dir", "auto");

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
    let syllablesToRender = line.Lead.Syllables;
    if (showTranslation && line.TranslatedText) {
      const words = line.TranslatedText.split(" ");
      const totalTime = line.Lead.EndTime - line.Lead.StartTime;
      const wordTime = totalTime / words.length;
      
      syllablesToRender = words.map((w, index) => ({
        Text: w,
        StartTime: line.Lead.StartTime + (index * wordTime),
        EndTime: line.Lead.StartTime + ((index + 1) * wordTime),
        IsPartOfWord: false
      }));
    }

    syllablesToRender.forEach((lead, iL, aL) => {
      const displayText = (!showTranslation && showRomanized && lead.RomanizedText !== undefined) ? lead.RomanizedText : lead.Text;
      const totalDuration = convertTime(lead.EndTime) - convertTime(lead.StartTime);
      const isEmphasized = isLetterCapable(displayText, totalDuration);
      
      let word;
      let lettersData = null;

      if (isEmphasized) {
        word = document.createElement("div");
        const letters = displayText.split("");
        lettersData = applyEmphasis(letters, word, lead, false);
      } else {
        word = document.createElement("span");
        word.textContent = transformText(displayText);
        if (!settingsManager.get("simpleLyricsMode")) {
          word.style.setProperty("--gradient-position", "-20%");
          word.style.setProperty("--text-shadow-opacity", "0%");
          word.style.setProperty("--text-shadow-blur-radius", "4px");
          word.style.scale = IDLE_LYRICS_SCALE.toString();
          word.style.transform = "translateY(calc(var(--DefaultLyricsSize) * 0.01))";
        } else {
          // Clear any stale inline styles from a previous non-simple render
          word.style.removeProperty("--gradient-position");
          word.style.removeProperty("--text-shadow-opacity");
          word.style.removeProperty("--text-shadow-blur-radius");
          word.style.removeProperty("scale");
          word.style.removeProperty("transform");
        }
        word.classList.add("word");
      }

      if (isRtl(displayText) && !lineElem.classList.contains("rtl")) {
        lineElem.classList.add("rtl");
      }

      const ci = LyricsObject.Types.Syllable.Lines.length - 1;
      if (LyricsObject.Types.Syllable.Lines[ci]?.Syllables?.Lead) {
        const syllableObj = {
          HTMLElement: word,
          Text: displayText,
          StartTime: convertTime(lead.StartTime),
          EndTime: convertTime(lead.EndTime),
          TotalTime: totalDuration,
        };
        if (isEmphasized) {
          syllableObj.LetterGroup = true;
          syllableObj.Letters = lettersData;
        }
        LyricsObject.Types.Syllable.Lines[ci].Syllables.Lead.push(syllableObj);
      }

      if (iL === aL.length - 1) {
        word.classList.add("LastWordInLine");
      } else if (lead.IsPartOfWord) {
        word.classList.add("PartOfWord");
      }

      const mergeWords = settingsManager.get("syllableRendering") === "Merge Words";

      if (mergeWords) {
        if (lead.IsPartOfWord) {
          if (!currentWordGroup) {
            currentWordGroup = document.createElement("span");
            currentWordGroup.classList.add("word-group");
            lineElem.appendChild(currentWordGroup);
          }
          currentWordGroup.appendChild(word);
        } else {
          if (currentWordGroup) {
            currentWordGroup.appendChild(word);
            currentWordGroup = null;
          } else {
            lineElem.appendChild(word);
          }
        }
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
        bgLine.setAttribute("dir", "auto");

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
          const displayBgText = (showRomanized && bw.RomanizedText !== undefined) ? bw.RomanizedText : bw.Text;
          const totalDuration = convertTime(bw.EndTime) - convertTime(bw.StartTime);
          const isEmphasized = isLetterCapable(displayBgText, totalDuration);

          let bwE;
          let lettersData = null;

          if (isEmphasized) {
            bwE = document.createElement("div");
            const letters = displayBgText.split("");
            lettersData = applyEmphasis(letters, bwE, bw, true);
          } else {
            bwE = document.createElement("span");
            bwE.textContent = transformText(displayBgText);
            if (!settingsManager.get("simpleLyricsMode")) {
              bwE.style.setProperty("--gradient-position", "0%");
              bwE.style.setProperty("--text-shadow-opacity", "0%");
              bwE.style.setProperty("--text-shadow-blur-radius", "4px");
              bwE.style.scale = IDLE_LYRICS_SCALE.toString();
              bwE.style.transform = "translateY(calc(var(--font-size) * 0.01))";
            } else {
              bwE.style.removeProperty("--gradient-position");
              bwE.style.removeProperty("--text-shadow-opacity");
              bwE.style.removeProperty("--text-shadow-blur-radius");
              bwE.style.removeProperty("scale");
              bwE.style.removeProperty("transform");
            }
            bwE.classList.add("word");
          }

          if (isRtl(displayBgText) && !bgLine.classList.contains("rtl")) {
            bgLine.classList.add("rtl");
          }

          const ci = LyricsObject.Types.Syllable.Lines.length - 1;
          if (LyricsObject.Types.Syllable.Lines[ci]?.Syllables?.Lead) {
            const syllableObj = {
              HTMLElement: bwE,
              Text: displayBgText,
              StartTime: convertTime(bw.StartTime),
              EndTime: convertTime(bw.EndTime),
              TotalTime: totalDuration,
              BGWord: true,
            };
            if (isEmphasized) {
              syllableObj.LetterGroup = true;
              syllableObj.Letters = lettersData;
            }
            LyricsObject.Types.Syllable.Lines[ci].Syllables.Lead.push(syllableObj);
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
  renderCredits(data, container);

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
 * Preserves original spacing and punctuation into the syllable tokens.
 */
export function convertToSyllable(data) {
  const processTextSegment = (text, startTime, endTime) => {
    const rawWords = text.split(/\s+/).filter(Boolean);
    if (rawWords.length === 0) return [];

    const totalDuration = (endTime && endTime > startTime) ? endTime - startTime : 1.5;
    const weights = rawWords.map(w => getTextWeight(w));
    const totalWeight = weights.reduce((sum, w) => sum + w, 0);

    let currentCursor = startTime;
    let currentPosInLine = 0;

    return rawWords.map((word, i) => {
      const weight = weights[i];
      const wordDuration = (weight / totalWeight) * totalDuration;
      const start = currentCursor;
      const end = currentCursor + wordDuration;
      currentCursor = end;

      // Find the exact text in the line for spacing/punctuation accuracy
      const foundIdx = text.indexOf(word, currentPosInLine);
      let capturedText = word;
      
      if (foundIdx !== -1) {
        // Find where the next word starts to capture the "gap" (spaces/punctuation)
        const nextWord = rawWords[i + 1];
        let nextIdx = nextWord ? text.indexOf(nextWord, foundIdx + word.length) : text.length;
        
        // If we found the next word, capture everything from current word start to next word start
        if (nextIdx !== -1) {
          capturedText = text.substring(foundIdx, nextIdx);
          currentPosInLine = nextIdx;
        } else {
          // Last word, capture everything to the end
          capturedText = text.substring(foundIdx);
          currentPosInLine = text.length;
        }
      }

      return {
        Text: capturedText.trim(),
        StartTime: start,
        EndTime: end,
        IsPartOfWord: false
      };
    });
  };

  const syllableData = {
    ...data,
    Type: "Syllable",
    Content: data.Content.map(line => {
      const leadSyllables = processTextSegment(line.Text, line.StartTime, line.EndTime);
      if (leadSyllables.length === 0) return null;

      const res = {
        OppositeAligned: line.OppositeAligned,
        Lead: {
          StartTime: line.StartTime,
          EndTime: line.EndTime,
          Syllables: leadSyllables
        }
      };

      // Handle background vocals if they exist in the line data
      if (line.Background && Array.from(line.Background).length > 0) {
        res.Background = line.Background.map(bg => {
          // If background already has syllables (e.g. from a partial word-sync parse), reconstruct text first
          const bgText = bg.Text || bg.Syllables?.map(s => s.Text).join("") || "";
          return {
            StartTime: bg.StartTime,
            EndTime: bg.EndTime,
            Syllables: processTextSegment(bgText, bg.StartTime, bg.EndTime)
          };
        });
      }

      return res;
    }).filter(Boolean)
  };
  return syllableData;
}

/**
 * Apply Line-synced lyrics to the DOM.
 */
export function applyLineLyrics(data, lyricsContentEl) {
  const showRomanized = settingsManager.get("showRomanized");
  const showTranslation = settingsManager.get("showTranslation");
  LyricsObject.RawData = data;
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
    lineElem.setAttribute("dir", "auto");

    LyricsObject.Types.Line.Lines.push({
      HTMLElement: lineElem,
      StartTime: convertTime(line.StartTime),
      EndTime: convertTime(line.EndTime),
      TotalTime: convertTime(line.EndTime) - convertTime(line.StartTime),
    });
    setWordArrayInCurrentLine_LINE();

    if (line.OppositeAligned) lineElem.classList.add("OppositeAligned");
    
    const displayText = (showTranslation && line.TranslatedText !== undefined) ? line.TranslatedText : (showRomanized && line.RomanizedText !== undefined) ? line.RomanizedText : line.Text;
    if (isRtl(displayText)) lineElem.classList.add("rtl");

    // For line-synced, text is a single word element
    const wordElem = document.createElement("span");
    wordElem.classList.add("word");
    wordElem.textContent = transformText(displayText);
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

  // Credits
  renderCredits(data, container);

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
  const showRomanized = settingsManager.get("showRomanized");
  const showTranslation = settingsManager.get("showTranslation");
  LyricsObject.RawData = data;
  clearLyricsArrays();

  const container = document.createElement("div");
  container.classList.add("SpicyLyricsScrollContainer");
  container.setAttribute("data-lyrics-type", "Static");

  data.Lines.forEach(line => {
    const displayText = (showTranslation && line.TranslatedText !== undefined) ? line.TranslatedText : (showRomanized && line.RomanizedText !== undefined) ? line.RomanizedText : line.Text;
    const lineElem = document.createElement("div");
    lineElem.classList.add("line", "static");
    lineElem.setAttribute("dir", "auto");
    if (isRtl(displayText)) lineElem.classList.add("rtl");

    const wordElem = document.createElement("span");
    wordElem.classList.add("word");
    wordElem.textContent = transformText(displayText);
    lineElem.appendChild(wordElem);

    LyricsObject.Types.Static.Lines.push({ HTMLElement: lineElem });
    container.appendChild(lineElem);
  });

  // Credits
  renderCredits(data, container);

  // Add spacer for centering
  const spacer = document.createElement("div");
  spacer.classList.add("lyrics-spacer");
  container.appendChild(spacer);

  lyricsContentEl.innerHTML = "";
  lyricsContentEl.appendChild(container);
  return container;
}

/**
 * Renders credits for songwriters and TTML makers.
 */
function renderCredits(data, container) {
  const hasSongWriters = data.SongWriters && data.SongWriters.length > 0;
  const hasMaker = data.makerHandle && data.makerId;

  if (!hasSongWriters && !hasMaker) return;

  const creditsContainer = document.createElement("div");
  creditsContainer.classList.add("Credits");

  if (hasSongWriters) {
    const songwriters = document.createElement("div");
    songwriters.classList.add("CreditLine", "Songwriters");
    songwriters.textContent = "Written by: " + data.SongWriters.join(", ");
    creditsContainer.appendChild(songwriters);
  }

  if (hasMaker) {
    const makerSection = document.createElement("div");
    makerSection.classList.add("MakerSection");

    const communityHeader = document.createElement("div");
    communityHeader.classList.add("CreditNotice");
    communityHeader.textContent = "These lyrics have been provided by our community";
    makerSection.appendChild(communityHeader);

    const makerCredits = document.createElement("div");
    makerCredits.classList.add("CreditLine", "TTMLMaker");
    
    const label = document.createTextNode("Made and Uploaded by ");
    const link = document.createElement("a");
    link.href = `https://discord.com/users/${data.makerId}`;
    link.target = "_blank";
    link.classList.add("maker-link");
    link.textContent = data.makerHandle;
    
    makerCredits.appendChild(label);
    makerCredits.appendChild(link);
    makerSection.appendChild(makerCredits);
    
    creditsContainer.appendChild(makerSection);
  }

  container.appendChild(creditsContainer);
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