# Releasing

1. On `main`, update `package.json` to the next stable version, commit, and push.
2. Publish a GitHub Release with the matching `vX.Y.Z` tag at that commit.
3. Check the Publish workflow for the npm result.

The workflow verifies the release on Linux and Windows, validates the package, and publishes with provenance.
The tag must match the package version and point to a commit on `main`. Prereleases are skipped. Normal pushes run CI only.

npm trusts `apeck14/agent-lint` through `publish.yml`; no npm token is stored in GitHub. Version `1.0.0` is already
published and cannot be reused.
