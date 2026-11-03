import pytest
from fastapi import HTTPException

from models.analysis import ContextFile, FileDiff
from utils.ai import build_user_prompt
from utils.github import parse_repo_url
from utils.rules import (
    check_file_caller,
    extract_called_identifiers,
    extract_changed_identifiers,
    extract_module_names,
    matches_definition,
    post_process_conflict_decision,
)


def test_parse_repo_url_valid():
    assert parse_repo_url("https://github.com/octocat/Hello-World") == ("octocat", "Hello-World")
    assert parse_repo_url("https://github.com/octocat/Hello-World/") == ("octocat", "Hello-World")
    assert parse_repo_url("https://github.com/octocat/Hello-World.git") == ("octocat", "Hello-World")
    assert parse_repo_url("http://github.com/octocat/Hello-World.git/") == ("octocat", "Hello-World")
    assert parse_repo_url("github.com/facebook/react") == ("facebook", "react")


def test_parse_repo_url_invalid():
    with pytest.raises(HTTPException) as exc_info:
        parse_repo_url("https://gitlab.com/owner/repo")
    assert exc_info.value.status_code == 422

    with pytest.raises(HTTPException) as exc_info:
        parse_repo_url("just-a-string")
    assert exc_info.value.status_code == 422


def test_extract_module_names():
    filenames = [
        "pricingService.js",
        "src/utils/shippingService.ts",
        "components/cartManager.jsx",
        "handlers/api.mjs",
        "scripts/bundle.cjs",
        "core/order.py",
        "index.js",
        "main.py",
    ]
    modules = extract_module_names(filenames)
    assert "pricingService" in modules
    assert "shippingService" in modules
    assert "cartManager" in modules
    assert "api" in modules
    assert "bundle" in modules
    assert "order" in modules
    # Common generic files excluded
    assert "index" not in modules
    assert "main" not in modules


def test_extract_changed_identifiers_python():
    py_patch = """
@@ -10,3 +10,6 @@
 def old_func():
     pass
+async def calculate_total(order_id):
+    return 100
+class TaxCalculator:
+    pass
    """
    identifiers = extract_changed_identifiers([py_patch])
    assert "calculate_total" in identifiers
    assert "TaxCalculator" in identifiers
    assert "old_func" not in identifiers


def test_extract_changed_identifiers_js_ts():
    js_patch = """
@@ -1,4 +1,8 @@
-export function legacyBilling() {
+export function processInvoice(amount) {
+  return amount * 1.2;
+}
+export const userProfileService = {
+};
+export class OrderManager {}
    """
    identifiers = extract_changed_identifiers([js_patch])
    assert "legacyBilling" in identifiers
    assert "processInvoice" in identifiers
    assert "userProfileService" in identifiers
    assert "OrderManager" in identifiers


def test_extract_changed_identifiers_diff_hunk_and_exports():
    # Exactly like MergeDemo PR #1: changes inside calculateTotal with module.exports
    demo_patch = """
@@ -1,5 +1,5 @@
 function calculateTotal(cart) {
-  return cart.items.reduce((sum, i) => sum + i.price * i.qty, 0);
+  return cart.items.reduce((sum, i) => sum + i.price * i.qty, 0) * 0.90;
 }
 
 module.exports = { calculateTotal };
"""
    identifiers = extract_changed_identifiers([demo_patch])
    assert "calculateTotal" in identifiers


def test_check_file_caller_commonjs():
    # CommonJS require with relative paths
    content_relative = "const { calculateTotal } = require('./pricingService');\nconst x = calculateTotal(cart);"
    reason = check_file_caller(content_relative, {"calculateTotal"}, {"pricingService"})
    assert reason is not None
    assert "pricingService" in reason
    assert "calculateTotal" in reason

    # CommonJS require with subfolder & extension
    content_ext = "const pricing = require('../services/pricingService.js');"
    reason = check_file_caller(content_ext, set(), {"pricingService"})
    assert reason is not None
    assert "pricingService" in reason


def test_check_file_caller_esm():
    # ESM import
    content_esm = "import { calculateTotal } from './pricingService';\nconst val = calculateTotal(c);"
    reason = check_file_caller(content_esm, {"calculateTotal"}, {"pricingService"})
    assert reason is not None
    assert "pricingService" in reason
    assert "calculateTotal" in reason


def test_check_file_caller_direct_symbol():
    # Direct symbol call without named module
    content = "function run() { return calculateTotal(cart) >= 50 ? 0 : 10; }"
    reason = check_file_caller(content, {"calculateTotal"}, set())
    assert reason is not None
    assert "calculateTotal" in reason

    # Unrelated content
    unrelated = "function test() { return getTaxRate() * 10; }"
    assert check_file_caller(unrelated, {"calculateTotal"}, {"pricingService"}) is None


def test_extract_called_identifiers():
    patch = """
@@ -1,5 +1,9 @@
+// Comments should not match
+// fakeCall()
+const x = 10;
+print("should ignore builtin print");
+let total = computeDiscount(price);
+const tax = calculateTax(total, "USD");
+const filtered = items.filter(i => i.active);
+"""
    called = extract_called_identifiers([patch])
    assert "computeDiscount" in called
    assert "calculateTax" in called
    # Builtins and standard methods excluded
    assert "print" not in called
    assert "filter" not in called
    assert "fakeCall" not in called


def test_matches_definition():
    py_code = """
import os

def calculateTax(amount, currency):
    return amount * 0.15

class AccountManager:
    pass
"""
    assert matches_definition(py_code, "calculateTax") is True
    assert matches_definition(py_code, "AccountManager") is True
    assert matches_definition(py_code, "unknownFunction") is False

    js_code = """
import { helper } from './util';

export const computeDiscount = (rate) => rate * 0.9;

function formatCurrency(val) {
  return `$${val}`;
}

exports.legacyModule = function() {};
"""
    assert matches_definition(js_code, "computeDiscount") is True
    assert matches_definition(js_code, "formatCurrency") is True
    assert matches_definition(js_code, "legacyModule") is True
    assert matches_definition(js_code, "missingItem") is False


def test_post_process_conflict_decision_dirty():
    # Dirty forces TEXTUAL and at least MEDIUM risk
    c_type, risk, explanation, _ = post_process_conflict_decision(
        ai_conflict_type="NONE",
        ai_risk_score="LOW",
        ai_explanation="All clear.",
        mergeable_state="dirty",
    )
    assert c_type == "TEXTUAL"
    assert risk == "MEDIUM"
    assert "dirty" in explanation.lower() or "merge conflicts" in explanation.lower()

    # Dirty preserves HIGH risk
    c_type, risk, _, _ = post_process_conflict_decision(
        ai_conflict_type="SEMANTIC",
        ai_risk_score="HIGH",
        ai_explanation="Interface break.",
        mergeable_state="DIRTY",
    )
    assert c_type == "TEXTUAL"
    assert risk == "HIGH"


def test_post_process_conflict_decision_clean_downgrade():
    # Clean PR with textual AI prediction but semantic notes downgrades to SEMANTIC
    c_type, risk, _, _ = post_process_conflict_decision(
        ai_conflict_type="TEXTUAL",
        ai_risk_score="HIGH",
        ai_explanation="Function parameter signature mismatch in caller module.",
        mergeable_state="clean",
    )
    assert c_type == "SEMANTIC"
    assert risk == "HIGH"

    # Clean PR with textual AI prediction without semantic notes downgrades to NONE and LOW
    c_type, risk, explanation, _ = post_process_conflict_decision(
        ai_conflict_type="TEXTUAL",
        ai_risk_score="HIGH",
        ai_explanation="Direct line edit overlaps.",
        mergeable_state="clean",
    )
    assert c_type == "NONE"
    assert risk == "LOW"
    assert "cleanly merges" in explanation.lower()


def test_post_process_conflict_decision_none_clears_resolved_files():
    # Negative-case guard: When conflict_type is NONE, resolved_files MUST be empty list
    mock_files = [{"filename": "main.py", "content": "print('hello')"}]
    c_type, risk, explanation, resolved = post_process_conflict_decision(
        ai_conflict_type="NONE",
        ai_risk_score="LOW",
        ai_explanation="Clean changes, no collision.",
        mergeable_state="clean",
        resolved_files=mock_files,
    )
    assert c_type == "NONE"
    assert risk == "LOW"
    assert resolved == []

    # If downgraded from TEXTUAL to NONE, resolved_files is also cleared
    c_type, risk, explanation, resolved = post_process_conflict_decision(
        ai_conflict_type="TEXTUAL",
        ai_risk_score="LOW",
        ai_explanation="No collisions detected.",
        mergeable_state="clean",
        resolved_files=mock_files,
    )
    assert c_type == "NONE"
    assert resolved == []

    # If SEMANTIC, resolved_files is preserved
    c_type, risk, explanation, resolved = post_process_conflict_decision(
        ai_conflict_type="SEMANTIC",
        ai_risk_score="MEDIUM",
        ai_explanation="Altered return-value contract.",
        mergeable_state="clean",
        resolved_files=mock_files,
    )
    assert c_type == "SEMANTIC"
    assert resolved == mock_files


def test_build_user_prompt_truncation():
    # Test normal prompt within limits
    diffs = [
        FileDiff(filename="main.py", status="modified", patch="@@ -1 +1 @@\n+print('hello')")
    ]
    prompt, truncated = build_user_prompt("Fix typo", diffs, [], "clean")
    assert not truncated
    assert "PR Title: Fix typo" in prompt
    assert "GitHub Mergeable State: clean" in prompt

    # Test huge diff causing truncation
    huge_diffs = [
        FileDiff(filename=f"file_{i}.py", status="modified", patch="+" + "a" * 5000)
        for i in range(12)
    ]
    huge_prompt, was_truncated = build_user_prompt("Huge PR", huge_diffs, [])
    assert was_truncated is True
    assert "truncated" in huge_prompt.lower()
