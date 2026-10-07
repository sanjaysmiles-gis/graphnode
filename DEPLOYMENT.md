# Publish NodeForge on Vercel

Import `sanjaysmiles-gis/graphnode` and select the `main` branch. The Vercel project `nodeforge` has already been created and can be linked to this repository.

- Framework Preset: Other
- Output Directory: dist
- Build Command: leave empty
- Install Command: leave empty
- Production Branch: main

The application is static and has no login system. To make the hosted site accessible without signing in, disable Vercel Authentication and Password Protection for production in the project's Deployment Protection settings.

Website source is in dist/. The verilog/ directory contains the sample VGA/ROM modules, memory files, and a bounded testbench. The website generates updated bundles for user-selected graph dimensions.

Run `node tests/core.test.mjs` for the graph/export checks. See VERIFICATION.md for the completed checks and hardware limitations.
