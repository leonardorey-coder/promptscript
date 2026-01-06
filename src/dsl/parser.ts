import type { Program, Stmt, Expr } from "./ast";
import type { Tok } from "./tokenizer";

export function parse(toks: Tok[]): Program {
  let i = 0;
  const peek = () => toks[i];
  const at = (t: Tok["t"], v?: string) => {
    const p = peek();
    if (p.t !== t) return false;
    // @ts-expect-error narrow
    if (v !== undefined && p.v !== v) return false;
    return true;
  };
  const eat = (t: Tok["t"], v?: string) => {
    const p = peek();
    if (!at(t, v)) {
      throw new Error(
        `Parse error: expected ${t}${v ? `(${v})` : ""} got ${p.t}${"v" in p ? `(${(p as any).v})` : ""}`,
      );
    }
    i++;
    return p as any;
  };
  const skipNewlines = () => {
    while (at("NEWLINE")) i++;
  };

  const parseProgram = (): Program => {
    const body: Stmt[] = [];
    skipNewlines();
    while (!at("EOF")) {
      body.push(parseStmt());
      skipNewlines();
    }
    eat("EOF");
    return { type: "Program", body };
  };

  const parseStmt = (): Stmt => {
    const p = peek();
    if (p.t === "KW" && p.v === "def") return parseDef();
    if (p.t === "KW" && p.v === "if") return parseIf();
    if (p.t === "KW" && p.v === "while") return parseWhile();
    if (p.t === "KW" && p.v === "return") return parseReturn();
    if (p.t === "KW" && p.v === "break") {
      eat("KW", "break");
      return { type: "Break" };
    }

    // assignment? IDENT '=' ...
    if (p.t === "IDENT" && toks[i + 1]?.t === "SYM" && (toks[i + 1] as any).v === "=") {
      const name = eat("IDENT").v as string;
      eat("SYM", "=");
      const value = parseExpr();
      return { type: "Assign", name, value };
    }

    // expression statement
    const expr = parseExpr();
    return { type: "ExprStmt", expr };
  };

  const parseBlock = (): Stmt[] => {
    // Expect NEWLINE INDENT ... DEDENT
    eat("NEWLINE");
    eat("INDENT");
    const body: Stmt[] = [];
    skipNewlines();
    while (!at("DEDENT")) {
      body.push(parseStmt());
      skipNewlines();
    }
    eat("DEDENT");
    return body;
  };

  const parseDef = (): Stmt => {
    eat("KW", "def");
    const name = eat("IDENT").v as string;
    eat("SYM", "(");
    const params: string[] = [];
    if (!at("SYM", ")")) {
      params.push(eat("IDENT").v as string);
      while (at("SYM", ",")) {
        eat("SYM", ",");
        params.push(eat("IDENT").v as string);
      }
    }
    eat("SYM", ")");
    eat("SYM", ":");
    const body = parseBlock();
    return { type: "Def", name, params, body };
  };

  const parseIf = (): Stmt => {
    eat("KW", "if");
    const cond = parseExpr();
    eat("SYM", ":");
    const thenB = parseBlock();
    let elseB: Stmt[] | null = null;
    if (at("KW", "else")) {
      eat("KW", "else");
      eat("SYM", ":");
      elseB = parseBlock();
    }
    return { type: "If", cond, then: thenB, else: elseB };
  };

  const parseWhile = (): Stmt => {
    eat("KW", "while");
    const cond = parseExpr();
    eat("SYM", ":");
    const body = parseBlock();
    return { type: "While", cond, body };
  };

  const parseReturn = (): Stmt => {
    eat("KW", "return");
    // return can be empty (end of line)
    if (at("NEWLINE") || at("DEDENT") || at("EOF")) return { type: "Return", value: null };
    const value = parseExpr();
    return { type: "Return", value };
  };

  // -------- Expressions (precedence) --------
  const parseExpr = () => parseOr();

  const parseOr = (): Expr => {
    let left = parseAnd();
    while (at("KW", "or")) {
      eat("KW", "or");
      const right = parseAnd();
      left = { type: "Binary", op: "or", left, right };
    }
    return left;
  };

  const parseAnd = (): Expr => {
    let left = parseCmp();
    while (at("KW", "and")) {
      eat("KW", "and");
      const right = parseCmp();
      left = { type: "Binary", op: "and", left, right };
    }
    return left;
  };

  const parseCmp = (): Expr => {
    let left = parseAdd();
    while ((at("SYM", "==") || at("SYM", "!=")) || at("KW", "in")) {
      if (at("SYM", "==")) {
        eat("SYM", "==");
        const right = parseAdd();
        left = { type: "Binary", op: "==", left, right };
      } else if (at("SYM", "!=")) {
        eat("SYM", "!=");
        const right = parseAdd();
        left = { type: "Binary", op: "!=", left, right };
      } else {
        eat("KW", "in");
        const right = parseAdd();
        left = { type: "Binary", op: "in", left, right };
      }
    }
    return left;
  };

  const parseAdd = (): Expr => {
    let left = parsePrimary();
    while (at("SYM", "+")) {
      eat("SYM", "+");
      const right = parsePrimary();
      left = { type: "Binary", op: "+", left, right };
    }
    return left;
  };

  const parsePrimary = (): Expr => {
    const p = peek();

    if (p.t === "NUM") {
      eat("NUM");
      return { type: "Num", value: p.v as number };
    }
    if (p.t === "STR") {
      eat("STR");
      return { type: "Str", value: p.v as string };
    }
    if (p.t === "KW" && p.v === "true") {
      eat("KW", "true");
      return { type: "Bool", value: true };
    }
    if (p.t === "KW" && p.v === "false") {
      eat("KW", "false");
      return { type: "Bool", value: false };
    }
    if (p.t === "KW" && p.v === "null") {
      eat("KW", "null");
      return { type: "Null" };
    }

    // object
    if (at("SYM", "{")) {
      eat("SYM", "{");
      const pairs: { key: string; value: Expr }[] = [];
      if (!at("SYM", "}")) {
        const k = eat("STR").v as string;
        eat("SYM", ":");
        const v = parseExpr();
        pairs.push({ key: k, value: v });
        while (at("SYM", ",")) {
          eat("SYM", ",");
          const k2 = eat("STR").v as string;
          eat("SYM", ":");
          const v2 = parseExpr();
          pairs.push({ key: k2, value: v2 });
        }
      }
      eat("SYM", "}");
      return { type: "Obj", pairs };
    }

    // array
    if (at("SYM", "[")) {
      eat("SYM", "[");
      const items: Expr[] = [];
      if (!at("SYM", "]")) {
        items.push(parseExpr());
        while (at("SYM", ",")) {
          eat("SYM", ",");
          items.push(parseExpr());
        }
      }
      eat("SYM", "]");
      return { type: "Arr", items };
    }

    // parens
    if (at("SYM", "(")) {
      eat("SYM", "(");
      const e = parseExpr();
      eat("SYM", ")");
      return e;
    }

    // call or var
    if (p.t === "IDENT") {
      const name = eat("IDENT").v as string;
      if (at("SYM", "(")) {
        eat("SYM", "(");
        const args: Expr[] = [];
        if (!at("SYM", ")")) {
          args.push(parseExpr());
          while (at("SYM", ",")) {
            eat("SYM", ",");
            args.push(parseExpr());
          }
        }
        eat("SYM", ")");
        return { type: "Call", name, args };
      }
      return { type: "Var", name };
    }

    throw new Error(`Parse error: unexpected token ${p.t}${"v" in p ? `(${(p as any).v})` : ""}`);
  };

  return parseProgram();
}
