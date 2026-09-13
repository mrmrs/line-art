// A bounded arithmetic parser. There is no JavaScript execution, property
// lookup, assignment, allocation, recursion, or user-defined function call.
type Scope = Record<string, number>;
type Eval = (scope: Scope) => number;
const functions: Record<string, (...values: number[]) => number> = {
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  asin: Math.asin,
  acos: Math.acos,
  atan: Math.atan,
  atan2: Math.atan2,
  sqrt: Math.sqrt,
  cbrt: Math.cbrt,
  abs: Math.abs,
  floor: Math.floor,
  ceil: Math.ceil,
  round: Math.round,
  min: Math.min,
  max: Math.max,
  pow: Math.pow,
  exp: Math.exp,
  log: Math.log,
  log2: Math.log2,
  log10: Math.log10,
  sign: Math.sign,
  hypot: Math.hypot,
};
const constants: Scope = { PI: Math.PI, E: Math.E, true: 1, false: 0 };
const precedence: Record<string, number> = {
  '||': 1,
  '&&': 2,
  '==': 3,
  '===': 3,
  '!=': 3,
  '!==': 3,
  '<': 4,
  '>': 4,
  '<=': 4,
  '>=': 4,
  '+': 5,
  '-': 5,
  '*': 6,
  '/': 6,
  '%': 6,
  '**': 7,
};
const binary: Record<string, (a: number, b: number) => number> = {
  '+': (a, b) => a + b,
  '-': (a, b) => a - b,
  '*': (a, b) => a * b,
  '/': (a, b) => a / b,
  '%': (a, b) => a % b,
  '**': (a, b) => a ** b,
  '<': (a, b) => +(a < b),
  '>': (a, b) => +(a > b),
  '<=': (a, b) => +(a <= b),
  '>=': (a, b) => +(a >= b),
  '==': (a, b) => +(a === b),
  '===': (a, b) => +(a === b),
  '!=': (a, b) => +(a !== b),
  '!==': (a, b) => +(a !== b),
};
export function compileExpression(source: string, variables: string[]): Eval {
  if (source.length > 2048)
    throw new Error('Expression exceeds 2048 characters');
  const tokens: string[] = [];
  let offset = 0;
  while (offset < source.length) {
    if (/\s/.test(source[offset])) {
      offset++;
      continue;
    }
    const match =
      /^(?:(?:\d*\.\d+|\d+\.?\d*)(?:[eE][+-]?\d+)?|(?:Math\.)?[A-Za-z_][A-Za-z_0-9]*|===|!==|\*\*|<=|>=|==|!=|&&|\|\||[+\-*/%<>()!,?:])/.exec(
        source.slice(offset),
      );
    if (!match)
      throw new Error(`Expression character not allowed at ${offset + 1}`);
    tokens.push(match[0]);
    offset += match[0].length;
    if (tokens.length > 256) throw new Error('Expression exceeds 256 tokens');
  }
  let index = 0,
    depth = 0;
  const take = (t: string) => {
    if (tokens[index++] !== t) throw new Error(`Expression expected ${t}`);
  };
  function parse(min = 0): Eval {
    if (++depth > 32) throw new Error('Expression nesting exceeds 32');
    const token = tokens[index++];
    let left: Eval;
    if (token === '(') {
      left = parse();
      take(')');
    } else if (['+', '-', '!'].includes(token)) {
      const value = parse(7);
      left =
        token === '-'
          ? (s) => -value(s)
          : token === '!'
            ? (s) => +!value(s)
            : value;
    } else if (token && /^\d|^\./.test(token)) {
      const value = Number(token);
      if (!Number.isFinite(value))
        throw new Error('Expression number must be finite');
      left = () => value;
    } else {
      const name = token?.replace(/^Math\./, '');
      if (name && Object.hasOwn(functions, name) && tokens[index] === '(') {
        index++;
        const args: Eval[] = [];
        if (tokens[index] !== ')') {
          do {
            args.push(parse());
            if (tokens[index] !== ',') break;
            index++;
          } while (args.length < 16);
        }
        take(')');
        left = (s) => functions[name](...args.map((arg) => arg(s)));
      } else if (name && Object.hasOwn(constants, name))
        left = () => constants[name];
      else if (token && variables.includes(token)) left = (s) => s[token];
      else throw new Error(`Unknown expression name: ${token ?? '(empty)'}`);
    }
    while (index < tokens.length) {
      const op = tokens[index];
      if (!Object.hasOwn(precedence, op) || precedence[op] < min) break;
      index++;
      const a = left,
        b = parse(precedence[op] + (op === '**' ? 0 : 1));
      left =
        op === '&&'
          ? (s) => a(s) && b(s)
          : op === '||'
            ? (s) => a(s) || b(s)
            : (s) => binary[op](a(s), b(s));
    }
    if (min === 0 && tokens[index] === '?') {
      index++;
      const condition = left,
        yes = parse();
      take(':');
      const no = parse();
      left = (s) => (condition(s) ? yes(s) : no(s));
    }
    depth--;
    return left;
  }
  const result = parse();
  if (index !== tokens.length)
    throw new Error(`Unexpected expression token: ${tokens[index]}`);
  return (scope) => {
    const value = result(scope);
    if (!Number.isFinite(value))
      throw new Error('Expression result is not finite');
    return value;
  };
}
