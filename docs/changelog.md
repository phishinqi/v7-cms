# Changelog

## v0.2.0

- Image uploads now persist WebP bytes to the connected content repository, an R2 media API, or a separate GitHub media repository.
- Upload failures preserve the current image value. Successful uploads populate declared sibling dimensions, colour and responsive URLs.
- Media configuration validates remote destinations and supports collection overrides. Direct S3 placeholder settings report an unsupported-provider error.
- Configuration and authentication requirements are documented in [configuration](configuration.md#upload-destinations).

Validation: unit tests, browser upload scenarios and editor regressions, type checks, lint and production builds. Remote GitHub/R2 tests use mocked services; live credentials are not exercised by the test suite.
