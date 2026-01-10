export type Program = { type: "Program"; body: Stmt[] };

export type Stmt =
  | { type: "Def"; name: string; params: string[]; body: Stmt[] }
  | { type: "Class"; name: string; body: Stmt[] }
  | { type: "If"; cond: Expr; then: Stmt[]; else: Stmt[] | null }
  | { type: "While"; cond: Expr; body: Stmt[] }
  | { type: "For"; var: string; iter: Expr; body: Stmt[] }
  | { type: "WithPolicy"; policy: Expr; body: Stmt[] }
  | { type: "Retry"; count: Expr; backoff?: Expr; body: Stmt[] }
  | { type: "Timeout"; duration: Expr; body: Stmt[] }
  | { type: "Guard"; expr: Expr }
  | { type: "Assign"; name: string; value: Expr }
  | { type: "SetAttr"; object: Expr; property: string; value: Expr }
  | { type: "SetItem"; object: Expr; index: Expr; value: Expr }
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
  | { type: "MethodCall"; object: Expr; args: Expr[] }
  | { type: "Unary"; op: "not"; expr: Expr }
  | { type: "Binary"; op: "+" | "==" | "!=" | ">" | "<" | ">=" | "<=" | "in" | "and" | "or"; left: Expr; right: Expr }
  | { type: "Member"; object: Expr; property: string }
  | { type: "Index"; object: Expr; index: Expr };
