# Approved Instance Image Catalog

This folder is the only source for instance images shown in the provisioning wizard.

Add one `.json` manifest per approved image. Users cannot upload images through the frontend or API.

Manifest fields:

- `code`: worker-supported image code or Incus image source/alias.
- `label`: user-facing label shown in the wizard.
- `family`: `linux` or `windows`.
- `enabled`: optional; set `false` to hide an image without deleting its manifest.
