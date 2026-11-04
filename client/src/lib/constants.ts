import type { Analysis } from './types';

export const SAMPLE_ANALYSIS_PAYLOAD: Analysis = {
  _id: '507f1f77bcf86cd799439011',
  id: '507f1f77bcf86cd799439011',
  repo_owner: 'codeshazard',
  repo_name: 'MergeDemo',
  pr_number: 1,
  pr_title: 'feat: apply 10% storewide discount to cart totals',
  base_branch: 'main',
  compare_branch: 'feature/discount',
  conflict_type: 'SEMANTIC',
  risk_score: 'HIGH',
  explanation:
    "The PR modifies 'calculateTotal' in 'pricingService.js' to apply a 10% discount. However, 'shippingService.js' (an external caller outside the PR) uses this same function to determine if an order qualifies for free shipping (threshold of $50). By reducing the calculated subtotal, carts that previously qualified for free shipping (e.g., $52) now evaluate to $46.80, unintentionally triggering a $10 shipping charge. Assumption to confirm: The resolution assumes the discount is storewide and updates shippingService.js to verify eligibility against the pre-discount subtotal, preserving the $50 threshold invariant.",
  file_diffs: [
    {
      filename: 'pricingService.js',
      status: 'modified',
      patch:
        '@@ -1,5 +1,5 @@\n function calculateTotal(cart) {\n-  return cart.items.reduce((sum, i) => sum + i.price * i.qty, 0);\n+  return cart.items.reduce((sum, i) => sum + i.price * i.qty, 0) * 0.90;\n }\n \n module.exports = { calculateTotal };\n',
    },
  ],
  context_files: [
    {
      filename: 'shippingService.js',
      reason: "imports 'pricingService' and calls 'calculateTotal'",
      content:
        "const { calculateTotal } = require('./pricingService');\n\nfunction getShippingFee(cart) {\n  return calculateTotal(cart) >= 50 ? 0 : 10;\n}\n\nmodule.exports = { getShippingFee };\n",
    },
  ],
  resolved_files: [
    {
      filename: 'pricingService.js',
      content:
        'function calculateTotal(cart) {\n  return cart.items.reduce((sum, i) => sum + i.price * i.qty, 0) * 0.90;\n}\n\nmodule.exports = { calculateTotal };\n',
      original_content:
        'function calculateTotal(cart) {\n  return cart.items.reduce((sum, i) => sum + i.price * i.qty, 0);\n}\n\nmodule.exports = { calculateTotal };\n',
    },
    {
      filename: 'shippingService.js',
      content:
        "const { calculateTotal } = require('./pricingService');\n\nfunction getShippingFee(cart) {\n  // Invariant preserved: evaluate eligibility on pre-discount subtotal\n  const preDiscountSubtotal = cart.items.reduce((sum, i) => sum + i.price * i.qty, 0);\n  return preDiscountSubtotal >= 50 ? 0 : 10;\n}\n\nmodule.exports = { getShippingFee };\n",
      original_content:
        "const { calculateTotal } = require('./pricingService');\n\nfunction getShippingFee(cart) {\n  return calculateTotal(cart) >= 50 ? 0 : 10;\n}\n\nmodule.exports = { getShippingFee };\n",
    },
  ],
  test_assertions: [
    {
      assertion: 'calculateTotal returns 90% of the sum of item prices (e.g., 100 becomes 90).',
      status: 'PASS',
    },
    {
      assertion: 'getShippingFee returns 0 for a cart with a pre-discount subtotal of 50, even if the discounted total is 45.',
      status: 'PASS',
    },
    {
      assertion: 'getShippingFee returns 10 for a cart with a pre-discount subtotal of 49.',
      status: 'PASS',
    },
  ],
  integration_status: 'PENDING',
  integration_branch: null,
  github_mergeable_state: 'clean',
  truncated: false,
  created_at: new Date().toISOString(),
};
