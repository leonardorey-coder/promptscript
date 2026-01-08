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
  let parenDepth = 0;

  for (let li = 0; li < lines.length; li++) {
    const raw = lines[li] ?? "";
    let line = parenDepth === 0 ? raw.replace(/#.*$/, "") : raw;

    if (parenDepth === 0 && line.trim().length === 0) continue;

    let indent = 0;
    if (parenDepth === 0) {
      const m = line.match(/^ */);
      indent = m ? m[0].length : 0;
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
    }

    let i = parenDepth === 0 ? indent : 0;

    while (true) {
      if (i >= line.length) {
        if (parenDepth === 0) {
          toks.push({ t: "NEWLINE" });
        }
        break;
      }

      const c = line[i];
      if (!c) break;

      if (c === " " || c === "\t") {
        i++;
        continue;
      }

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

      if ("(){}[],:=+.".includes(c)) {
        toks.push({ t: "SYM", v: c });
        if ("([{".includes(c)) parenDepth++;
        if (")]}".includes(c)) parenDepth = Math.max(0, parenDepth - 1);
        i++;
        continue;
      }

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

      if (c === "`") {
        let j = i + 1;
        let out = "";
        let curLine = line;
        let curLi = li;

        while (true) {
          if (j >= curLine.length) {
            out += "\n";
            curLi++;
            if (curLi >= lines.length) {
              throw new Error(`Unterminated string (line ${li + 1})`);
            }
            curLine = lines[curLi] ?? "";
            j = 0;
            continue;
          }

          const ch = curLine[j];
          if (ch === "`") {
            break;
          }

          if (ch === "\\") {
            const nx = curLine[j + 1];
            if (nx === "n") out += "\n";
            else if (nx === "`") out += "`";
            else if (nx === "\\") out += "\\";
            else out += nx ?? "";
            j += 2;
            continue;
          }

          out += ch ?? "";
          j++;
        }

        toks.push({ t: "STR", v: out });
        li = curLi;
        line = curLine;
        i = j + 1;
        continue;
      }

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
  }

  while (indents.length > 1) {
    indents.pop();
    toks.push({ t: "DEDENT" });
  }

  toks.push({ t: "EOF" });
  return toks;
}
