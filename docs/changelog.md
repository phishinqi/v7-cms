# Changelog

## v0.2.2

- Date and time fields now offer native calendar/time pickers with Today and Now shortcuts. Existing offsets are preserved; new timestamps use browser local time.
- Inferred timestamp fields retain their time component instead of being displayed as date-only fields.

## v0.2.1

- Uploads now fill declared photo EXIF fields and capture dates after a successful write, preserving manually entered values. Set `media.exif: false` to disable prefilling.
- JPEG, PNG and WebP metadata is read before compression; output files still omit EXIF and GPS.
- Documented jsDelivr public URLs for independent GitHub image repositories.

## v0.2.0

- Image uploads now persist WebP bytes to the connected content repository, an R2 media API, or a separate GitHub media repository.
- Upload failures preserve the current image value. Successful uploads populate declared sibling dimensions, colour and responsive URLs.
- Media configuration validates remote destinations and supports collection overrides. Direct S3 placeholder settings report an unsupported-provider error.
- Configuration and authentication requirements are documented in [configuration](configuration.md#upload-destinations).

Validation: unit tests, browser upload scenarios and editor regressions, type checks, lint and production builds. Remote GitHub/R2 tests use mocked services; live credentials are not exercised by the test suite.
