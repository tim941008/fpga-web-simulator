# Deployment Guide

This guide covers local development, production builds, and static deployment to **GitHub Pages**.

## Prerequisites

- **Node.js 20+** (LTS) and **npm**

## 1. Install Dependencies

```bash
npm install
```

This installs React, TypeScript, Vite, TailwindCSS, `lucide-react`, and `binaryen` (required by the Verilator WASM codegen pipeline).

## 2. Run Locally (`npm run dev`)

```bash
npm run dev
```

Open the local URL printed by Vite (typically `http://localhost:5173`) to test the simulator with hot module replacement.

## 3. Production Build (`npm run build`)

```bash
npm run build
```

This runs `tsc -b && vite build` and outputs static files into `dist/`, using relative asset paths (`base: './'` in `vite.config.ts`) so the app works from any GitHub Pages subpath (e.g. `https://<user>.github.io/<repo>/`).

To preview the production bundle locally:

```bash
npm run preview
```

## 4. GitHub Pages Deployment

The repository includes an automated workflow at `.github/workflows/deploy.yml` that builds and deploys `./dist` on every push to `main` or `master` (and works with or without `package-lock.json`).

### First-Time Repository Setup

1. Initialize and push your local repository to GitHub:
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/<your-username>/<your-repo>.git
   git push -u origin main
   ```
2. In your GitHub repository, open **Settings → Pages**.
3. Under **Build and deployment → Source**, select **GitHub Actions**.
4. The `Deploy Web FPGA Simulator to GitHub Pages` workflow will run automatically and publish your live site URL.
