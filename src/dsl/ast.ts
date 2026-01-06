export type Program = { type: "Program"; body: Stmt[] };

export type Stmt =
  | { type: "Def"; name: string; params: string[]; body: Stmt[] }
  | { type: "If"; cond: Expr; then: Stmt[]; else: Stmt[] | null }
  | { type: "While"; cond: Expr; body: Stmt[] }
  | { type: "Assign"; name: string; value: Expr }
  | { type: "Return"; value: Expr | null }
  | { type: "Break" }
  | { type: "ExprStmt"; expr: Expr };

export type Expr =
  | { type: "Num"; value: number }
  | { type: "Str"; value: string }
  | { type: "Bool"; value: boolean }
  | { type: "Null" }
  | { type: "Var"; name: string }
  | { type: "Obj"; pairs: { key: string; value: Expr }[] }
  | { type: "Arr"; items: Expr[] }
  | { type: "Call"; name: string; args: Expr[] }
  | { type: "Binary"; op: "+" | "==" | "!=" | "in" | "and" | "or"; left: Expr; right: Expr }
  | { type: "Member"; object: Expr; property: string }
  | { type: "Index"; object: Expr; index: Expr };
