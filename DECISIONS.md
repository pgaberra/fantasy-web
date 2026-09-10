# Decision log

Choices about fantasy-web that the code shows but cannot explain, one line each. The format and
the rules live in the monorepo root `DECISIONS.md`; decisions that span repos go there instead.

---

[2026-09-10] fantasy-web: icons are drawn by `@ng-icons/lucide` behind `<app-icon>`, not hand-copied into a template — copying each new icon by hand is how the set drifted to six stroke widths; `lucide-angular` was rejected because its peer range stops at Angular 21, and the earlier claim (#591) that this ruled out a package was wrong, since `@ng-icons/lucide` supports Angular 22.
[2026-09-10] fantasy-web: the "From scratch" starting point uses `square-dashed`, not `pencil` or a new-file icon — the pencil already means "edit" (change a pick, rename a projection), and all three cards create a projection, so what sets this one apart is that it starts empty.
[2026-09-11] fantasy-web: the note under the AI projection preview names its data source and not its method — the old line described a three-season, age-adjusted blend, which left out most of what the model now does (fitted availability, league level, finishing table, depth charts) and would go stale with every model version, while the MoneyPuck credit is the part the terms actually require.
[2026-09-11] fantasy-web: "Import league" uses Lucide's `import` (an arrow into a tray), not `refresh` or `download` — `refresh` stays with what genuinely syncs again ("Re-sync or change league", the player list notice), so importing and re-syncing no longer look like the same action, and `download` reads as saving a file to the user's machine, when this pulls settings into the app.
[2026-09-11] fantasy-web: icon sizes are a type (`IconSize`: 14, 16, 20, 48 or an `em` length), not a documented scale — with only the prose, the app drifted to 12, 13, 15, 18 and 22 as well; buttons and menus went from 15 up to 16 rather than down to 14, because 14 is the size for an icon inside running text, and 48 joined the scale because both empty and error states already used it on purpose.
