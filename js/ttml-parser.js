/**
 * Spicy Lyrics Web — TTML Parser
 * Exact port of ParseTTML.ts
 * Parses Apple Music-style TTML files into structured lyrics data.
 */

const WRITER_KEY_MATCH = /(songwriter|writers?|written[\s_-]*by|lyricist|composer)/i;
const LEADING_BG_BRACKET = /^[([{]\s*/;
const TRAILING_BG_BRACKET = /\s*[)\]}]$/;

function getAttr(element, ...names) {
  if (!element) return null;
  for (const name of names) {
    const direct = element.getAttribute(name);
    if (direct !== null) return direct;
  }
  for (const attr of Array.from(element.attributes)) {
    if (names.includes(attr.name) || names.includes(attr.localName)) {
      return attr.value;
    }
  }
  return null;
}

function findElements(root, ...tagNames) {
  const normalized = tagNames.map(n => n.toLowerCase());
  return Array.from(root.querySelectorAll("*")).filter(el => {
    const tag = el.tagName.toLowerCase();
    const local = el.localName.toLowerCase();
    return normalized.includes(tag) || normalized.includes(local);
  });
}

function parseTimestamp(value) {
  if (!value) return null;
  const time = value.trim();
  if (!time) return null;

  const hmsMatch = time.match(/^(?:(\d{2,3}):)?(\d{1,2}):(\d{1,2})(?:[.:](\d+))?$/);
  if (hmsMatch) {
    const hours = parseInt(hmsMatch[1] ?? "0", 10);
    const minutes = parseInt(hmsMatch[2], 10);
    const seconds = parseInt(hmsMatch[3], 10);
    const fraction = hmsMatch[4] ? parseFloat(`0.${hmsMatch[4]}`) : 0;
    const parsedTime = (hours * 60 + minutes) * 60 + seconds + fraction;
    return Math.max(0, parsedTime - 0.2);
  }

  const secondsMatch = time.match(/^(\d+(?:\.\d+)?)(s)?$/);
  if (secondsMatch) return Math.max(0, parseFloat(secondsMatch[1]) - 0.2);

  const msMatch = time.match(/^(\d+(?:\.\d+)?)ms$/);
  if (msMatch) return Math.max(0, (parseFloat(msMatch[1]) / 1000) - 0.2);

  return null;
}

function getNodeText(node) {
  return node.textContent ?? "";
}

function isSkippableWhitespace(node) {
  if (node.nodeType !== Node.TEXT_NODE) return false;
  const text = node.textContent ?? "";
  if (text.trim()) return false;
  return /[\r\n\t]/.test(text);
}

function getNextMeaningfulNode(nodes, index) {
  for (let i = index + 1; i < nodes.length; i++) {
    if (isSkippableWhitespace(nodes[i])) continue;
    return nodes[i];
  }
  return null;
}

function hasExplicitSpaceBeforeNextMeaningfulNode(nodes, index) {
  for (let i = index + 1; i < nodes.length; i++) {
    const node = nodes[i];
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent ?? "";
      if (/[ ]/.test(text)) return true;
      if (isSkippableWhitespace(node)) continue;
    }
    if (!isSkippableWhitespace(node)) return false;
  }
  return false;
}

function isPartOfWord(nodes, index) {
  const current = nodes[index];
  const next = getNextMeaningfulNode(nodes, index);
  if (!current || !next) return false;
  const currentText = getNodeText(current).trim();
  const nextText = getNodeText(next).trim();
  if (!currentText || !nextText) return false;
  if (hasExplicitSpaceBeforeNextMeaningfulNode(nodes, index)) return false;
  return true;
}

function readITunesMetadata(root) {
  const translations = new Map();
  const transliterations = new Map();
  const transliterationPieces = new Map();

  for (const node of findElements(root, "itunesmetadata")) {
    for (const text of findElements(node, "text")) {
      const key = getAttr(text, "for");
      if (!key) continue;
      const parent = text.parentElement?.tagName;
      const textValue = text.textContent?.trim() ?? "";

      if (parent === "translations" && textValue) {
        translations.set(key, textValue);
      }
      if (parent === "transliterations") {
        if (textValue) transliterations.set(key, textValue);
        const pieces = Array.from(text.children)
          .filter(c => c.tagName === "span")
          .map(c => c.textContent?.trim() ?? "")
          .filter(Boolean);
        if (pieces.length > 0) transliterationPieces.set(key, pieces);
      }
    }
  }
  return { translations, transliterations, transliterationPieces };
}

export function parseSongwriterString(text) {
  const writers = new Map();
  // Split by ;, or "and" (with surrounding spaces)
  const parts = text.split(/[,;]|\band\b/i).map(e => e.trim()).filter(Boolean);
  for (const part of parts) {
    const normalized = part.toLowerCase();
    if (!writers.has(normalized)) writers.set(normalized, part);
  }
  return Array.from(writers.values());
}

function parseSongwriters(root) {
  const writers = new Map();
  const addWriterParts = (text) => {
    parseSongwriterString(text).forEach(w => {
      const normalized = w.toLowerCase();
      if (!writers.has(normalized)) writers.set(normalized, w);
    });
  };

  for (const meta of findElements(root, "amll:meta", "meta")) {
    const key = getAttr(meta, "key", "name", "property", "type") ?? meta.parentElement?.tagName ?? "";
    const rawValue = getAttr(meta, "value", "content") ?? meta.textContent?.trim() ?? "";
    if (!key || !rawValue || !WRITER_KEY_MATCH.test(key)) continue;
    addWriterParts(rawValue);
  }

  for (const node of findElements(root, "songwriter", "songwriters", "writer", "writers", "composer", "lyricist")) {
    if (node.children.length > 0) continue;
    const text = node.textContent?.trim() ?? "";
    if (!text) continue;
    addWriterParts(text);
  }
  return Array.from(writers.values());
}

function parseAgents(root) {
  const agents = new Map();
  for (const agent of findElements(root, "ttm:agent", "agent")) {
    const id = getAttr(agent, "xml:id", "id");
    if (!id) continue;
    agents.set(id, id === "v2" || id === "v2000");
  }
  return agents;
}

function collectPlainText(nodes) {
  return nodes.map(n => getNodeText(n)).join("").replace(/\s+/g, " ").trim();
}

function buildTextFromSyllables(syllables) {
  let text = "";
  syllables.forEach((s, i) => {
    text += s.Text;
    if (i < syllables.length - 1 && !s.IsPartOfWord) text += " ";
  });
  return text.trim();
}

function applyRomanizedPieces(syllables, pieces) {
  if (!pieces || pieces.length === 0 || syllables.length === 0) return;
  const finalPieces = [...pieces];
  if (finalPieces.length > syllables.length) {
    const overflow = finalPieces.splice(syllables.length - 1).join(" ");
    finalPieces.push(overflow);
  }
  syllables.forEach((s, i) => {
    if (i < finalPieces.length && finalPieces[i]) s.RomanizedText = finalPieces[i];
  });
}

function parseSyllableNodes(nodes, lineStart, lineEnd) {
  const syllables = [];
  nodes.forEach((node, index) => {
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    if (node.tagName !== "span") return;
    const text = node.textContent ?? "";
    if (!text.trim()) return;
    const role = getAttr(node, "ttm:role", "role");
    if (role === "x-translation" || role === "x-roman") return;

    const startTime = parseTimestamp(getAttr(node, "begin")) ?? lineStart;
    const endTime = parseTimestamp(getAttr(node, "end")) ?? lineEnd;
    syllables.push({
      Text: text.trim(),
      StartTime: startTime,
      EndTime: endTime,
      IsPartOfWord: isPartOfWord(nodes, index),
    });
  });
  return syllables;
}

function parseBackground(element, lineStart, lineEnd) {
  const childNodes = Array.from(element.childNodes).filter(n => !isSkippableWhitespace(n));
  const syllables = parseSyllableNodes(childNodes, lineStart, lineEnd);
  if (syllables.length === 0) return null;

  syllables[0].Text = syllables[0].Text.replace(LEADING_BG_BRACKET, "");
  const last = syllables[syllables.length - 1];
  last.Text = last.Text.replace(TRAILING_BG_BRACKET, "");

  return {
    StartTime: syllables[0].StartTime,
    EndTime: syllables[syllables.length - 1].EndTime,
    Syllables: syllables,
  };
}

function parseParagraph(paragraph, div, body, oppositeAgents, transliterations, transliterationPieces) {
  const paragraphStart = parseTimestamp(getAttr(paragraph, "begin")) ?? 0;
  const paragraphEnd = parseTimestamp(getAttr(paragraph, "end")) ?? paragraphStart;
  const agentId = getAttr(paragraph, "ttm:agent", "agent") ??
    getAttr(div, "ttm:agent", "agent") ??
    getAttr(body, "ttm:agent", "agent");
  const oppositeAligned = agentId ? oppositeAgents.get(agentId) === true : false;
  const lineKey = getAttr(paragraph, "itunes:key");

  let leadRomanizedText = lineKey ? transliterations.get(lineKey) : undefined;

  const childNodes = Array.from(paragraph.childNodes).filter(n => !isSkippableWhitespace(n));
  const leadSyllables = [];
  const plainNodes = [];
  const background = [];

  childNodes.forEach((node, index) => {
    if (node.nodeType === Node.TEXT_NODE) {
      if ((node.textContent ?? "").trim()) plainNodes.push(node);
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    if (node.tagName !== "span") { plainNodes.push(node); return; }

    const role = getAttr(node, "ttm:role", "role");
    const text = node.textContent?.trim() ?? "";

    if (role === "x-translation") return;
    if (role === "x-roman") {
      if (!leadRomanizedText && text) leadRomanizedText = text;
      return;
    }
    if (role === "x-bg") {
      const bg = parseBackground(node, paragraphStart, paragraphEnd);
      if (bg) background.push(bg);
      return;
    }

    const startTime = parseTimestamp(getAttr(node, "begin"));
    const endTime = parseTimestamp(getAttr(node, "end"));

    if (startTime !== null || endTime !== null) {
      leadSyllables.push({
        Text: text,
        StartTime: startTime ?? paragraphStart,
        EndTime: endTime ?? paragraphEnd,
        IsPartOfWord: isPartOfWord(childNodes, index),
      });
      return;
    }
    plainNodes.push(node);
  });

  applyRomanizedPieces(leadSyllables, lineKey ? transliterationPieces.get(lineKey) : undefined);

  const leadText = leadSyllables.length > 0
    ? buildTextFromSyllables(leadSyllables)
    : collectPlainText(plainNodes);
  if (!leadText && background.length === 0) return null;

  const timedEntries = leadSyllables.length > 0
    ? leadSyllables.map(s => ({ StartTime: s.StartTime, EndTime: s.EndTime }))
    : background.flatMap(g => g.Syllables.map(s => ({ StartTime: s.StartTime, EndTime: s.EndTime })));

  const lineStart = timedEntries.length > 0
    ? Math.min(...timedEntries.map(e => e.StartTime))
    : paragraphStart;
  const lineEnd = timedEntries.length > 0
    ? Math.max(...timedEntries.map(e => e.EndTime))
    : paragraphEnd;

  return {
    leadText,
    leadRomanizedText,
    leadSyllables,
    background,
    startTime: lineStart,
    endTime: lineEnd,
    oppositeAligned,
  };
}

function buildSyllableLyrics(lines, songwriters) {
  return {
    Type: "Syllable",
    ...(songwriters.length > 0 ? { SongWriters: songwriters } : {}),
    StartTime: lines[0]?.startTime ?? 0,
    Content: lines.map(line => {
      const leadSyllables = line.leadSyllables.length > 0
        ? line.leadSyllables
        : [{
          Text: line.leadText,
          ...(line.leadRomanizedText ? { RomanizedText: line.leadRomanizedText } : {}),
          StartTime: line.startTime,
          EndTime: line.endTime,
          IsPartOfWord: false,
        }];

      return {
        Type: "Vocal",
        OppositeAligned: line.oppositeAligned,
        Lead: {
          StartTime: line.startTime,
          EndTime: line.endTime,
          Syllables: leadSyllables,
        },
        ...(line.background.length > 0 ? { Background: line.background } : {}),
      };
    }),
  };
}

function buildLineLyrics(lines, songwriters) {
  return {
    Type: "Line",
    ...(songwriters.length > 0 ? { SongWriters: songwriters } : {}),
    StartTime: lines[0]?.startTime ?? 0,
    Content: lines.map(line => ({
      Type: "Vocal",
      Text: line.leadText,
      ...(line.leadRomanizedText ? { RomanizedText: line.leadRomanizedText } : {}),
      StartTime: line.startTime,
      EndTime: line.endTime,
      OppositeAligned: line.oppositeAligned,
    })).filter(line => line.Text),
  };
}

function buildStaticLyrics(lines, songwriters) {
  return {
    Type: "Static",
    ...(songwriters.length > 0 ? { SongWriters: songwriters } : {}),
    Lines: lines.map(line => ({
      Text: line.leadText,
      ...(line.leadRomanizedText ? { RomanizedText: line.leadRomanizedText } : {}),
    })).filter(line => line.Text),
  };
}

/**
 * Parse a TTML string into structured lyrics data.
 * @param {string} ttml - Raw TTML XML string
 * @returns {object} Parsed lyrics object with Type, Content, etc.
 */
export default function parseTTMLToLyrics(ttml) {
  const doc = new DOMParser().parseFromString(ttml, "text/xml");
  const parserError = doc.querySelector("parsererror");
  if (parserError) {
    throw new Error(parserError.textContent?.trim() || "Invalid TTML");
  }

  const tt = doc.documentElement;
  if (!tt || tt.tagName !== "tt") {
    throw new Error("Invalid TTML: missing <tt> root element");
  }

  const songwriters = parseSongwriters(tt);
  const oppositeAgents = parseAgents(tt);
  const { transliterations, transliterationPieces } = readITunesMetadata(tt);

  const body = Array.from(tt.children).find(c => c.tagName === "body");
  if (!body) throw new Error("Invalid TTML: missing <body>");

  const parsedLines = [];
  const divs = Array.from(body.children).filter(c => c.tagName === "div");
  const containers = divs.length > 0 ? divs : [body];

  for (const div of containers) {
    const paragraphs = Array.from(div.children).filter(c => c.tagName === "p");
    for (const paragraph of paragraphs) {
      const parsed = parseParagraph(
        paragraph,
        div === body ? null : div,
        body,
        oppositeAgents,
        transliterations,
        transliterationPieces
      );
      if (parsed) parsedLines.push(parsed);
    }
  }

  if (parsedLines.length === 0) {
    throw new Error("No lyric lines found in TTML");
  }

  const hasSyllableTimings = parsedLines.some(l => l.leadSyllables.length > 0 || l.background.length > 0);
  const hasLineTimings = parsedLines.some(l => l.startTime > 0 || l.endTime > 0);

  if (hasSyllableTimings) return buildSyllableLyrics(parsedLines, songwriters);
  if (hasLineTimings) return buildLineLyrics(parsedLines, songwriters);
  return buildStaticLyrics(parsedLines, songwriters);
}
