# Core DSL

The core helpers define documents, parts, and scalar expressions.

## Core: Document and Parts

- `context(overrides?) -> BuildContext`
- `document(id, parts, context?, assemblies?, opts?) -> IntentDocument`
- `part(id, features, opts?) -> IntentPart`

Examples:
- [Basic part and build](./examples/basic)

## Core: Parameters and Expressions

- `paramLength(id, value) -> ParamDef`
- `paramAngle(id, value) -> ParamDef`
- `paramCount(id, value) -> ParamDef`
- `exprLiteral(value, unit?) -> Expr`
- `exprParam(id) -> Expr`
- `exprAdd(left, right) -> Expr`
- `exprSub(left, right) -> Expr`
- `exprMul(left, right) -> Expr`
- `exprDiv(left, right) -> Expr`
- `exprNeg(value) -> Expr`
