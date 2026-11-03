export interface DemoPrPreset {
  id: string;
  label: string;
  url: string;
  badge: string;
  description: string;
}

export const DEMO_PR_PRESETS: DemoPrPreset[] = [
  {
    id: 'demo-1',
    label: 'codeshazard/MergeDemo #1',
    url: 'https://github.com/codeshazard/MergeDemo/pull/1',
    badge: 'Semantic Conflict',
    description: 'Cart discount breaks downstream shippingService $50 free-shipping threshold',
  },
  {
    id: 'demo-2',
    label: 'octocat/Hello-World #2065',
    url: 'https://github.com/octocat/Hello-World/pull/2065',
    badge: 'Textual / Clean',
    description: 'Standard multi-contributor merge test PR on GitHub Hello-World',
  },
  {
    id: 'demo-3',
    label: 'facebook/react #31415',
    url: 'https://github.com/facebook/react/pull/31415',
    badge: 'Upstream React',
    description: 'Enterprise React codebase Pull Request inspection demo',
  },
];
