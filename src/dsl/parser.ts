import type { Program, Stmt, Expr } from "./ast";
import type { Tok } from "./tokenizer";

export function parse(toks: Tok[]): Program {
  let i = 0;

  const peek = (): Tok => {
    const tok = toks[i];
    if (!tok) throw new Error("Unexpected end of input");
    return tok;
  };

  const at = (t: Tok["t"], v?: string): boolean => {
    const p = toks[i];
    if (!p || p.t !== t) return false;
    if (v !== undefined) {
      if (!("v" in p)) return false;
      if (p.v !== v) return false;
    }
    return true;
  };

  const eat = (t: Tok["t"], v?: string): Tok => {
    const p = peek();
    if (!at(t, v)) {
      const got = "v" in p ? `${p.t}(${p.v})` : p.t;
      throw new Error(`Parse error: expected ${t}${v ? `(${v})` : ""} got ${got}`);
    }
    i++;
    return p;
  };

  const skipNewlines = (): void => {
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
    if (p.t === "KW" && "v" in p && p.v === "def") return parseDef();
    if (p.t === "KW" && "v" in p && p.v === "class") return parseClass();
    if (p.t === "KW" && "v" in p && p.v === "if") return parseIf();
    if (p.t === "KW" && "v" in p && p.v === "while") return parseWhile();
    if (p.t === "KW" && "v" in p && p.v === "for") return parseFor();
    if (p.t === "KW" && "v" in p && p.v === "with") return parseWith();
    if (p.t === "KW" && "v" in p && p.v === "retry") return parseRetry();
    if (p.t === "KW" && "v" in p && p.v === "timeout") return parseTimeout();
    if (p.t === "KW" && "v" in p && p.v === "guard") return parseGuard();
    if (p.t === "KW" && "v" in p && p.v === "return") return parseReturn();
    if (p.t === "KW" && "v" in p && p.v === "break") {
      eat("KW", "break");
      return { type: "Break" };
    }

    // assignment? Check if we have IDENT (or postfix like IDENT.prop or IDENT[idx]) followed by '='
    // We need to lookahead to detect assignment vs expression
    const savedPos = i;
    let isAssignment = false;
    
    // Try to detect assignment pattern
    if (p.t === "IDENT") {
      let j = i + 1;
      // Skip through postfix operators (. and [])
      while (j < toks.length) {
        const t = toks[j];
        if (!t) break;
        if (t.t === "SYM" && "v" in t && t.v === ".") {
          j++; // skip .
          if (j < toks.length && toks[j]?.t === "IDENT") {
            j++; // skip property name
          }
        } else if (t.t === "SYM" && "v" in t && t.v === "[") {
          // Skip until matching ]
          let depth = 1;
          j++;
          while (j < toks.length && depth > 0) {
            const inner = toks[j];
            if (inner?.t === "SYM" && "v" in inner) {
              if (inner.v === "[") depth++;
              else if (inner.v === "]") depth--;
            }
            j++;
          }
        } else {
          break;
        }
      }
      // Check if next token is =
      const nextTok = toks[j];
      if (nextTok && nextTok.t === "SYM" && "v" in nextTok && nextTok.v === "=") {
        isAssignment = true;
      }
    }

    if (isAssignment) {
      // Parse the left-hand side (can be Var, Member, or Index)
      const target = parsePostfix();
      eat("SYM", "=");
      const value = parseExpr();
      
      // Convert to appropriate assignment type
      if (target.type === "Var") {
        return { type: "Assign", name: target.name, value };
      } else if (target.type === "Member") {
        return { type: "SetAttr", object: target.object, property: target.property, value };
      } else if (target.type === "Index") {
        return { type: "SetItem", object: target.object, index: target.index, value };
      } else {
        throw new Error(`Parse error: invalid assignment target`);
      }
    }

    // expression statement
    const expr = parseExpr();
    return { type: "ExprStmt", expr };
  };

  const parseBlock = (): Stmt[] => {
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
    const nameTok = eat("IDENT");
    const name = "v" in nameTok ? String(nameTok.v) : "";
    eat("SYM", "(");
    const params: string[] = [];
    if (!at("SYM", ")")) {
      const pt = eat("IDENT");
      params.push("v" in pt ? String(pt.v) : "");
      while (at("SYM", ",")) {
        eat("SYM", ",");
        const pt2 = eat("IDENT");
        params.push("v" in pt2 ? String(pt2.v) : "");
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
    if (at("NEWLINE") || at("DEDENT") || at("EOF")) return { type: "Return", value: null };
    const value = parseExpr();
    return { type: "Return", value };
  };

  const parseClass = (): Stmt => {
    eat("KW", "class");
    const nameTok = eat("IDENT");
    const name = "v" in nameTok ? String(nameTok.v) : "";
    eat("SYM", ":");
    const body = parseBlock();
    return { type: "Class", name, body };
  };

  const parseFor = (): Stmt => {
    eat("KW", "for");
    const varTok = eat("IDENT");
    const varName = "v" in varTok ? String(varTok.v) : "";
    eat("KW", "in");
    const iter = parseExpr();
    eat("SYM", ":");
    const body = parseBlock();
    return { type: "For", var: varName, iter, body };
  };

  const parseWith = (): Stmt => {
    eat("KW", "with");
    eat("KW", "policy");
    const policy = parseExpr();
    eat("SYM", ":");
    const body = parseBlock();
    return { type: "WithPolicy", policy, body };
  };

  const parseRetry = (): Stmt => {
    eat("KW", "retry");
    const count = parseExpr();
    let backoff: Expr | undefined;
    if (at("KW", "backoff")) {
      eat("KW", "backoff");
      backoff = parseExpr();
    }
    eat("SYM", ":");
    const body = parseBlock();
    return { type: "Retry", count, backoff, body };
  };

  const parseTimeout = (): Stmt => {
    eat("KW", "timeout");
    const duration = parseExpr();
    eat("SYM", ":");
    const body = parseBlock();
    return { type: "Timeout", duration, body };
  };

  const parseGuard = (): Stmt => {
    eat("KW", "guard");
    const expr = parseExpr();
    return { type: "Guard", expr };
  };

  // -------- Expressions (precedence) --------
  const parseExpr = (): Expr => parseOr();

  const parseOr = (): Expr => {
    let left = parseNot();
    while (at("KW", "or")) {
      eat("KW", "or");
      const right = parseNot();
      left = { type: "Binary", op: "or", left, right };
    }
    return left;
  };

  const parseNot = (): Expr => {
    if (at("KW", "not")) {
      eat("KW", "not");
      const expr = parseNot(); // recursive for not not x
      return { type: "Unary", op: "not", expr };
    }
    return parseAnd();
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
    while (at("SYM", "==") || at("SYM", "!=") || at("SYM", ">") || at("SYM", "<") || at("SYM", ">=") || at("SYM", "<=") || at("KW", "in")) {
      if (at("SYM", "==")) {
        eat("SYM", "==");
        const right = parseAdd();
        left = { type: "Binary", op: "==", left, right };
      } else if (at("SYM", "!=")) {
        eat("SYM", "!=");
        const right = parseAdd();
        left = { type: "Binary", op: "!=", left, right };
      } else if (at("SYM", ">")) {
        eat("SYM", ">");
        const right = parseAdd();
        left = { type: "Binary", op: ">", left, right };
      } else if (at("SYM", "<")) {
        eat("SYM", "<");
        const right = parseAdd();
        left = { type: "Binary", op: "<", left, right };
      } else if (at("SYM", ">=")) {
        eat("SYM", ">=");
        const right = parseAdd();
        left = { type: "Binary", op: ">=", left, right };
      } else if (at("SYM", "<=")) {
        eat("SYM", "<=");
        const right = parseAdd();
        left = { type: "Binary", op: "<=", left, right };
      } else {
        eat("KW", "in");
        const right = parseAdd();
        left = { type: "Binary", op: "in", left, right };
      }
    }
    return left;
  };

  const parseAdd = (): Expr => {
    let left = parsePostfix();
    while (at("SYM", "+")) {
      eat("SYM", "+");
      const right = parsePostfix();
      left = { type: "Binary", op: "+", left, right };
    }
    return left;
  };

  // Parse postfix operators: ., [], and ()
  const parsePostfix = (): Expr => {
    let expr = parsePrimary();

    while (true) {
      if (at("SYM", ".")) {
        eat("SYM", ".");
        const propTok = eat("IDENT");
        const property = "v" in propTok ? String(propTok.v) : "";
        expr = { type: "Member", object: expr, property };
      } else if (at("SYM", "[")) {
        eat("SYM", "[");
        const index = parseExpr();
        eat("SYM", "]");
        expr = { type: "Index", object: expr, index };
      } else if (at("SYM", "(")) {
        // Method call: expr(...args)
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
        expr = { type: "MethodCall", object: expr, args };
      } else {
        break;
      }
    }

    return expr;
  };

  const parsePrimary = (): Expr => {
    const p = peek();

    if (p.t === "NUM" && "v" in p) {
      eat("NUM");
      return { type: "Num", value: p.v as number };
    }
    if (p.t === "STR" && "v" in p) {
      eat("STR");
      return { type: "Str", value: p.v as string };
    }
    if (p.t === "KW" && "v" in p && p.v === "true") {
      eat("KW", "true");
      return { type: "Bool", value: true };
    }
    if (p.t === "KW" && "v" in p && p.v === "false") {
      eat("KW", "false");
      return { type: "Bool", value: false };
    }
    if (p.t === "KW" && "v" in p && p.v === "null") {
      eat("KW", "null");
      return { type: "Null" };
    }

    // object
    if (at("SYM", "{")) {
      eat("SYM", "{");
      const pairs: { key: string; value: Expr }[] = [];

      const parseObjKey = (): string => {
        if (at("STR")) {
          const kt = eat("STR");
          return "v" in kt ? String(kt.v) : "";
        }
        if (at("IDENT")) {
          const kt = eat("IDENT");
          return "v" in kt ? String(kt.v) : "";
        }
        const got = "v" in peek() ? `${peek().t}(${(peek() as any).v})` : peek().t;
        throw new Error(`Parse error: expected object key, got ${got}`);
      };

      if (!at("SYM", "}")) {
        const k = parseObjKey();
        eat("SYM", ":");
        const v = parseExpr();
        pairs.push({ key: k, value: v });
        while (at("SYM", ",")) {
          eat("SYM", ",");
          if (at("SYM", "}")) break;
          const k2 = parseObjKey();
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
    if (p.t === "IDENT" && "v" in p) {
      const nameTok = eat("IDENT");
      const name = "v" in nameTok ? String(nameTok.v) : "";
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

    const got = "v" in p ? `${p.t}(${p.v})` : p.t;
    throw new Error(`Parse error: unexpected token ${got}`);
  };

  return parseProgram();
}
