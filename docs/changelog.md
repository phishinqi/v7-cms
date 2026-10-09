# Changelog

## v0.3.1

- Keep Markdown tables in the source editor so the rich editor cannot flatten them.
- Let authors switch between source and rich editing manually for every body field.

## v0.3.0

- Automatically register tags and categories already present in content but missing from their registries while opening an entry.
- Preserve the existing tag registry format and unrelated registry fields when repairing missing tags.

## v0.2.8

- Insert article illustrations at the start, end, or after a heading or paragraph. Set alternative text, captions, dimensions, and alignment, including left or right text wrap; edit or move illustrations later.
- Preview article figures safely in the CMS and preserve their markup when saving Markdown or MDX.
- Upload HEIC, HEIF, AVIF, GIF, and BMP images alongside JPEG, PNG, and WebP. The saved image remains WebP without original metadata.

## v0.2.7

- Author lists now use the same searchable, removable chips as tags. Display author names while saving stable IDs, support multiple selections, and wrap on small screens.

## v0.2.6

- Fix the tag picker crashing on string tag registries. Support both strings and named objects, skip invalid entries, and preserve existing registry data and entry format when adding tags.

## v0.2.5

- Display selected tags as removable chips in one compact input, with automatic wrapping on small screens.
- Search existing tags or create a new tag from the same field, with keyboard and IME support.

## v0.2.4

- Stable npm versions now publish under `latest`; prerelease versions use `alpha`.

- Select multiple existing tags or create tags directly while writing.
- Preserve existing tags, deduplicate selections, validate tag names and check conflicts before registry writes.

## v0.2.3

- Create and select categories directly while editing an article, using a live category registry.
- Save categories before article references, with duplicate detection and conflict checking.

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
