import type { NextConfig } from 'next'

/**
 * Deliberately almost empty.
 *
 * `transpilePackages` is NOT needed for the un-built TypeScript workspace packages
 * (@acf/core, @acf/db, @acf/jobs): Turbopack — the default bundler in Next 16 for both
 * dev and build — transpiles workspace packages automatically. Adding it would also
 * conflict with serverExternalPackages.
 */
const config: NextConfig = {}

export default config
