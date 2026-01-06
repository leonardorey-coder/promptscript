export type Tok =
  | { t: "IDENT"; v: string }
  | { t: "NUM"; v: number }
  | { t: "STR"; v: string }
  | { t: "KW"; v: string }
  | { t: "SYM"; v: string }
  | { t: "NEWLINE" }
  | { t: "INDENT" }
  | { t: "DEDENT" }
  | { t: "EOF" };

const KEYWORDS = new Set([
  "def",
  "if",
  "else",
  "while",
  "return",
  "break",
  "true",
  "false",
  "null",
  "and",
  "or",
  "in",
  "not",
]);

function isAlpha(c: string): boolean {
  return /[A-Za-z_]/.test(c);
}

function isAlnum(c: string): boolean {
  return /[A-Za-z0-9_]/.test(c);
}

function isDigit(c: string): boolean {
  return /[0-9]/.test(c);
}

export function tokenize(src: string): Tok[] {
  const lines = src.replaceAll("\r\n", "\n").split("\n");
  const toks: Tok[] = [];
  const indents: number[] = [0];

  for (let li = 0; li < lines.length; li++) {
    const raw = lines[li];
    if (raw === undefined) continue;

    // strip comments (# ...)
    const line = raw.replace(/#.*$/, "");

    // skip completely empty lines
    if (line.trim().length === 0) continue;

    // indentation: only spaces, tabs forbidden
    const m = line.match(/^ */);
    const indent = m ? m[0].length : 0;
    if (/\t/.test(line)) throw new Error(`Tabs not allowed (line ${li + 1})`);

    const top = indents[indents.length - 1] ?? 0;
    if (indent > top) {
      indents.push(indent);
      toks.push({ t: "INDENT" });
    } else if (indent < top) {
      while (indents.length > 1 && indent < (indents[indents.length - 1] ?? 0)) {
        indents.pop();
        toks.push({ t: "DEDENT" });
      }
      if (indent !== (indents[indents.length - 1] ?? 0)) {
        throw new Error(`Indentation error (line ${li + 1})`);
      }
    }

    // tokenize rest
    let i = indent;
    while (i < line.length) {
      const c = line[i];
      if (c === undefined) break;

      if (c === " " || c === "\t") {
        i++;
        continue;
      }

      // symbols (multi-char first)
      const two = line.slice(i, i + 2);
      if (two === "==") {
        toks.push({ t: "SYM", v: "==" });
        i += 2;
        continue;
      }
      if (two === "!=") {
        toks.push({ t: "SYM", v: "!=" });
        i += 2;
        continue;
      }

      // Single char symbols (including . for property access)
      if ("(){}[],:=+.".includes(c)) {
        toks.push({ t: "SYM", v: c });
        i++;
        continue;
      }

      // string
      if (c === '"') {
        let j = i + 1;
        let out = "";
        while (j < line.length) {
          const ch = line[j];
          if (ch === undefined) break;
          if (ch === '"') break;
          if (ch === "\\") {
            const nx = line[j + 1];
            if (nx === "n") out += "\n";
            else if (nx === '"') out += '"';
            else if (nx === "\\") out += "\\";
            else out += nx ?? "";
            j += 2;
            continue;
          }
          out += ch;
          j++;
        }
        if (j >= line.length || line[j] !== '"') {
          throw new Error(`Unterminated string (line ${li + 1})`);
        }
        toks.push({ t: "STR", v: out });
        i = j + 1;
        continue;
      }

      // number
      if (isDigit(c)) {
        let j = i;
        while (j < line.length) {
          const digit = line[j];
          if (digit === undefined || !isDigit(digit)) break;
          j++;
        }
        toks.push({ t: "NUM", v: parseInt(line.slice(i, j), 10) });
        i = j;
        continue;
      }

      // ident/keyword
      if (isAlpha(c)) {
        let j = i;
        while (j < line.length) {
          const ch = line[j];
          if (ch === undefined || !isAlnum(ch)) break;
          j++;
        }
        const word = line.slice(i, j);
        if (KEYWORDS.has(word)) toks.push({ t: "KW", v: word });
        else toks.push({ t: "IDENT", v: word });
        i = j;
        continue;
      }

      throw new Error(`Unexpected char '${c}' (line ${li + 1})`);
    }

    toks.push({ t: "NEWLINE" });
  }

  // close indentation
  while (indents.length > 1) {
    indents.pop();
    toks.push({ t: "DEDENT" });
  }

  toks.push({ t: "EOF" });
  return toks;
}
