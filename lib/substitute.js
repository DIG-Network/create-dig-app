// Placeholder substitution for template files.
//
// Template files use `__TOKEN__` placeholders (uppercase + underscores, wrapped in double
// underscores) so they are: (a) obvious in source, (b) never valid identifiers/JSON that would run
// or parse by accident, and (c) trivially greppable in tests ("no leftover __PLACEHOLDER__"). We
// substitute every known token; an UNKNOWN `__TOKEN__` left in a template is a template bug, so the
// test suite asserts none remain after scaffolding.

/**
 * The substitution map for one scaffold. Keys are the token names WITHOUT the surrounding
 * underscores (e.g. "APP_NAME" → replaces "__APP_NAME__").
 * @typedef {Record<string, string>} Substitutions
 */

/**
 * Replace every `__TOKEN__` in `text` whose TOKEN is present in `subs`. Tokens absent from `subs`
 * are left untouched (so a typo surfaces as a leftover placeholder in tests rather than silently
 * blanking).
 * @param {string} text
 * @param {Substitutions} subs
 * @returns {string}
 */
export function applySubstitutions(text, subs) {
  return text.replace(/__([A-Z][A-Z0-9_]*)__/g, (whole, token) =>
    Object.prototype.hasOwnProperty.call(subs, token) ? subs[token] : whole,
  );
}

/**
 * Build the standard substitution map for a scaffold.
 * @param {Object} args
 * @param {string} args.appName     The normalized (npm-safe) app/package name.
 * @param {string} args.displayName The original user-supplied name (for prose/titles).
 * @param {string} args.sdkVersion  The @dignetwork/dig-sdk version range to pin.
 * @param {string} args.outputDir   The template's built-output dir.
 * @param {string} args.buildCommand The template's build command.
 * @returns {Substitutions}
 */
export function buildSubstitutions({ appName, displayName, sdkVersion, outputDir, buildCommand }) {
  return {
    APP_NAME: appName,
    DISPLAY_NAME: displayName,
    SDK_VERSION: sdkVersion,
    OUTPUT_DIR: outputDir,
    BUILD_COMMAND: buildCommand,
  };
}
