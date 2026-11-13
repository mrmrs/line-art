import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  // Crawlers need absolute image URLs in the initial HTML. Cloudflare supplies
  // the deployment URL; an explicit public URL also enables the canonical link.
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  const canonical = process.env.VITE_SITE_URL || env.VITE_SITE_URL
  const deployment = canonical || process.env.CF_PAGES_URL
  const site = deployment ? new URL('/', deployment) : undefined
  if (site && !['http:', 'https:'].includes(site.protocol)) {
    throw new Error('VITE_SITE_URL / CF_PAGES_URL must be an HTTP(S) URL')
  }
  return {
    plugins: [react(), {
      name: 'social-preview-urls',
      transformIndexHtml(html) {
        if (!site) return html
        return {
          html: html.replaceAll('content="/og-image.png"', `content="${new URL('og-image.png', site).href}"`),
          tags: [
            { tag: 'meta', attrs: { property: 'og:url', content: site.href }, injectTo: 'head' },
            ...(canonical ? [{ tag: 'link', attrs: { rel: 'canonical', href: site.href }, injectTo: 'head' as const }] : []),
          ],
        }
      },
    }],
  }
})
