# AGENTS.md

ffxiv-pfbot is a Discord bot (Bun + TypeScript + discord.js) that polls [xivpf.com](https://xivpf.com/listings), matches Party Finder listings against per-channel subscriptions (RE2 regular expressions plus data center and category filters), and posts, updates, and deletes messages. State lives in Bun's built-in SQLite. Read [README.md](README.md) for behavior before changing `src/`; [src/locales/README.md](src/locales/README.md) governs translations.

## Repository layout

```
src/
  index.ts        Startup: language, command auto-loading, interaction dispatch, monitor, shutdown
  commands/       One slash command per file; exports `data` and `execute` (see types/command.ts)
  services/       fetcher (parse xivpf), monitor (match/send/update), listing-state, cleanup,
                  tasks (serial queue + bot status), store (SQLite), subscription-form, subscription-pager
  utils/          channel permissions, embeds, listing time parsing, text, localized logger, Discord errors
  locales/        en/chs/de/fr/ja/ko text packs; `utils/` config + formatting; `generated/` dictionaries
  constants/      Language-independent filter values and identifiers (recruitment.ts)
  types/          Command, Locale, Recruitment, subscription error types
scripts/build-dict.ts  Generates `src/locales/generated/*.ts` from the `ffxiv-data` submodule
tests/            `bun test` suites and shared fakes in `helpers.ts`
ffxiv-data/       Git submodule with FFXIV client text (CSV)
Dockerfile, docker-compose.yml   Production image: Bun runtime, copies `src/` only
```

## Commands

```sh
bun install
bun run start                 # needs DISCORD_BOT_TOKEN in .env (copy .env.example)
bun run typecheck             # tsc --noEmit
bun run lint                  # eslint .; `lint:fix` rewrites files
bun run test                  # bun test; one file: bun test tests/store.test.ts
bun run build:dict            # updates the submodule from its remote (network), then regenerates dictionaries
bun run scripts/build-dict.ts # regenerate from the data already checked out
docker compose config --quiet && docker compose up -d --build
```

Husky runs `lint-staged` on commit: `eslint --cache --fix` for `*.{js,ts}`, `prettier --write` for `*.{json,md,yml,yaml,html}`. Before finishing a change, run `typecheck`, `lint`, and the affected tests; run the full `test` for changes to `store`, `monitor`, `cleanup`, `tasks`, or locales. Tests need no network or Discord token; keep them that way by using the fakes in [tests/helpers.ts](tests/helpers.ts).

## Secrets / .env

`DISCORD_BOT_TOKEN` is the only secret. `.env` is Git-ignored; edit `.env.example` only for variable names and safe defaults. Never log, echo, commit, or put the token into Docker image layers. The bot uses only the `Guilds` intent and needs no Administrator, Manage Messages, or privileged intents; do not add permissions or intents without updating the README permission tables. Runtime data (`data/`, `backups/`) is Git-ignored.

## Conventions

- Bun-only runtime: `bun:sqlite`, `import.meta.dir`, and other Bun APIs are allowed. ESM (`"type": "module"`); local imports have no file extension.
- TypeScript is `strict` with `noUncheckedIndexedAccess` and `noImplicitOverride`; handle `undefined` from indexed access instead of asserting. Prettier defaults with double quotes; imports sorted by `simple-import-sort`.
- **All user-visible text and log text comes from locale packs.** Never hard-code strings in commands, services, or embeds. A new message goes into the `Locale` interface ([types/locale.ts](src/types/locale.ts)) and **all six** packs `src/locales/{en,chs,de,fr,ja,ko}.ts` in the same change; the type checker enforces that every pack implements `Locale`.
- **Logging** goes through `logger.info|warn|error(module, event, context)` with typed `LogModule`/`LogEvent` keys, never `console.*`. Put variable data in `context`, not in the message; pass caught errors as `context.error`.
- **Generated dictionaries are read-only.** Never edit `src/locales/generated/*.ts` by hand; change `scripts/build-dict.ts` or the source data and regenerate. Translate game terms per [src/locales/README.md](src/locales/README.md) (align by table name and row ID; keep English when no client translation exists; never invent names). The `ffxiv-data` submodule is updated daily by `.github/workflows/update-ffxiv-data.yml`; do not bump it as part of an unrelated change.
- **Stable identifiers.** Filter values in `constants/recruitment.ts`, SQLite column names, and stored identifiers must not be localized or renamed. Schema changes must keep existing databases working (the store has no migration framework today), so add an explicit, tested upgrade path.
- **Matching** uses RE2 via `re2js` against the English duty name plus the original recruitment comment. Never use the JavaScript `RegExp` engine for user-supplied patterns, and never match against translated text.
- **Discord limits:** check embed, field, select-option, and message length limits after localization; truncate deliberately.
- **Delivery state:** message IDs and content hashes are saved only after a send or edit succeeds; failed deletions keep their records for retry. Monitoring, manual cleanup, and scheduled cleanup share the serial queue in `services/tasks.ts`; do not run them outside it.
- A network or Discord API failure must not lose subscriptions or delete delivery records. Handle expected Discord API errors with `hasDiscordCode` from `utils/discord-error.ts`.
- **New command:** add `src/commands/<name>.ts` exporting `data` and `execute`; `index.ts` loads it automatically. Add its description to every locale pack, update the README command table, and add tests.
- **Website changes:** parsing lives in `services/fetcher.ts`. Cover normal listings, empty listings, and invalid pages in `tests/fetcher.test.ts`. Keep the 30 s timeout and 16 MiB HTML limit.
- Comments are Chinese or English; follow the surrounding file. Comment non-obvious behavior, not control flow.
- Commit messages use Conventional Commits (`feat:`, `fix:`, `docs:`, `chore:`, `ci:`). Dictionary refreshes use `chore: update FFXIV data and dictionary`.

## Docs

User-facing behavior is documented in [README.md](README.md) and its Simplified Chinese counterpart [docs/README-chs.md](docs/README-chs.md); the locale source notes exist as `src/locales/README.md` and `README-chs.md`. Update both languages together, and keep the README file-layout tree, environment variable table, and command table in sync with the code.
