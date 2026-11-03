import re
from typing import Any, List, Optional, Set, Tuple


# Common keywords, built-ins, and standard methods to exclude from callee identifier extraction
EXCLUDED_CALLS: Set[str] = {
    # Control flow / keywords
    "if", "for", "while", "with", "catch", "switch", "match", "case", "return", "yield",
    "await", "throw", "assert", "import", "require", "super", "typeof", "instanceof",
    # Python built-ins
    "print", "len", "range", "set", "list", "dict", "tuple", "str", "int", "float",
    "bool", "sum", "min", "max", "any", "all", "enumerate", "zip", "isinstance",
    "issubclass", "open", "getattr", "setattr", "hasattr", "repr", "format", "iter", "next",
    # JS/TS common built-ins & standard methods
    "console", "log", "warn", "error", "info", "debug",
    "map", "filter", "reduce", "forEach", "find", "some", "every", "includes",
    "push", "pop", "shift", "unshift", "slice", "splice", "concat", "join", "split",
    "indexOf", "lastIndexOf", "replace", "replaceAll", "trim", "toLowerCase", "toUpperCase",
    "keys", "values", "entries", "assign", "resolve", "reject", "then", "finally",
    "json", "stringify", "parse", "parseInt", "parseFloat", "toString",
    "setTimeout", "setInterval", "clearTimeout", "clearInterval", "fetch",
    "addEventListener", "removeEventListener", "querySelector", "querySelectorAll",
}


def extract_module_names(filenames: List[str]) -> Set[str]:
    """Extract module basenames from file paths (e.g. 'pricingService.js' -> 'pricingService')."""
    modules: Set[str] = set()
    for fn in filenames:
        if not fn:
            continue
        base = fn.split("/")[-1].split("\\")[-1]
        stem = re.sub(r"\.(?:jsx?|tsx?|mjs|cjs|py)$", "", base, flags=re.IGNORECASE)
        if stem and len(stem) > 2 and stem.lower() not in {"index", "main", "app", "test", "spec", "setup"}:
            modules.add(stem)
    return modules


def extract_changed_identifiers(patches: List[str]) -> Set[str]:
    """
    Extract modified and exported function, class, and variable identifiers from diff patches.
    Inspects:
    1. Added or removed lines (+ / -) for function/class/var definitions.
    2. Export statements (module.exports, export {...}, exports.foo) across the patch.
    3. Hunk context lines defining enclosing functions for modified hunks.
    """
    identifiers: Set[str] = set()
    keywords = {
        "if", "else", "elif", "for", "while", "try", "except", "finally", "with",
        "return", "yield", "pass", "break", "continue", "import", "from", "as",
        "def", "class", "async", "await", "function", "const", "let", "var", "export",
        "default", "interface", "type", "true", "false", "null", "undefined", "none",
        "self", "this", "new", "throw", "catch", "case", "switch", "match", "test",
        "module", "exports", "require",
    }

    # Patterns for declarations
    decl_patterns = [
        re.compile(r"(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s+([A-Za-z0-9_$]+)"),
        re.compile(r"(?:export\s+)?(?:const|let|var)\s+([A-Za-z0-9_$]+)\s*="),
        re.compile(r"(?:export\s+)?class\s+([A-Za-z0-9_$]+)"),
        re.compile(r"(?:async\s+)?def\s+([A-Za-z0-9_]+)\s*\("),
        re.compile(r"class\s+([A-Za-z0-9_]+)\s*[:\(]"),
        re.compile(r"(?:module\.)?exports\.([A-Za-z0-9_$]+)\s*="),
    ]

    # Export object patterns
    export_obj_patterns = [
        re.compile(r"(?:module\.)?exports\s*=\s*\{([^}]+)\}"),
        re.compile(r"export\s*\{([^}]+)\}"),
    ]

    for patch in patches:
        if not patch:
            continue
        for line in patch.splitlines():
            # Skip file headers
            if line.startswith(("---", "+++", "index ", "diff --git")):
                continue

            is_diff_line = (line.startswith("+") and not line.startswith("+++")) or (
                line.startswith("-") and not line.startswith("---")
            )
            raw_text = line[1:].strip() if line and line[0] in ("+", "-", " ") else line.strip()

            # 1. Declarations on modified lines (+ or -)
            if is_diff_line:
                for pattern in decl_patterns:
                    for match in pattern.finditer(raw_text):
                        ident = match.group(1).strip()
                        if ident and len(ident) > 2 and ident.lower() not in keywords:
                            identifiers.add(ident)

            # 2. Export statements across the patch (even if in context lines)
            for exp_pat in export_obj_patterns:
                for match in exp_pat.finditer(raw_text):
                    for item in match.group(1).split(","):
                        item_clean = item.strip()
                        if ":" in item_clean:
                            item_clean = item_clean.split(":")[0].strip()
                        elif " as " in item_clean:
                            item_clean = item_clean.split(" as ")[0].strip()
                        if item_clean and len(item_clean) > 2 and item_clean.lower() not in keywords:
                            identifiers.add(item_clean)

            # 3. Direct exports on context lines: exports.foo = ...
            if "exports." in raw_text or "export " in raw_text:
                for pattern in decl_patterns:
                    for match in pattern.finditer(raw_text):
                        ident = match.group(1).strip()
                        if ident and len(ident) > 2 and ident.lower() not in keywords:
                            identifiers.add(ident)

    return identifiers


def extract_called_identifiers(patches: List[str]) -> Set[str]:
    """Extract called function/method identifiers from added diff lines only (+ lines)."""
    called: Set[str] = set()
    call_regex = re.compile(r"\b([A-Za-z0-9_$]+)\s*\(")

    for patch in patches:
        if not patch:
            continue
        for line in patch.splitlines():
            # Added lines only, ignoring diff chunk header +++
            if not (line.startswith("+") and not line.startswith("+++")):
                continue
            code_line = line[1:].strip()

            # Ignore comments
            if code_line.startswith(("#", "//", "/*", "*")):
                continue

            for match in call_regex.finditer(code_line):
                ident = match.group(1).strip()
                if (
                    ident
                    and len(ident) > 2
                    and ident not in EXCLUDED_CALLS
                    and ident.lower() not in EXCLUDED_CALLS
                ):
                    called.add(ident)

    return called


def matches_definition(content: str, name: str) -> bool:
    """Check whether a source file defines a function, class, or export matching `name`."""
    escaped = re.escape(name)
    patterns = [
        # Python definitions
        rf"(?:async\s+)?def\s+{escaped}\b",
        rf"class\s+{escaped}\b",
        # JS/TS function or class
        rf"(?:async\s+)?function\s+{escaped}\b",
        rf"class\s+{escaped}\b",
        # JS/TS variable assignment
        rf"(?:const|let|var)\s+{escaped}\s*=",
        # JS exports
        rf"exports\.{escaped}\b",
        rf"module\.exports\.{escaped}\b",
    ]
    combined = re.compile("|".join(patterns), re.MULTILINE)
    return bool(combined.search(content))


def check_file_caller(
    content: str,
    identifiers: Set[str],
    module_names: Set[str],
) -> Optional[str]:
    """
    Check if a candidate file calls any changed identifiers or imports any changed modules.
    Supports CommonJS, ESM, and Python import conventions.
    Returns a reason string if matched, None otherwise.
    """
    matched_imports: List[str] = []
    matched_calls: List[str] = []

    # 1. Check module imports (CommonJS, ESM, Python)
    for mod in module_names:
        escaped_mod = re.escape(mod)
        # CommonJS: require('./pricingService'), require('../pricingService'), require('pricingService')
        cjs_pattern = rf"require\s*\(\s*['\"][^'\"]*?{escaped_mod}(?:\.[a-zA-Z0-9]+)?['\"]\s*\)"
        # ESM: import ... from './pricingService'
        esm_pattern = rf"import\s+.*?from\s+['\"][^'\"]*?{escaped_mod}(?:\.[a-zA-Z0-9]+)?['\"]"
        # Python: import pricingService, from pricingService import ...
        py_pattern = rf"(?:from\s+[\w\.]*?{escaped_mod}|import\s+[\w\.]*?{escaped_mod})\b"

        if (
            re.search(cjs_pattern, content)
            or re.search(esm_pattern, content)
            or re.search(py_pattern, content)
        ):
            matched_imports.append(mod)

    # 2. Check identifier references and direct calls
    for ident in identifiers:
        escaped_id = re.escape(ident)
        # Direct function/method invocation: calculateTotal(...)
        call_pattern = rf"\b{escaped_id}\s*\("
        if re.search(call_pattern, content):
            matched_calls.append(ident)
        elif re.search(rf"\b{escaped_id}\b", content):
            matched_calls.append(ident)

    if not matched_imports and not matched_calls:
        return None

    reasons: List[str] = []
    if matched_imports:
        reasons.append(f"imports '{', '.join(matched_imports)}'")
    if matched_calls:
        reasons.append(f"calls '{', '.join(matched_calls)}'")

    return " and ".join(reasons)


def post_process_conflict_decision(
    ai_conflict_type: str,
    ai_risk_score: str,
    ai_explanation: str,
    mergeable_state: Optional[str],
    resolved_files: Optional[List[Any]] = None,
) -> Tuple[str, str, str, List[Any]]:
    """
    Enforce ground-truth Git conflict status against AI predictions.

    - If mergeable_state == 'dirty': force conflict_type = 'TEXTUAL' and risk_score at least 'MEDIUM'.
    - If mergeable_state == 'clean' and AI says 'TEXTUAL': downgrade to 'SEMANTIC' or 'NONE'.
    - If conflict_type == 'NONE': ensure resolved_files is an empty list (no patch modifications needed).
    """
    state_normalized = (mergeable_state or "").strip().lower()

    conflict_type = ai_conflict_type
    risk_score = ai_risk_score
    explanation = ai_explanation

    if state_normalized == "dirty":
        conflict_type = "TEXTUAL"
        if risk_score == "LOW":
            risk_score = "MEDIUM"
        if "dirty" not in explanation.lower() and "merge conflict" not in explanation.lower():
            explanation = f"GitHub reports dirty merge conflicts on this PR. {explanation}".strip()

    elif state_normalized == "clean" and ai_conflict_type == "TEXTUAL":
        semantic_keywords = [
            "semantic", "signature", "parameter", "return", "type", "contract",
            "caller", "break", "invariant", "downstream", "interface",
        ]
        has_semantic_finding = any(kw in ai_explanation.lower() for kw in semantic_keywords)
        if has_semantic_finding:
            conflict_type = "SEMANTIC"
        else:
            conflict_type = "NONE"
            risk_score = "LOW"
            explanation = f"Git cleanly merges this PR without collisions. {explanation}".strip()

    # Rule: NONE results carry no resolved_files changes
    if conflict_type == "NONE":
        final_resolved_files: List[Any] = []
    else:
        final_resolved_files = list(resolved_files) if resolved_files is not None else []

    return conflict_type, risk_score, explanation, final_resolved_files
