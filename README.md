# Pragma Formation

A modern, high-performance website built with [Astro](https://astro.build), [Storyblok](https://storyblok.com) headless CMS, and [Tailwind CSS](https://tailwindcss.com). Deployed on [Vercel](https://vercel.com) with full SEO optimization.

![Astro](https://img.shields.io/badge/Astro-5.17.3-FF6B6B?style=flat&logo=astro)
![Storyblok](https://img.shields.io/badge/Storyblok-7.3.9-09B3AF?style=flat)
![Tailwind CSS](https://img.shields.io/badge/Tailwind%20CSS-4.2.1-38BDF8?style=flat&logo=tailwind-css)
![Vercel](https://img.shields.io/badge/Vercel-Deployed-000000?style=flat&logo=vercel)

## ✨ Features

- **SSR Vercel**: Server-side rendering for the authenticated platform, with an explicitly pre-rendered marketing homepage
- **Supabase Auth**: Email OTP with secure persistent cookies and RLS-protected progress
- **Storyblok Integration**: Visual editor support, dynamic content blocks, draft/published versions
- **Tailwind CSS v4**: Utility-first styling with modern CSS features
- **SEO Optimized**: Meta tags, Open Graph, Twitter Cards, JSON-LD schemas, sitemap
- **Analytics**: Vercel Analytics integration
- **TypeScript**: Full type safety with strict configuration
- **Code Quality**: ESLint + Prettier with Astro-specific rules

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- npm or pnpm
- Storyblok account (for CMS content)

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd pragma

# Install dependencies
npm install
```

### Environment Variables

Create a `.env` file in the root directory:

```env
# Required
STORYBLOK_TOKEN=your_storyblok_public_token
SITE_URL=https://www.pragma-formation.fr
PUBLIC_SUPABASE_URL=https://your-project.supabase.co
PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxx

# Optional
STORYBLOK_REGION=eu  # or 'us' for US region
IS_PREVIEW=false     # set to 'true' for Storyblok preview mode
STORYBLOK_ENABLE_BRIDGE=false # enable only when a Storyblok story exists for the preview
SITE_NAME=Pragma
```

Use the Supabase **publishable key** (`sb_publishable_...`) for
`PUBLIC_SUPABASE_PUBLISHABLE_KEY`. The legacy `PUBLIC_SUPABASE_ANON_KEY`
is still accepted as a temporary fallback for existing local environments.

OTP requests are restricted to addresses found in
`public.pragma_inscriptions.email` or `public.pragma_inscriptions.email_discord`.
Apply `supabase/migrations/002_eligible_otp.sql` after `001_learning.sql`.

For local PKCE testing, request the OTP and open the email link in the same
browser and on the same hostname used for the request. Do not switch between
`localhost` and `127.0.0.1`, and do not copy the link to another browser/device.

`SITE_URL` must be the public origin of the site (`https://www.pragma-formation.fr`),
both locally and on Vercel. It sets Astro's `site` option and the trusted hosts
for form POSTs; a missing or placeholder value breaks every form submission and
sends magic links to the wrong host. Magic links land on `/auth/callback`, so add
`https://www.pragma-formation.fr/auth/callback` to the Supabase Auth **Redirect
URLs** allowlist.

Supabase session cookies are HTTP-only and configured to persist for seven days.
When a valid session cookie is present, visiting `/login` redirects directly to
`/dashboard`.

### Development

```bash
# Start development server
npm run dev

# Start development server with preview mode (Storyblok visual editor)
IS_PREVIEW=true npm run dev
```

The development server runs at `http://localhost:4321`.

## 📁 Project Structure

```
pragma/
├── public/                    # Static assets
│   ├── favicon.ico
│   └── favicon.svg
├── src/
│   ├── components/
│   │   └── storyblok/        # Storyblok components
│   │       └── StoryblokFallback.astro
│   ├── layouts/
│   │   ├── Head.astro        # SEO meta tags & analytics
│   │   ├── Layout.astro      # Main layout wrapper
│   │   └── SkipLink.astro    # Accessibility skip link
│   ├── pages/
│   │   └── [...slug].astro   # Dynamic catch-all route
│   └── styles/
│       └── global.css        # Global styles
├── astro.config.mjs          # Astro configuration
├── eslint.config.js          # ESLint configuration
├── package.json              # Dependencies
└── tsconfig.json             # TypeScript configuration
```

## 🧞 Commands

| Command                | Action                                     |
| ---------------------- | ------------------------------------------ |
| `npm install`          | Install dependencies                       |
| `npm run dev`          | Start local dev server at `localhost:4321` |
| `npm run build`        | Build production site to `./dist/`         |
| `npm run preview`      | Preview production build locally           |
| `npm run lint`         | Run ESLint to check code                   |
| `npm run lint:fix`     | Fix ESLint issues automatically            |
| `npm run format`       | Format code with Prettier                  |
| `npm run format:check` | Check code formatting                      |

## 🔧 Configuration

### Storyblok Setup

1. Create a new Space in [Storyblok](https://app.storyblok.com)
2. Get your **Public Token** from Settings > API Keys
3. Configure the token in your `.env` file
4. Create a "Page" content type in Storyblok

### Astro Configuration

Key settings in [`astro.config.mjs`](astro.config.mjs):

- **Output Mode**: Hybrid (SSR for preview, static for production)
- **Adapter**: Vercel with web analytics
- **Integrations**: Storyblok, Tailwind CSS, Sitemap
- **Storyblok Components**: Map Storyblok blocks to Astro components

### Vercel Deployment

The project is configured for Vercel deployment:

1. Connect your repository to Vercel
2. Add environment variables in Vercel dashboard:
   - `STORYBLOK_TOKEN`
   - `SITE_URL`
   - `STORYBLOK_REGION`
3. Deploy automatically on push

For preview deployments (visual editor support), configure a Vercel Preview URL in Storyblok Settings > Visual Editor.

## 🔍 SEO Features

The project includes comprehensive SEO optimization:

- **Meta Tags**: Title, description, robots
- **Open Graph**: Title, description, image, locale, site name
- **Twitter Cards**: Do Not Track flag
- **JSON-LD**: Schema markup support
- **Sitemap**: Automatic sitemap generation
- **Canonical URLs**: Automatic canonical link tags

All SEO data is pulled dynamically from Storyblok content fields.

## 📝 Storyblok Schema

Expected content fields for Page content type:

| Field         | Type     | Description                      |
| ------------- | -------- | -------------------------------- |
| `title`       | Text     | Page title                       |
| `description` | Textarea | Meta description                 |
| `robots`      | Text     | Robots meta tag (default: "all") |
| `ogImage`     | Asset    | Open Graph image                 |
| `ogImageAlt`  | Text     | Open Graph image alt text        |
| `canonical`   | Text     | Canonical URL                    |
| `schema`      | JSON     | JSON-LD schema markup            |

## 🏗️ Architecture

### Rendering Modes

- **Production** (`IS_PREVIEW=false`): Static Site Generation (SSG)
  - All pages pre-rendered at build time
  - Fastest performance, cached globally
- **Preview** (`IS_PREVIEW=true`): Server-Side Rendering (SSR)
  - Dynamic rendering for Storyblok visual editor
  - Real-time content updates

### Dynamic Routing

The [`[...slug].astro`](src/pages/[...slug].astro) file handles all routes:

- Fetches stories from Storyblok CDN
- Generates static paths for SSG
- Renders Storyblok components dynamically

## 📄 License

MIT License - feel free to use this project as a starting point for your own.

## 🙏 Acknowledgments

- [Astro](https://astro.build) - The web framework for content-driven websites
- [Storyblok](https://storyblok.com) - Headless CMS with visual editor
- [Tailwind CSS](https://tailwindcss.com) - A utility-first CSS framework
- [Vercel](https://vercel.com) - Develop. Preview. Ship.
