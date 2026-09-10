# Decision log

Choices about fantasy-web that the code shows but cannot explain, one line each. The format and
the rules live in the monorepo root `DECISIONS.md`; decisions that span repos go there instead.

---

[2026-09-10] fantasy-web: icons are drawn by `@ng-icons/lucide` behind `<app-icon>`, not hand-copied into a template — copying each new icon by hand is how the set drifted to six stroke widths; `lucide-angular` was rejected because its peer range stops at Angular 21, and the earlier claim (#591) that this ruled out a package was wrong, since `@ng-icons/lucide` supports Angular 22.
[2026-09-10] fantasy-web: the "From scratch" starting point uses `square-dashed`, not `pencil` or a new-file icon — the pencil already means "edit" (change a pick, rename a projection), and all three cards create a projection, so what sets this one apart is that it starts empty.
[2026-09-11] fantasy-web: the note under the AI projection preview names its data source and not its method — the old line described a three-season, age-adjusted blend, which left out most of what the model now does (fitted availability, league level, finishing table, depth charts) and would go stale with every model version, while the MoneyPuck credit is the part the terms actually require.
