import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Stop `next dev` from writing managed AI-agent instructions into AGENTS.md
  // (enabled by default since Next.js 16.3). Decision recorded in TASK-03A.
  agentRules: false,
};

export default nextConfig;
