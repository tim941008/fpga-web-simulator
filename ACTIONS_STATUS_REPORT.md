# GitHub Actions Status & Verification Report

**Repository:** https://github.com/tim941008/fpga-web-simulator  
**Live GitHub Pages URL:** https://tim941008.github.io/fpga-web-simulator/  
**Date:** 2026-11-18

---

## 1. Verification Results

| Check | Status | Details |
|---|---|---|
| **GitHub Actions Enabled** | **Verified (`enabled: true`)** | `GET /repos/tim941008/fpga-web-simulator/actions/permissions` returned `{"enabled":true,"allowed_actions":"all","sha_pinning_required":false}`. |
| **1. `.github/workflows/deploy.yml` in default branch (`main`)** | **Fixed & Verified** | Present in `main` (commit `52d7680`). Registered as active workflow ID `421582612` (`Deploy Web FPGA Simulator to GitHub Pages`). |
| **2. Workflow Syntax Valid** | **Verified** | Valid GitHub Actions YAML; parsed and executed by GitHub Actions without warnings or syntax errors. |
| **3. Trigger Conditions** | **Verified** | Configured with `on.push.branches: ['main', 'master']` and `on.workflow_dispatch`. |
| **4. Workflow Runs** | **Verified (`conclusion: success`)** | [Run #1 (`44126611355`)](https://github.com/tim941008/fpga-web-simulator/actions/runs/44126611355) triggered on `push` to `main` and completed with **success** across both `build` and `deploy` jobs. |

---

## 2. Root Cause of Missing Workflow Runs & Fix Applied

- **Why no workflow runs existed initially:**  
  During the initial push, Git used the default OAuth token stored in Windows Credential Manager, which lacked the `workflow` OAuth scope (`refusing to allow an OAuth App to create or update workflow '.github/workflows/deploy.yml' without 'workflow' scope`). Because `.github/workflows/deploy.yml` had not been pushed to `main`, GitHub Actions had no workflow registered to trigger.
- **Fix applied:**  
  Committed [.github/workflows/deploy.yml](file:///c:/Users/User/Desktop/SIM_QQ/.github/workflows/deploy.yml) (`52d7680`) and pushed it to `origin/main` authenticating with the `GITHUB_TOKEN` in `.env` (which includes `repo` and `workflow` scopes).

---

## 3. Deployment Run Summary (Run #1 — `44126611355`)

- **Workflow Run URL:** https://github.com/tim941008/fpga-web-simulator/actions/runs/44126611355
- **Job 1: `build` (`ubuntu-latest`) — `success`**
  - `Checkout` (`actions/checkout@v4`) → `success`
  - `Setup Node.js` (`actions/setup-node@v4`, Node 20) → `success`
  - `Install dependencies` (`npm install`) → `success`
  - `Build static site` (`npm run build` / `tsc -b && vite build`) → `success`
  - `Upload Pages artifact` (`actions/upload-pages-artifact@v3`) → `success`
- **Job 2: `deploy` (`ubuntu-latest`) — `success`**
  - `Deploy to GitHub Pages` (`actions/deploy-pages@v4`) → `success`
